"use client";

/* A crash in the outer frame of the app (shared by every page) still lands on Jagora's own screen. */
import "./globals.css";
import { CrashScreen } from "@/components/CrashScreen";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <CrashScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
