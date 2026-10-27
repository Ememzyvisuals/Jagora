"use client";

/* Notifications on her phone when Jagora is closed: reminders, scheduled task results, pages she asked Jagora to
   watch. The phone asks her once; the subscription goes to the server with her account. iPhones need Jagora added
   to the Home Screen first (Apple's rule), so there the button explains that instead. */
import { API, getToken } from "@/lib/account";

const b64ToBytes = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type PushState = "on" | "off" | "blocked" | "unsupported" | "needs-install";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
  if (ios && !standalone) return "needs-install";
  if (!pushSupported() || !API) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

async function send(sub: PushSubscription) {
  const token = getToken();
  if (!token) return false;
  const r = await fetch(`${API}/push/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  return r.ok;
}

/** Ask once, subscribe, and tell the server. Must run from a tap. */
export async function enablePush(): Promise<PushState> {
  const st = await pushState();
  if (st === "unsupported" || st === "needs-install" || st === "blocked") return st;
  if ((await Notification.requestPermission()) !== "granted") return "blocked";
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { key } = await (await fetch(`${API}/push/key`)).json();
  if (!key) return "unsupported";
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  return (await send(sub)) ? "on" : "off";
}

/** On each visit: if notifications are on, make sure the server still has this phone (it may have changed). */
export async function refreshPush() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await send(sub);
  } catch {}
}
