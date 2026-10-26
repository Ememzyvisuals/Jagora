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

export type Attachment = { kind: "image" | "doc" | "link"; name: string; url?: string };

export type Msg =
  | { id: string; kind: "user"; text: string; attachment?: Attachment }
  | { id: string; kind: "agent"; text: string }
  | { id: string; kind: "step"; text: string; status: "doing" | "done" | "stopped" }
  | { id: string; kind: "confirm"; question: string; detail?: string; value?: string; status: "waiting" | "yes" | "no" }
  | { id: string; kind: "choice"; question: string; choices: string[]; picked?: string }
  | { id: string; kind: "handoff"; text: string; status: "waiting" | "done" }
  | { id: string; kind: "verdict"; verdict: "scam" | "safe" | "unsure"; title: string; reasons: string[]; link?: string }
  | { id: string; kind: "explain"; title: string; image: string; sections: { label: string; text: string; box: [number, number, number, number] }[] }
  | { id: string; kind: "result"; title: string; reference?: string; lines: [string, string][] };

export type TaskStatus = "working" | "waiting" | "done" | "stopped";
export type Task = {
  id: string;
  title: string;
  kind: "browse" | "scam" | "paper" | "chat";
  url: string;
  status: TaskStatus;
  createdAt: number;
  messages: Msg[];
};

export type Pointer = { x: number; y: number; visible: boolean; clicking: boolean };
export type Highlight = { x: number; y: number; w: number; h: number; tone: "point" | "stop" } | null;
export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

export const uid = () => Math.random().toString(36).slice(2, 10);

type State = {
  lang: Lang;
  mode: Mode;
  profile: Profile;
  onboarded: boolean;
  tasks: Task[];
  activeId: string | null;
  // live, not saved
  sheetOpen: boolean;
  orb: OrbMode;
  pointer: Pointer;
  highlight: Highlight;
  pageTitle: string;
  setLang: (l: Lang) => void;
  setMode: (m: Mode) => void;
  setProfile: (p: Partial<Profile>) => void;
  setOnboarded: (v: boolean) => void;
  newTask: (t: Omit<Task, "id" | "createdAt" | "messages" | "status"> & { messages?: Msg[] }) => string;
  setActive: (id: string | null) => void;
  closeTask: (id: string) => void;
  push: (taskId: string, m: Msg) => void;
  update: (taskId: string, msgId: string, patch: Partial<Msg>) => void;
  setStatus: (taskId: string, s: TaskStatus) => void;
  setUrl: (taskId: string, url: string) => void;
  setMeta: (taskId: string, meta: Partial<Pick<Task, "title" | "kind">>) => void;
  setSheet: (v: boolean) => void;
  setOrb: (o: OrbMode) => void;
  setPointer: (p: Partial<Pointer>) => void;
  setHighlight: (h: Highlight) => void;
  setPageTitle: (t: string) => void;
};

// photos are kept as data URLs while the app is open; big ones are left out of saved storage so it never fills up
const lean = (t: Task): Task => ({
  ...t,
  messages: t.messages.map((m) => (m.kind === "user" && m.attachment?.url && m.attachment.url.length > 4000 ? { ...m, attachment: { ...m.attachment, url: undefined } } : m)),
});

export const useApp = create<State>()(
  persist(
    (set) => ({
      lang: "yo",
      mode: "do",
      profile: EMPTY_PROFILE,
      onboarded: false,
      tasks: [],
      activeId: null,
      sheetOpen: false,
      orb: "idle",
      pointer: { x: 0, y: 0, visible: false, clicking: false },
      highlight: null,
      pageTitle: "",
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
      setActive: (activeId) => set({ activeId }),
      closeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), activeId: s.activeId === id ? null : s.activeId })),
      push: (taskId, m) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, messages: [...t.messages, m] } : t)) })),
      update: (taskId, msgId, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, messages: t.messages.map((m) => (m.id === msgId ? ({ ...m, ...patch } as Msg) : m)) } : t,
          ),
        })),
      setStatus: (taskId, status) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) })),
      setUrl: (taskId, url) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, url } : t)) })),
      setMeta: (taskId, meta) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...meta } : t)) })),
      setSheet: (sheetOpen) => set({ sheetOpen }),
      setOrb: (orb) => set({ orb }),
      setPointer: (p) => set((s) => ({ pointer: { ...s.pointer, ...p } })),
      setHighlight: (highlight) => set({ highlight }),
      setPageTitle: (pageTitle) => set({ pageTitle }),
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
      partialize: (s) => ({ lang: s.lang, mode: s.mode, profile: s.profile, onboarded: s.onboarded, tasks: s.tasks.slice(0, 12).map(lean) }),
    },
  ),
);

export const activeTask = (s: State) => s.tasks.find((t) => t.id === s.activeId) ?? null;
