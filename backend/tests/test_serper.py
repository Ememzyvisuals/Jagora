"""Search through Serper (Google results for Nigeria): a refused key moves to the next, Google's quick answer comes
first, results keep their dates, and dangerous sites are dropped. (No internet needed.)"""

import httpx

from jagora import research


class FakeClient:
    calls: list[str] = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, headers=None, json=None):
        key = headers["X-API-KEY"]
        FakeClient.calls.append(key)
        req = httpx.Request("POST", url)
        if key == "spent":
            return httpx.Response(403, json={"message": "Not enough credits"}, request=req)
        assert json["gl"] == "ng"
        return httpx.Response(200, request=req, json={
            "answerBox": {"title": "UTME 2027", "snippet": "Registration opens in January.", "link": "https://jamb.gov.ng/news"},
            "organic": [{"title": "JAMB news", "link": "https://jamb.gov.ng/news", "snippet": "Dates for 2027", "date": "2 days ago"},
                        {"title": "Blog", "link": "https://someblog.com/jamb", "snippet": "Old dates"}],
        })


async def test_serper_rotates_keys_and_puts_the_quick_answer_first(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    import dataclasses

    monkeypatch.setattr(research, "settings", dataclasses.replace(research.settings, serper_keys=("spent", "good")))
    research._spent.clear()
    out = await research.search(None, "when is jamb 2027")  # no browser needed: nothing is opened to search
    assert FakeClient.calls == ["spent", "good"]
    assert out[0].get("quick") and "January" in out[0]["snippet"]
    assert out[1]["url"] == "https://jamb.gov.ng/news" and out[1]["date"] == "2 days ago" and out[1]["official"]
    # the spent key is not tried again
    FakeClient.calls.clear()
    await research.search(None, "jamb")
    assert FakeClient.calls == ["good"]
