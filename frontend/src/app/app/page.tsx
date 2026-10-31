"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DesktopApp } from "@/components/app/DesktopApp";
import { MobileApp } from "@/components/app/MobileApp";
import { useHydrated, useMedia } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { ask, live } from "@/lib/engine";
import { remoteWake } from "@/lib/engine/remote";
import { refreshPush } from "@/lib/push";
import { syncAccount } from "@/lib/sync";
import { Amina } from "@/components/mascot/Amina";
import { PaySheet } from "@/components/PaySheet";

export default function AppPage() {
  const ready = useHydrated();
  const desktop = useMedia("(min-width: 1024px)");
  const onboarded = useApp((s) => s.onboarded);
  const router = useRouter();

  useEffect(() => {
    if (ready && !onboarded) router.replace("/start");
    if (!ready || !onboarded) return;
    // opened from a notification: go to that chat
    const openChat = (url: string) => {
      const id = new URL(url, location.href).searchParams.get("chat");
      if (!id) return;
      const st = useApp.getState();
      st.ensureTask(id, "Jagora");
      st.setActive(id);
    };
    try {
      if (new URLSearchParams(location.search).get("chat")) {
        openChat(location.href);
        history.replaceState(null, "", "/app");
      }
    } catch {}
    const onSw = (e: MessageEvent) => e.data?.type === "open-chat" && openChat(e.data.url);
    navigator.serviceWorker?.addEventListener("message", onSw);
    if (live) {
      void remoteWake(); // what came while she was away arrives now
      void refreshPush();
      void syncAccount(); // her chats and saved details, on any device
    }
    // shared from another app ("Share to Jagora"): check the message or open the link
    try {
      const q = new URLSearchParams(location.search);
      const shared = [q.get("text"), q.get("url")].filter(Boolean).join(" ").trim();
      if (shared) {
        history.replaceState(null, "", "/app");
        setTimeout(() => ask(shared), 400);
        return () => navigator.serviceWorker?.removeEventListener("message", onSw);
      }
    } catch {}
    // a request typed on the landing page before she signed up
    try {
      const pending = sessionStorage.getItem("jagora:ask");
      if (pending) {
        sessionStorage.removeItem("jagora:ask");
        setTimeout(() => ask(pending), 400);
      }
    } catch {}
    return () => navigator.serviceWorker?.removeEventListener("message", onSw);
  }, [ready, onboarded, router]);

  if (!ready || desktop === null || !onboarded) return <div className="h-dvh bg-mist" />;
  return (
    <>
      {desktop ? <DesktopApp /> : <MobileApp />}
      <Amina app />
      <PaySheet />
    </>
  );
}
