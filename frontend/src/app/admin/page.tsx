"use client";

/* The owner's monitoring page: who is on Jagora right now, what each person asked, whether it worked, and which
   access code they came with, so he knows when the judges are testing. Opened with the ADMIN_CODE from the server's
   .env. It never shows passwords, saved logins or the codes themselves, only their labels (Code 1, Code 2...). */
import { ArrowClockwise, CheckCircle, Circle, Desktop, DeviceMobile, SignOut, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { API } from "@/lib/account";

type Live = { user_id: string; who: string; email: string; code: string; plan: string; since: number; doing: string; device: string };
type User = { id: string; email: string; name: string; plan: string; code: string; created: number; last_seen: number; credits: number; tasks: number; done: number; online: boolean; flags: number };
type Ev = { t: number; user_id: string; kind: string; detail: string; who: string; code: string };
type Overview = { now: number; live: Live[]; today: { tasks: number; done: number; people: number; usd: number }; users: User[]; events: Ev[]; model: boolean; speech: boolean };

const KEY = "jagora:admin";
const get = () => {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};
const put = (t: string) => {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {}
};

function ago(t: number, now: number) {
  if (!t) return "never";
  const s = Math.max(0, Math.round(now - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

function Tag({ code, plan }: { code: string; plan?: string }) {
  const label = code || (plan === "free" ? "No code" : plan || "");
  if (!label) return null;
  const admin = label === "admin";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${admin ? "bg-ink text-paper" : code ? "bg-accent-soft text-accent" : "bg-mist text-ink-2"}`}>
      {admin ? "You" : label}
    </span>
  );
}

function What({ e }: { e: Ev }) {
  if (e.kind === "done" || e.kind === "stopped") {
    let d: { goal?: string; secs?: number; steps?: number; summary?: string; usd?: number } = {};
    try {
      d = JSON.parse(e.detail);
    } catch {}
    return (
      <span>
        {e.kind === "done" ? "Finished" : "Stopped"}: {d.goal}{" "}
        <span className="text-ink-3">
          ({dur(d.secs || 0)}, {d.steps} steps{d.usd ? `, $${d.usd}` : ""})
        </span>
        {d.summary && <span className="mt-0.5 block text-ink-2">{d.summary}</span>}
      </span>
    );
  }
  const words: Record<string, string> = {
    signup: "Signed up", signin: "Signed in", open: "Opened Jagora", leave: "Left after", task: "Asked", error: "Error",
    blocked: "Jagora blocked", refused: "Jagora refused", injection: "Hijack attempt removed on", push: "Turned on",
  };
  return (
    <span>
      {words[e.kind] || e.kind}
      {e.kind === "open" ? <span className="text-ink-3"> on {/Mobile|Android|iPhone/.test(e.detail) ? "a phone" : "a computer"}</span> : e.detail && e.kind !== "signin" && e.kind !== "signup" ? `: ${e.detail}` : ""}
    </span>
  );
}

function Icon({ kind }: { kind: string }) {
  if (kind === "done") return <CheckCircle size={18} weight="fill" className="text-ok" />;
  if (kind === "error" || kind === "stopped" || kind === "blocked" || kind === "refused" || kind === "injection") return <WarningCircle size={18} weight="fill" className="text-danger" />;
  return <Circle size={9} weight="fill" className={kind === "task" ? "text-accent" : "text-ink-3"} />;
}

export default function Admin() {
  const [token, setTok] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [open, setOpen] = useState<User | null>(null);
  const [chats, setChats] = useState<{ chat_id: string; title: string; updated: number }[]>([]);
  const [msgs, setMsgs] = useState<{ t: number; role: string; text: string }[] | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => setTok(get()), []);

  const load = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${API}/admin/overview`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!r) return setErr("Cannot reach the server.");
    if (r.status === 401) {
      put("");
      setTok("");
      return;
    }
    setErr("");
    setData(await r.json());
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const r = await fetch(`${API}/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
    if (!r) return setErr("Cannot reach the server.");
    const j = await r.json();
    if (!r.ok) return setErr(j.message || "That is not the admin code.");
    put(j.token);
    setTok(j.token);
    setCode("");
  };

  const openUser = async (u: User) => {
    setOpen(u);
    setMsgs(null);
    const r = await fetch(`${API}/admin/user/${u.id}`, { headers: { Authorization: `Bearer ${token}` } });
    setChats((await r.json()).chats || []);
  };
  const openChat = async (chat: string) => {
    if (!open) return;
    const r = await fetch(`${API}/admin/chat/${open.id}/${encodeURIComponent(chat)}`, { headers: { Authorization: `Bearer ${token}` } });
    setMsgs((await r.json()).messages || []);
  };

  if (!token)
    return (
      <main className="grid min-h-dvh place-items-center bg-mist px-4">
        <form onSubmit={login} className="w-full max-w-[380px] rounded-[28px] bg-paper p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,.35)]">
          <h1 className="text-[30px] leading-tight">Jagora admin</h1>
          <p className="mt-1.5 text-[16px] text-ink-2">Enter the admin code from the server.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="JAGORA-ADMIN-..."
            autoComplete="off"
            className="mt-5 h-12 w-full rounded-[14px] border border-ink/15 bg-paper px-4 font-mono text-[15px] uppercase outline-none focus:border-accent"
          />
          {err && <p className="mt-2 text-[14.5px] font-semibold text-danger">{err}</p>}
          <button className="btn btn-ink mt-4 h-12 w-full text-[16px]">Open</button>
        </form>
      </main>
    );

  const now = data?.now || Date.now() / 1000;
  const others = (data?.users || []).filter((u) => u.plan !== "admin");
  const events = (data?.events || []).filter((e) => (filter === "tasks" ? ["task", "done", "stopped", "error"].includes(e.kind) : filter === "judges" ? e.code && e.code !== "admin" : true));
  const judgesSeen = others.filter((u) => u.code).length;

  return (
    <main className="min-h-dvh overflow-x-hidden bg-mist pb-16">
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3 md:px-6">
          <h1 className="shrink-0 text-[22px]">Jagora admin</h1>
          <span className="ml-1 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2">
            <span className={`h-2 w-2 rounded-full ${data?.model ? "bg-ok" : "bg-danger"}`} /> Model
            <span className={`ml-2 h-2 w-2 rounded-full ${data?.speech ? "bg-ok" : "bg-danger"}`} /> Voice
          </span>
          <span className="ml-auto hidden text-[13px] text-ink-3 sm:inline">Updates every 8 seconds</span>
          <button onClick={load} aria-label="Refresh" className="grid h-9 w-9 place-items-center rounded-full hover:bg-mist">
            <ArrowClockwise size={18} />
          </button>
          <button
            onClick={() => {
              put("");
              setTok("");
            }}
            aria-label="Sign out"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-mist"
          >
            <SignOut size={18} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 pt-5 md:px-6">
        {err && <p className="mb-3 rounded-[14px] bg-danger-soft px-4 py-2.5 text-[15px] font-semibold text-danger">{err}</p>}

        {/* today */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["On now", data?.live.filter((l) => l.plan !== "admin").length ?? 0],
            ["Tasks today", data?.today.tasks ?? 0],
            ["Finished today", data?.today.done ?? 0],
            ["Judges so far", judgesSeen],
            ["Model cost today", `$${(data?.today.usd ?? 0).toFixed(2)}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[20px] bg-paper px-4 py-3.5">
              <p className="text-[13.5px] font-semibold text-ink-2">{k}</p>
              <p className="font-head mt-1 text-[30px] leading-none">{v}</p>
            </div>
          ))}
        </section>

        {/* live */}
        <section className="mt-6">
          <h2 className="text-[19px]">On Jagora now</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(data?.live || []).length === 0 && <p className="rounded-[20px] bg-paper px-4 py-4 text-[15.5px] text-ink-2">Nobody is on right now.</p>}
            {(data?.live || []).map((l) => (
              <div key={l.user_id} className="flex items-start gap-3 rounded-[20px] bg-paper px-4 py-3.5">
                <span className="relative mt-1.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                    {l.who} <Tag code={l.code} plan={l.plan} />
                    <span className="text-ink-3">{l.device === "phone" ? <DeviceMobile size={16} /> : <Desktop size={16} />}</span>
                  </p>
                  <p className="text-[14px] text-ink-3">
                    {l.email} · on for {dur(Math.round(now - l.since))}
                  </p>
                  <p className="mt-1 text-[15px] text-ink-2">{l.doing ? `Working on: ${l.doing}` : "Not running a task"}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          {/* activity */}
          <section className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[19px]">Activity</h2>
              <div className="ml-auto flex gap-1 rounded-full bg-paper p-1">
                {["all", "tasks", "judges"].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-[13.5px] font-semibold capitalize ${filter === f ? "bg-ink text-paper" : "text-ink-2"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <ol className="mt-3 overflow-hidden rounded-[20px] bg-paper">
              {events.length === 0 && <li className="px-4 py-4 text-[15.5px] text-ink-2">Nothing yet.</li>}
              {events.map((e, i) => (
                <li key={i} className="flex gap-3 border-b border-ink/5 px-4 py-3 last:border-0">
                  <span className="grid w-5 shrink-0 place-items-center pt-0.5">
                    <Icon kind={e.kind} />
                  </span>
                  <div className="min-w-0 flex-1 text-[15px] leading-snug">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{e.who}</span> <Tag code={e.code} />
                      <span className="ml-auto text-[13px] text-ink-3" title={new Date(e.t * 1000).toString()}>
                        {clock(e.t)} · {ago(e.t, now)}
                      </span>
                    </p>
                    <p className="mt-0.5 break-words text-ink-2">
                      <What e={e} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* people */}
          <section className="min-w-0">
            <h2 className="text-[19px]">People</h2>
            <div className="mt-3 overflow-hidden rounded-[20px] bg-paper">
              {(data?.users || []).map((u) => (
                <button key={u.id} onClick={() => openUser(u)} className="flex w-full items-center gap-3 border-b border-ink/5 px-4 py-3 text-left last:border-0 hover:bg-mist/60">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${u.online ? "bg-ok" : "bg-mist-2"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[15.5px] font-semibold">
                      <span className="truncate">{u.name || u.email}</span> <Tag code={u.code} plan={u.plan} />
                      {u.flags >= 3 && (
                        <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[12px] font-semibold text-danger" title="Blocked sites or refused requests in the last day">
                          {u.flags} blocked tries
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[13.5px] text-ink-3">
                      {u.email} · joined {ago(u.created, now)} · seen {u.online ? "now" : ago(u.last_seen, now)}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-[13.5px] text-ink-2">
                    <b className="font-head text-[18px] text-ink">{u.tasks}</b> {u.tasks === 1 ? "task" : "tasks"}
                    <br />
                    {u.done} done
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* one person's chats */}
      {open && (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={() => setOpen(null)}>
          <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[520px] flex-col bg-paper">
            <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[17px] font-semibold">
                  <span className="truncate">{open.name || open.email}</span> <Tag code={open.code} plan={open.plan} />
                </p>
                <p className="truncate text-[13.5px] text-ink-3">{open.email}</p>
              </div>
              <button onClick={() => (msgs ? setMsgs(null) : setOpen(null))} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-mist">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!msgs &&
                (chats.length ? (
                  chats.map((c) => (
                    <button key={c.chat_id} onClick={() => openChat(c.chat_id)} className="mb-2 block w-full rounded-[16px] bg-mist px-4 py-3 text-left hover:bg-mist-2">
                      <p className="text-[15.5px] font-semibold">{c.title || "Untitled"}</p>
                      <p className="text-[13px] text-ink-3">{ago(c.updated, now)}</p>
                    </button>
                  ))
                ) : (
                  <p className="text-[15.5px] text-ink-2">No chats yet.</p>
                ))}
              {msgs &&
                msgs.map((m, i) => (
                  <div key={i} className={`mb-2 flex ${m.role === "user" ? "justify-end" : ""}`}>
                    <p className={`max-w-[85%] whitespace-pre-wrap rounded-[16px] px-3.5 py-2 text-[15px] ${m.role === "user" ? "bg-ink text-paper" : "bg-mist"}`}>
                      {m.text.length > 1200 ? m.text.slice(0, 1200) + "..." : m.text}
                      <span className={`mt-1 block text-[11.5px] ${m.role === "user" ? "text-paper/60" : "text-ink-3"}`}>{clock(m.t)}</span>
                    </p>
                  </div>
                ))}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
