"use client";
/* The app's side of the session log: every change worth knowing when something goes wrong (Live on or off, folded,
   mic muted, the orb, the open chat and page, the player), sent to the server's recorder (backend trace.py). Her
   words and private values are not sent from here: the server already logs what it heard, without private values. */
import { API, getToken } from "./account";
import { clientLog } from "./engine/remote";
import { useApp } from "./store";

if (typeof window !== "undefined") {
  useApp.subscribe((s, p) => {
    if (s.live !== p.live) clientLog("live", { on: s.live });
    if (s.liveSmall !== p.liveSmall) clientLog("live_folded", { on: s.liveSmall });
    if (s.showPage !== p.showPage) clientLog("live_show_page", { on: s.showPage });
    if (s.orb !== p.orb) clientLog("orb", { state: s.orb, was: p.orb });
    if (s.activeId !== p.activeId) clientLog("open_chat", { task: s.activeId });
    if (s.sheetOpen !== p.sheetOpen) clientLog("chat_sheet", { open: s.sheetOpen });
    if (s.playing?.id !== p.playing?.id) clientLog("player", { playing: s.playing ? s.playing.name : null, type: s.playing?.type });
    if (s.lang !== p.lang) clientLog("language", { lang: s.lang });
    const t = s.tasks.find((x) => x.id === s.activeId), q = p.tasks.find((x) => x.id === p.activeId);
    if (t && q && t.id === q.id && t.url !== q.url) clientLog("page_url", { task: t.id, url: t.url });
    if (t && q && t.id === q.id && t.status !== q.status) clientLog("task_status", { task: t.id, status: t.status });
  });
  window.addEventListener("error", (e) => clientLog("app_error", { message: String(e.message).slice(0, 300) }));
  window.addEventListener("unhandledrejection", (e) => clientLog("app_error", { message: String(e.reason).slice(0, 300) }));
}

/** Save her session log as a text file (Profile > Download session log). */
export async function downloadSessionLog(): Promise<boolean> {
  if (!API || !getToken()) return false;
  try {
    const r = await fetch(`${API}/trace`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!r.ok) return false;
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jagora-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  } catch {
    return false;
  }
}

/** Start a fresh log, before a test. */
export async function clearSessionLog(): Promise<boolean> {
  if (!API || !getToken()) return false;
  try {
    return (await fetch(`${API}/trace/clear`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } })).ok;
  } catch {
    return false;
  }
}
