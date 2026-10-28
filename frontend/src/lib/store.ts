"use client";

import { safeMsg } from "./words";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Lang } from "./i18n";

export type Mode = "guide" | "do";

export type Profile = {
  full_name: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  phone: string;
  email: string;
  date_of_birth: string; // YYYY-MM-DD
  gender: "" | "female" | "male";
  state: string;
};
export type Course = { name: string; updated: number; lessons: { name: string; url: string; watched: number; length: number; done: boolean }[] };

export const EMPTY_PROFILE: Profile = { full_name: "", phone: "", email: "", date_of_birth: "", gender: "", state: "" };

/** A document Jagora wrote: structured, so it can be shown as a designed page and exported to PDF, Word and Markdown. */
export type DocBlock =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "list"; items: string[]; ordered?: boolean }
  | { t: "table"; head: string[]; rows: string[][]; caption?: string }
  | { t: "note"; text: string };
export type JDoc = { title: string; subtitle?: string; kind: string; summary: string[]; blocks: DocBlock[]; sources: { title: string; url: string }[]; created: number; lang: string };
/** one box in a form card: she fills several at once in the chat, each goes into its own box on the page */
export type FormField = { key: string; label: string; field: SecretField; digits?: number; profile_field?: keyof Profile };
export type SecretField = "account" | "nin" | "bvn" | "otp" | "pin" | "password" | "phone" | "card" | "other" | "name" | "email" | "address" | "text";
/** what she types herself because it must be spelled exactly (not private: shown as she types) */
export const PLAIN_FIELDS = new Set<SecretField>(["name", "email", "address", "text", "phone"]);
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
  | { id: string; kind: "secret"; label: string; field: SecretField; digits?: number; profile_field?: keyof Profile; status: "waiting" | "done" | "skipped"; shown?: string }
  | { id: string; kind: "form"; title: string; fields: FormField[]; status: "waiting" | "done" | "skipped"; shown?: string[] }
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
  | { id: string; kind: "media"; name: string; url: string; type: string; size: number; source?: string;
      /** several videos: previews one after another, or a list to move through with next and previous */
      queue?: { name: string; url: string; type: string; source?: string }[]; preview?: number;
      /** a course she is learning from: her watching is tracked under this name */
      course?: string }
  /** a task Jagora will do on its own later */
  /** a site's terms and privacy policy, read for her */
  | { id: string; kind: "reading"; read_by: string; name?: string; from?: string; summary: string; risk: "low" | "medium" | "high";
      facts: { label: string; value: string }[]; deadlines: { what: string; date: string }[]; asks_her_to: string[]; red_flags: string[]; next_steps: string[];
      /** SAM 3.1: her photo with the facts outlined and numbered, which facts have a number, and the safety signs it looked for */
      image?: string; marked?: number[]; outlined_by?: string; signs?: { kind: "qr" | "stamp" | "signature"; label: string; found: boolean }[] }
  | { id: string; kind: "pictures"; title: string; panels: { caption: string; url: string }[] }
  | { id: string; kind: "terms"; site: string; verdict: "ok" | "caution" | "red"; summary: string; points: { level: "caution" | "red"; text: string }[]; urls?: string[] }
  /** Jagora is not sure what she means: she taps it on the live page */
  | { id: string; kind: "pointask"; question: string; status: "waiting" | "done" }
  | { id: string; kind: "scheduled"; at: number; goal: string; allow: string[]; repeat: string }
  | { id: string; kind: "payment"; what: string; amount?: string; pay_to?: string; account?: string; bank?: string; reference?: string; status: "waiting" | "paid_by_her" | "confirmed" | "failed"; note?: string; site?: string; since: number; updated: number }
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
  /** a video she paused to watch later, per chat: where she stopped, so "continue" plays on from there */
  resume: Record<string, { name: string; url: string; type: string; source?: string; at: number; length: number; saved: number }>;
  setResume: (task: string, v: { name: string; url: string; type: string; source?: string; at: number; length: number } | null) => void;
  /** where a video should start (seconds), for continuing it */
  startAt: number;
  setStartAt: (n: number) => void;
  /** what she is learning: per course, each lesson's seconds watched, length and whether she finished it */
  courses: Record<string, Course>;
  learnTick: (course: string, lesson: { name: string; url: string }, seconds: number, length: number) => void;
  learnDone: (course: string, url: string) => void;
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
  /** Live mode folded down to the small bar at the top (the call goes on) */
  liveSmall: boolean;
  /** a song or video Jagora found, playing big on her screen */
  playing: Extract<Msg, { kind: "media" }> | null;
  /** a delete waiting for her yes: one or more chats, or everything (she must type DELETE) */
  askDelete: { ids: string[]; all?: boolean } | null;
  setAskDelete: (v: { ids: string[]; all?: boolean } | null) => void;
  /** which video of the list is playing */
  mediaAt: number;
  /** she tapped Talk on the player: the film pauses and the microphone is on */
  talkOver: boolean;
  /** the first 30 s of a video: Jagora still listens (next, another one, I don't like it), with the film quieter */
  mediaListen: boolean;
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
  setLiveSmall: (v: boolean) => void;
  setPlaying: (m: Extract<Msg, { kind: "media" }> | null) => void;
  setMediaAt: (i: number) => void;
  setTalkOver: (v: boolean) => void;
  setMediaListen: (v: boolean) => void;
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
      courses: {},
      resume: {},
      setResume: (task, v) =>
        set((s) => {
          const next = { ...s.resume };
          if (v) next[task] = { ...v, saved: Date.now() };
          else delete next[task];
          return { resume: next };
        }),
      startAt: 0,
      setStartAt: (startAt) => set({ startAt }),
      learnTick: (course, lesson, seconds, length) =>
        set((s) => {
          const c: Course = s.courses[course] ?? { name: course, lessons: [], updated: 0 };
          const lessons = c.lessons.some((l) => l.url === lesson.url) ? c.lessons : [...c.lessons, { name: lesson.name, url: lesson.url, watched: 0, length: 0, done: false }];
          return {
            courses: {
              ...s.courses,
              [course]: { ...c, updated: Date.now(), lessons: lessons.map((l) => (l.url === lesson.url ? { ...l, watched: l.watched + seconds, length: length || l.length } : l)) },
            },
          };
        }),
      learnDone: (course, url) =>
        set((s) => {
          const c = s.courses[course];
          if (!c) return {};
          return { courses: { ...s.courses, [course]: { ...c, updated: Date.now(), lessons: c.lessons.map((l) => (l.url === url ? { ...l, done: true } : l)) } } };
        }),
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
      liveSmall: false,
      playing: null,
      mediaAt: 0,
      askDelete: null,
      setAskDelete: (askDelete) => set({ askDelete }),
      talkOver: false,
      mediaListen: false,
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
      setLive: (live) => set({ live, showPage: false, liveSmall: false }),
      setLiveSmall: (liveSmall) => set({ liveSmall }),
      setPlaying: (playing) => set({ playing, mediaAt: 0, talkOver: false }),
      setMediaAt: (mediaAt) => set((s) => ({ mediaAt: Math.max(0, Math.min(mediaAt, (s.playing?.queue?.length ?? 1) - 1)), talkOver: false })),
      setTalkOver: (talkOver) => set({ talkOver }),
      setMediaListen: (mediaListen) => set({ mediaListen }),
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
      partialize: (s) => ({ lang: s.lang, mode: s.mode, profile: s.profile, onboarded: s.onboarded, avatar: s.avatar, tasks: s.tasks.slice(0, 12).map(lean), visits: s.visits, courses: s.courses, resume: s.resume, starters: s.starters, muted: s.muted, translatePages: s.translatePages, dataSaver: s.dataSaver }),
      // chats saved on this phone are repaired as they load (a bad message must never stop the app from opening)
      merge: (saved, current) => {
        const p = (saved ?? {}) as Partial<State>;
        return { ...current, ...p, tasks: (p.tasks ?? current.tasks).map((t) => ({ ...t, messages: t.messages.map((m) => safeMsg(m)) })) };
      },
    },
  ),
);

export const activeTask = (s: State) => s.tasks.find((t) => t.id === s.activeId) ?? null;
