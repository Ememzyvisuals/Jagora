"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Lang } from "./i18n";

export type Mode = "guide" | "do";

export type Profile = {
  full_name: string;
  phone: string;
  email: string;
  date_of_birth: string; // YYYY-MM-DD
  gender: "" | "female" | "male";
  state: string;
};
export const EMPTY_PROFILE: Profile = { full_name: "", phone: "", email: "", date_of_birth: "", gender: "", state: "" };

/** A document Jagora wrote: structured, so it can be shown as a designed page and exported to PDF, Word and Markdown. */
export type DocBlock =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "list"; items: string[]; ordered?: boolean }
  | { t: "table"; head: string[]; rows: string[][]; caption?: string }
  | { t: "note"; text: string };
export type JDoc = { title: string; subtitle?: string; kind: string; summary: string[]; blocks: DocBlock[]; sources: { title: string; url: string }[]; created: number; lang: string };
export type SecretField = "account" | "nin" | "bvn" | "otp" | "pin" | "password" | "phone" | "card" | "other";
export type Attachment = { kind: "image" | "doc" | "link"; name: string; url?: string };

export type Msg =
  /** voice: she spoke it (a voice note or a live turn); audio: the recording (data URL) so she can play it back;
      heard: false when Jagora could not make out the words */
  | { id: string; kind: "user"; text: string; attachment?: Attachment; voice?: boolean; audio?: string; secs?: number; heard?: boolean }
  | { id: string; kind: "agent"; text: string }
  | { id: string; kind: "step"; text: string; status: "doing" | "done" | "stopped"; guard?: boolean }
  | { id: string; kind: "confirm"; question: string; detail?: string; value?: string; status: "waiting" | "yes" | "no" }
  | { id: string; kind: "choice"; question: string; choices: string[]; picked?: string }
  | { id: string; kind: "handoff"; text: string; status: "waiting" | "done" }
  /** something she should type rather than say aloud (account number, NIN, BVN, OTP, PIN, password). The value goes
      straight to the website field; the app keeps only a masked hint, and it is never spoken or sent to the model. */
  | { id: string; kind: "secret"; label: string; field: SecretField; digits?: number; status: "waiting" | "done" | "skipped"; shown?: string }
  | { id: string; kind: "verdict"; verdict: "scam" | "safe" | "unsure"; title: string; reasons: string[]; link?: string }
  | { id: string; kind: "explain"; title: string; image: string; sections: { label: string; text: string; box: [number, number, number, number] }[] }
  | { id: string; kind: "doc"; doc: JDoc }
  /** proof for a fact: the highlighted part of the official page or PDF, with where it came from */
  | { id: string; kind: "evidence"; claim: string; quote: string; url: string; site: string; title: string; official: boolean; owner?: string; page?: number | null; date?: string; image: string }
  /** a file Jagora downloaded for her */
  | { id: string; kind: "file"; name: string; url: string; size: number; type: string; source?: string }
  /** Jagora's plan for a longer task, ticked off as it goes */
  | { id: string; kind: "plan"; steps: { text: string; status: "todo" | "doing" | "done" | "skipped" }[] }
  | { id: string; kind: "reminder"; at: number; text: string; repeat: string }
  | { id: string; kind: "moment"; title: string; tags: string[]; note: string; url: string }
  /** a song, voice note or video from a website, played here (Jagora's live view has no sound) */
  | { id: string; kind: "media"; name: string; url: string; type: string; size: number; source?: string }
  /** a task Jagora will do on its own later */
  /** a site's terms and privacy policy, read for her */
  | { id: string; kind: "reading"; read_by: string; name?: string; from?: string; summary: string; risk: "low" | "medium" | "high";
      facts: { label: string; value: string }[]; deadlines: { what: string; date: string }[]; asks_her_to: string[]; red_flags: string[]; next_steps: string[] }
  | { id: string; kind: "pictures"; title: string; panels: { caption: string; url: string }[] }
  | { id: string; kind: "terms"; site: string; verdict: "ok" | "caution" | "red"; summary: string; points: { level: "caution" | "red"; text: string }[]; urls?: string[] }
  /** Jagora is not sure what she means: she taps it on the live page */
  | { id: string; kind: "pointask"; question: string; status: "waiting" | "done" }
  | { id: string; kind: "scheduled"; at: number; goal: string; allow: string[]; repeat: string }
  | { id: string; kind: "result"; title: string; reference?: string; lines: [string, string][] }
  /** what Jagora did in a task: every site opened, box filled (values hidden), button pressed, approval and block,
      plus the sites the task was allowed to act on */
  | { id: string; kind: "record"; steps: { t: string; kind: string; text: string }[]; sites: string[]; success: boolean };

export type TaskStatus = "working" | "waiting" | "done" | "stopped";
export type Task = {
  id: string;
  title: string;
  kind: "browse" | "scam" | "paper" | "chat";
  url: string;
  status: TaskStatus;
  createdAt: number;
  messages: Msg[];
  /** she closed this chat's web page: the chat stays in her history, it is just no longer a tab */
  tabClosed?: boolean;
};

/** A tab is a website Jagora opened, like a browser tab. A chat with no page (a question, a scam check, a letter) is
    only in her chat history. */
export const isTab = (t: Task) => t.kind === "browse" && !!t.url && !t.tabClosed;

export type Pointer = { x: number; y: number; visible: boolean; clicking: boolean };
export type Highlight = { x: number; y: number; w: number; h: number; tone: "point" | "stop" } | null;
export type OrbMode = "idle" | "listening" | "thinking" | "speaking" | "working";

export const uid = () => Math.random().toString(36).slice(2, 10);

type State = {
  lang: Lang;
  mode: Mode;
  profile: Profile;
  onboarded: boolean;
  /** her avatar (lib/avatar.ts): "" until she picks one herself */
  avatar: string;
  setAvatar: (id: string) => void;
  tasks: Task[];
  activeId: string | null;
  /** how often she opened each shortcut or site, so the new tab shows her own top sites first */
  visits: Record<string, { n: number; last: number; title?: string }>;
  /** her own suggestion buttons under the ask bar, per mode; empty slots fall back to the defaults */
  starters: { guide: string[]; do: string[] };
  /** Jagora's voice off: she still gets every word as text */
  muted: boolean;
  /** show websites' main content in her language (Yoruba, Hausa, Igbo) */
  translatePages: boolean;
  setTranslatePages: (v: boolean) => void;
  /** data saver: smaller voice and live view (auto: on when the phone reports a slow or metered connection) */
  dataSaver: "auto" | "on" | "off";
  setDataSaver: (v: "auto" | "on" | "off") => void;
  /** a chat with this id (one that started on the server: a finished scheduled task, a reminder) */
  ensureTask: (id: string, title: string) => void;
  /** a short banner: something finished while she was away */
  toast: { task: string; title: string; text: string } | null;
  setToast: (t: { task: string; title: string; text: string } | null) => void;
  // live, not saved
  sheetOpen: boolean;
  live: boolean;
  showPage: boolean;
  orb: OrbMode;
  pointer: Pointer;
  highlight: Highlight;
  pageTitle: string;
  /** the size of Jagora's browser window, so the highlight and cursor land on the right spot of the live picture */
  pageSize: { w: number; h: number; mobile: boolean };
  /** she is using the live page herself; Jagora waits */
  takeover: boolean;
  setPageSize: (p: { w: number; h: number; mobile: boolean }) => void;
  setTakeover: (v: boolean) => void;
  setLang: (l: Lang) => void;
  setMode: (m: Mode) => void;
  setProfile: (p: Partial<Profile>) => void;
  setOnboarded: (v: boolean) => void;
  newTask: (t: Omit<Task, "id" | "createdAt" | "messages" | "status"> & { messages?: Msg[] }) => string;
  setActive: (id: string | null) => void;
  closeTask: (id: string) => void;
  closeTab: (id: string) => void;
  push: (taskId: string, m: Msg) => void;
  update: (taskId: string, msgId: string, patch: Partial<Msg>) => void;
  drop: (taskId: string, msgId: string) => void;
  setStatus: (taskId: string, s: TaskStatus) => void;
  setUrl: (taskId: string, url: string) => void;
  setMeta: (taskId: string, meta: Partial<Pick<Task, "title" | "kind">>) => void;
  setSheet: (v: boolean) => void;
  setLive: (v: boolean) => void;
  setShowPage: (v: boolean) => void;
  setOrb: (o: OrbMode) => void;
  setPointer: (p: Partial<Pointer>) => void;
  setHighlight: (h: Highlight) => void;
  setPageTitle: (t: string) => void;
  visit: (key: string, title?: string) => void;
  setStarter: (mode: "guide" | "do", i: number, text: string) => void;
  setMuted: (v: boolean) => void;
};

// photos are kept as data URLs while the app is open; big ones are left out of saved storage so it never fills up
const lean = (t: Task): Task => ({
  ...t,
  messages: t.messages.map((m) => {
    if (m.kind === "user" && m.attachment?.url && m.attachment.url.length > 4000) m = { ...m, attachment: { ...m.attachment, url: undefined } };
    if (m.kind === "user" && m.audio && m.audio.length > 400_000) m = { ...m, audio: undefined };
    if (m.kind === "evidence" && m.image.length > 160_000) m = { ...m, image: "" };
    return m;
  }),
});

export const useApp = create<State>()(
  persist(
    (set) => ({
      lang: "yo",
      mode: "do",
      profile: EMPTY_PROFILE,
      onboarded: false,
      avatar: "",
      setAvatar: (avatar) => set({ avatar }),
      tasks: [],
      activeId: null,
      visits: {},
      starters: { guide: ["", "", ""], do: ["", "", ""] },
      muted: false,
      translatePages: true,
      setTranslatePages: (translatePages) => set({ translatePages }),
      dataSaver: "auto",
      setDataSaver: (dataSaver) => set({ dataSaver }),
      ensureTask: (id, title) =>
        set((s) => (s.tasks.some((t) => t.id === id) ? {} : { tasks: [{ id, title, kind: "chat" as const, url: "", status: "done" as TaskStatus, createdAt: Date.now(), messages: [] }, ...s.tasks].slice(0, 30) })),
      toast: null,
      setToast: (toast) => set({ toast }),
      sheetOpen: false,
      live: false,
      showPage: false,
      orb: "idle",
      pointer: { x: 0, y: 0, visible: false, clicking: false },
      highlight: null,
      pageTitle: "",
      pageSize: { w: 1280, h: 860, mobile: false },
      takeover: false,
      setPageSize: (pageSize) => set({ pageSize }),
      setTakeover: (takeover) => set({ takeover }),
      setLang: (lang) => set({ lang }),
      setMode: (mode) => set({ mode }),
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      setOnboarded: (onboarded) => set({ onboarded }),
      newTask: (t) => {
        const id = uid();
        set((s) => ({
          tasks: [{ ...t, id, createdAt: Date.now(), status: "working" as TaskStatus, messages: t.messages ?? [] }, ...s.tasks].slice(0, 30),
          activeId: id,
        }));
        return id;
      },
      // opening a chat whose page was closed opens the page (and its tab) again
      setActive: (activeId) => set((s) => ({ activeId, tasks: activeId ? s.tasks.map((t) => (t.id === activeId && t.tabClosed ? { ...t, tabClosed: false } : t)) : s.tasks })),
      closeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), activeId: s.activeId === id ? null : s.activeId })),
      closeTab: (id) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, tabClosed: true } : t)), activeId: s.activeId === id ? null : s.activeId })),
      push: (taskId, m) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, messages: [...t.messages, m] } : t)) })),
      drop: (taskId, msgId) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, messages: t.messages.filter((m) => m.id !== msgId) } : t)) })),
      update: (taskId, msgId, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, messages: t.messages.map((m) => (m.id === msgId ? ({ ...m, ...patch } as Msg) : m)) } : t,
          ),
        })),
      setStatus: (taskId, status) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) })),
      setUrl: (taskId, url) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, url, tabClosed: false } : t)) })),
      setMeta: (taskId, meta) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...meta } : t)) })),
      setSheet: (sheetOpen) => set({ sheetOpen }),
      setLive: (live) => set({ live, showPage: false }),
      setShowPage: (showPage) => set({ showPage }),
      setOrb: (orb) => set({ orb }),
      setPointer: (p) => set((s) => ({ pointer: { ...s.pointer, ...p } })),
      setHighlight: (highlight) => set({ highlight }),
      setPageTitle: (pageTitle) => set({ pageTitle }),
      visit: (key, title) =>
        set((s) => ({ visits: { ...s.visits, [key]: { n: (s.visits[key]?.n ?? 0) + 1, last: Date.now(), title: title ?? s.visits[key]?.title } } })),
      setMuted: (muted) => set({ muted }),
      setStarter: (mode, i, text) =>
        set((s) => {
          const list = [...(s.starters?.[mode] ?? ["", "", ""])];
          list[i] = text;
          return { starters: { ...(s.starters ?? { guide: ["", "", ""], do: ["", "", ""] }), [mode]: list } };
        }),
    }),
    {
      name: "jagora",
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      partialize: (s) => ({ lang: s.lang, mode: s.mode, profile: s.profile, onboarded: s.onboarded, avatar: s.avatar, tasks: s.tasks.slice(0, 12).map(lean), visits: s.visits, starters: s.starters, muted: s.muted, translatePages: s.translatePages, dataSaver: s.dataSaver }),
    },
  ),
);

export const activeTask = (s: State) => s.tasks.find((t) => t.id === s.activeId) ?? null;
