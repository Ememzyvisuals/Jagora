"use client";

/* When something in the app breaks.

   A new version was published while the app was open (common with the home-screen app, which stays open for days):
   the old copy asks for a piece of code that no longer exists. That is fixed by loading the app again, once, quietly.

   Anything else: the error goes to our server's log (only the error and where it happened, nothing she said or saw),
   so it can be fixed, and the app shows a calm screen with "Try again" instead of a blank page. */
import { API } from "./account";

const BUILD = process.env.NEXT_PUBLIC_BUILD || "";

export function isStaleCode(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? String(err ?? "")}`;
  return /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(text);
}

/** load the app again, at most once a minute (so a real fault can never loop) */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem("jagora:reloaded") || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem("jagora:reloaded", String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

const sent = new Set<string>();
export function reportCrash(err: unknown) {
  if (typeof window === "undefined") return;
  const e = err as { message?: string; stack?: string; digest?: string } | null;
  const message = (e?.message ?? String(err)) + (e?.digest ? ` (digest ${e.digest})` : "");
  if (sent.has(message) || sent.size > 5) return; // once per error, a few per visit
  sent.add(message);
  try {
    void fetch(`${API}/client-error`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, stack: e?.stack ?? "", page: location.pathname, build: BUILD, ua: navigator.userAgent }),
    }).catch(() => undefined);
  } catch {}
}

/** errors outside React (sockets, timers, audio): reported, and stale code reloads */
let watching = false;
export function watchErrors() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const on = (err: unknown) => {
    if (isStaleCode(err) && reloadOnce()) return;
    reportCrash(err);
  };
  window.addEventListener("error", (ev) => on(ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => on(ev.reason));
}

/** The home-screen app can stay open for days. When she comes back to it and a newer version has been published,
    load it straight away (unless Jagora is in the middle of a task), before an old piece of code can break. */
export function watchVersion(busy: () => boolean) {
  if (typeof window === "undefined" || !BUILD || BUILD === "local") return;
  let checking = false;
  const check = async () => {
    if (document.hidden || checking) return;
    checking = true;
    try {
      const r = await fetch("/api/build", { cache: "no-store" });
      const { build } = (await r.json()) as { build?: string };
      if (build && build !== BUILD && !busy()) reloadOnce();
    } catch {
      /* offline: keep going */
    } finally {
      checking = false;
    }
  };
  document.addEventListener("visibilitychange", () => void check());
}
