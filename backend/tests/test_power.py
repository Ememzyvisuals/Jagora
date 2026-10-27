"""The saved-login vault, a scheduled run that signs in on its own, and pages shown in her language."""

import asyncio
import functools
import http.server
import json
import os
import threading
import time

import pytest

os.environ.setdefault("JAGORA_NO_INGEST", "1")

from jagora.browser import Browser  # noqa: E402
from jagora.db import DB  # noqa: E402
from jagora.llm import Model, Reply, ToolCall, Usage  # noqa: E402
from jagora.vault import Vault  # noqa: E402

LOGIN = """<!doctype html><title>Portal sign in</title><h1>Candidate portal</h1>
<form onsubmit="event.preventDefault(); document.body.innerHTML = '<h1>Welcome back</h1><p>Signed in as ' + document.getElementById('e').value + '</p>'">
<label for=e>Email</label><input id=e type=email name=email>
<label for=p>Password</label><input id=p type=password name=password>
<button type=submit>Sign in</button></form>"""
ARTICLE = """<!doctype html><title>History</title><main><h1>The Oyo Empire</h1>
<p>The Oyo Empire was a powerful Yoruba state in West Africa.</p><p>Its capital was Oyo-Ile.</p>
<nav><a href="/x">Menu link</a></nav></main>"""


@pytest.fixture(scope="module")
def portal(tmp_path_factory):
    root = tmp_path_factory.mktemp("portal")
    (root / "login.html").write_text(LOGIN)
    (root / "article.html").write_text(ARTICLE)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


@pytest.fixture()
async def db(tmp_path, monkeypatch):
    import dataclasses

    from jagora import db as dbmod

    monkeypatch.setattr(dbmod, "settings", dataclasses.replace(dbmod.settings, sqlite_path=str(tmp_path / "v.db"), turso_url=""))
    d = DB()
    await d.start()
    yield d
    await d.close()


async def test_vault_is_encrypted_and_bound_to_its_site(db):
    v = Vault(db, "u1")
    assert await v.save("JAMB password", "https://efacility.jamb.gov.ng/login", "password", "S3cret!pass") == "jamb.gov.ng"
    row = await db.one("select * from vault")
    assert "S3cret" not in json.dumps(row)  # only ciphertext is stored
    assert (await v.take("JAMB password", "https://portal.jamb.gov.ng/x"))[0] == "S3cret!pass"
    value, why = await v.take("JAMB password", "https://jamb-portal-login.com")
    assert value is None and ("not safe" in why or "only" in why)
    value, why = await v.take("JAMB password", "https://www.waec.org.ng")
    assert value is None and "jamb.gov.ng only" in why
    assert (await Vault(db, "someone-else").take("JAMB password", "https://jamb.gov.ng"))[0] is None
    assert await v.names() == [{"name": "JAMB password", "site": "jamb.gov.ng", "field": "password"}]


class SignIn(Model):
    def __init__(self, base):
        self.base, self.turn, self.usage = base, 0, Usage()

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        page = messages[1]["content"][0]["text"]

        def num(label):
            line = next(ln for ln in page.splitlines() if f'"{label}"' in ln and ln.startswith("["))
            return int(line[1:line.index("]")])

        if self.turn == 0:
            calls = [("go_to", {"url": self.base + "/login.html"})]
        elif self.turn == 1:
            assert '"portal email" for 127.0.0.1' in page and "SCHEDULED run" in page
            calls = [("use_saved_login", {"element": num("Email"), "name": "portal email"}),
                     ("use_saved_login", {"element": num("Password"), "name": "portal password"}),
                     ("click", {"element": num("Sign in")})]
        else:
            assert "Welcome back" in page
            calls = [("finish", {"summary": "Signed in to the portal.", "success": True})]
        self.turn += 1
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 0, 0)
        self.usage.add(r, kind)
        return r


async def test_scheduled_run_signs_in_with_saved_login(db, portal, monkeypatch):
    from jagora import server

    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "_model", lambda: SignIn(portal))
    v = Vault(db, "u1")
    await v.save("portal email", portal + "/login.html", "email", "bisi@example.com")
    await v.save("portal password", portal + "/login.html", "password", "hunter22!")
    mem = server.DbMemory("u1", "chat9", "en")
    await mem.schedule(time.time() - 1, "Sign in to the candidate portal", ["127.0.0.1"], "none")
    await server.fire_jobs()
    n = await db.one("select * from notices where user_id='u1'")
    assert n and "Signed in" in n["text"]
    payload = json.loads(n["payload"])
    assert any(m["kind"] == "step" and "Approved earlier" in m["text"] for m in payload)
    assert "hunter22" not in n["payload"] and "hunter22" not in json.dumps(await db.exec("select * from messages"))
    assert (await db.one("select status from jobs"))["status"] == "done"


async def test_page_shown_in_her_language_while_agent_reads_original(portal):
    async def fake(texts, lang):
        return [f"[{lang}] {t}" for t in texts]

    async with Browser() as b:
        b.translator = fake
        await b.goto(portal + "/article.html")
        await b.set_translate("yo")
        await asyncio.sleep(0.8)
        shown = await b.page.evaluate("document.querySelector('main p').textContent")
        assert shown.startswith("[yo] The Oyo Empire was")
        snap = await b.snapshot(marks=False)
        assert "[yo]" not in snap.text and "powerful Yoruba state" in snap.text  # the agent reads the original
        await asyncio.sleep(0.3)
        assert (await b.page.evaluate("document.querySelector('main p').textContent")).startswith("[yo]")  # she still sees hers
        assert (await b.find_text("capital was Oyo-Ile"))
        assert await b.page.evaluate("document.querySelector('nav a').textContent") == "Menu link"  # menus stay
        await b.set_translate("")
        assert (await b.page.evaluate("document.querySelector('main p').textContent")).startswith("The Oyo")


async def test_dark_mode_save_pages_and_codes(portal):
    import pymupdf

    async with Browser() as b:
        await b.goto(portal + "/article.html")
        assert "made by Jagora" in await b.set_theme("dark")
        assert await b.page.evaluate("!!document.getElementById('__jg_theme')")
        assert await b.set_theme("light") == "light"
        pdf = await b.print_pdf()
        assert pdf.startswith(b"%PDF")
        assert (await b.full_screenshot())[:4] == b"\x89PNG"
        await b.goto(portal + "/login.html")
        await b.page.evaluate("document.body.insertAdjacentHTML('beforeend', '<a href=/article.html>History</a>')")
        data, done = await b.site_pdf(5)
        assert len(done) == 2 and pymupdf.open(stream=data, filetype="pdf").page_count >= 2
        # a code arrives in her mail (another tab); it goes into the box without the model seeing it
        await b.new_tab("data:text/html,<p>Your verification code is 482913. It expires in 10 minutes.</p>")
        assert await b.code_in_tab(1) == "482913"


async def test_busy_site_is_retried_later(db, monkeypatch):
    from jagora import server

    monkeypatch.setattr(server, "db", db)
    calls = []

    async def fake_run(job, last_try=True):
        calls.append(last_try)
        return False  # the portal was down

    monkeypatch.setattr(server, "run_job", fake_run)
    await server.DbMemory("u1", "c1", "en").schedule(time.time() - 1, "download my JAMB printout", ["jamb.gov.ng"], "none", 30)
    await server.fire_jobs()
    j = await db.one("select * from jobs")
    assert calls == [False] and j["status"] == "waiting" and j["at"] > time.time() + 25 * 60 and j["tries"] == 1
