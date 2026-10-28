"use client";

/* Jagora can see and drive the app itself, not only websites (like the Kivo shop agent drives its page).

   describeScreen(): a short plain description of what is on her screen right now (which screen, the open chat, the
   live page, her other chats, settings). It goes to the server with everything she says, so "close this" or "go back
   to my last chat" means what she is looking at.

   runApp(): carries out the agent's app_control commands. Store settings change here directly; the phone and
   desktop layouts change their own screens through the "jagora:app" event. */
import { aminaHidden, setAminaHidden } from "@/components/mascot/Amina";
import { toggleFullscreen } from "@/components/Pwa";
import { LANGS, type Lang } from "./i18n";
import { activeTask, useApp } from "./store";
import { getTheme, setTheme } from "./theme";
import { deleteChats } from "./sync";

/** what each layout reports about itself (phone: which screen; desktop: sidebar, page hidden) */
const facts: Record<string, string> = {};
export function reportScreen(key: string, value: string) {
  facts[key] = value;
}

const desktop = () => typeof window !== "undefined" && matchMedia("(min-width: 1024px)").matches;

/** chats in the order they are listed (newest first), so "the second one" means the same to her and to Jagora */
const listed = () => useApp.getState().tasks.slice(0, 12);

export function describeScreen(): string {
  if (typeof window === "undefined") return "";
  const s = useApp.getState();
  const t = activeTask(s);
  const lines: string[] = [];
  lines.push(`Device: ${desktop() ? "computer" : "phone"}. Screen: ${facts.screen || "home"}${facts.extra ? ` (${facts.extra})` : ""}.`);
  if (t) {
    const page = t.kind === "browse" && t.url ? ` Live page: ${s.pageTitle || t.url} (${t.url})${facts.pageShown === "no" ? ", hidden" : ", showing"}.` : "";
    lines.push(`Open chat: "${t.title}" (${t.status}).${page}`);
  } else lines.push("No chat open (the start screen with suggestions and her top sites).");
  if (!desktop()) lines.push(`Chat panel: ${s.sheetOpen ? "open" : "closed"}.`);
  if (s.playing?.queue && s.playing.queue.length > 1)
    lines.push(`Video list on her screen (${s.playing.preview ? "previews" : "playing"}): ` + s.playing.queue.map((q, i) => `${i + 1}. "${q.name}"${i === s.mediaAt ? " (now)" : ""}`).join("; ") + ". media_next and media_previous move through it.");
  if (s.playing) lines.push(`Playing on her screen now: "${s.playing.queue?.[s.mediaAt]?.name ?? s.playing.name}" (${s.playing.type === "youtube" ? "YouTube video" : s.playing.type}). Do not start it again; stop_media closes it.`);
  if (s.live) lines.push(`Live voice: ${s.liveSmall || s.playing ? "folded to the small bar at the top" : "full screen"}.`);
  const chats = listed();
  if (chats.length)
    lines.push("Her chats, as listed: " + chats.map((c, i) => `${i + 1}. "${c.title}"${c.id === s.activeId ? " (open)" : ""}`).join("; ") + ".");
  lines.push(
    `Settings: language ${LANGS.find((l) => l.id === s.lang)?.name ?? s.lang}, mode ${s.mode === "do" ? "do it for me" : "guide me"}, ` +
      `live voice ${s.live ? "on" : "off"}, Jagora's voice ${s.muted ? "off" : "on"}, data saver ${s.dataSaver}, theme ${getTheme()}, ` +
      `full screen ${document.fullscreenElement ? "on" : "off"}, Amina ${aminaHidden() ? "hidden" : "shown"}.`,
  );
  return lines.join("\n");
}

function pickChat(value: string): string | null {
  const s = useApp.getState();
  const chats = listed();
  const v = value.trim().toLowerCase();
  if (!v || v === "this" || v === "current") return s.activeId;
  if (v === "last" || v === "previous" || v === "latest") return chats.find((c) => c.id !== s.activeId)?.id ?? null;
  const n = parseInt(v, 10);
  if (n >= 1 && n <= chats.length) return chats[n - 1].id;
  return chats.find((c) => c.title.toLowerCase().includes(v))?.id ?? null;
}

const tell = (action: string, value = "") => window.dispatchEvent(new CustomEvent("jagora:app", { detail: { action, value } }));

export function runApp(action: string, value = "") {
  const s = useApp.getState();
  const on = !/^(off|no|false|hide|hidden)$/i.test(value.trim());
  switch (action) {
    case "show_page":
      if (s.live) s.setShowPage(true);
      s.setSheet(false);
      return tell("show_page");
    case "hide_page":
      if (s.live) s.setShowPage(false);
      return tell("hide_page");
    case "show_chat":
      s.setSheet(true);
      return tell("show_chat");
    case "hide_chat":
      s.setSheet(false);
      return tell("hide_chat");
    case "show_tabs":
    case "hide_tabs":
    case "show_history":
    case "hide_history":
    case "go_home":
      return tell(action);
    case "open_chat": {
      const id = pickChat(value);
      if (id) {
        s.setActive(id);
        const t = useApp.getState().tasks.find((x) => x.id === id);
        if (!(t?.kind === "browse" && t.url)) s.setSheet(true); // a chat without a page: show the conversation
        tell("open_chat", id);
      }
      return;
    }
    case "new_chat":
      s.setActive(null);
      s.setSheet(true);
      return tell("new_chat");
    case "close_chat": {
      const id = pickChat(value);
      if (id) {
        s.closeTask(id);
        deleteChats([id]);
      }
      return tell("go_home");
    }
    case "scroll_chat": {
      const box = [...document.querySelectorAll<HTMLElement>("[data-chat-scroll]")].find((e) => e.offsetParent !== null);
      if (!box) return;
      const v = value.toLowerCase();
      const top = v === "top" ? 0 : v === "bottom" ? box.scrollHeight : box.scrollTop + (v === "up" ? -1 : 1) * box.clientHeight * 0.8;
      return box.scrollTo({ top, behavior: "smooth" });
    }
    case "set_language":
      if (LANGS.some((l) => l.id === value)) s.setLang(value as Lang);
      return;
    case "set_mode":
      if (value === "do" || value === "guide") s.setMode(value);
      return;
    case "voice":
      return s.setMuted(!on);
    case "data_saver":
      return s.setDataSaver(value === "auto" ? "auto" : on ? "on" : "off");
    case "theme":
      return setTheme(value === "dark" ? "dark" : "light");
    case "fullscreen":
      if (!!document.fullscreenElement !== on) void toggleFullscreen();
      return;
    case "end_live":
      return s.setLive(false);
    case "hide_live": // fold the Live screen down; the call goes on
      return s.setLiveSmall(true);
    case "show_live":
      if (!s.live) return s.setLive(true);
      return s.setLiveSmall(false);
    case "stop_media":
      return s.setPlaying(null);
    case "media_next":
      return s.setMediaAt(s.mediaAt + 1);
    case "media_previous":
      return s.setMediaAt(s.mediaAt - 1);
    case "media_pause":
    case "media_play":
      return void window.dispatchEvent(new CustomEvent("jagora:media", { detail: action === "media_pause" ? "pause" : "play" }));
    case "amina":
      return setAminaHidden(!on);
    case "my_details":
      window.location.href = "/app/details";
      return;
  }
}

// for tests in development builds only
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production")
  (window as unknown as { __appctl?: unknown }).__appctl = { describeScreen, runApp, store: useApp };
