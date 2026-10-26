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
