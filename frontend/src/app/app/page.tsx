"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DesktopApp } from "@/components/app/DesktopApp";
import { MobileApp } from "@/components/app/MobileApp";
import { useHydrated, useMedia } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { ask } from "@/lib/engine";

export default function AppPage() {
  const ready = useHydrated();
  const desktop = useMedia("(min-width: 1024px)");
  const onboarded = useApp((s) => s.onboarded);
  const router = useRouter();

  useEffect(() => {
    if (ready && !onboarded) router.replace("/start");
    if (!ready || !onboarded) return;
    // shared from another app ("Share to Jagora"): check the message or open the link
    try {
      const q = new URLSearchParams(location.search);
      const shared = [q.get("text"), q.get("url")].filter(Boolean).join(" ").trim();
      if (shared) {
        history.replaceState(null, "", "/app");
        setTimeout(() => ask(shared), 400);
        return;
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
  }, [ready, onboarded, router]);

  if (!ready || desktop === null || !onboarded) return <div className="h-dvh bg-mist" />;
  return desktop ? <DesktopApp /> : <MobileApp />;
}
