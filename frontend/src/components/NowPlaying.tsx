"use client";

/* A song or video Jagora found, playing big in the middle of her screen (not squeezed into the chat). Live mode folds
   down to its small bar and its microphone turns off while this plays, so the film's sound is never taken for her
   voice. X closes it. */
import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";

export function NowPlaying() {
  const m = useApp((s) => s.playing);
  const close = () => useApp.getState().setPlaying(null);
  const video = !!m && (m.type === "youtube" || m.type.startsWith("video") || /\.(mp4|webm|mov)$/i.test(m.name));
  return (
    <AnimatePresence>
      {m && (
        <motion.div
          key={m.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(8,12,20,.72)] px-4 backdrop-blur-[6px]"
          onClick={close}
        >
          <div className="w-full max-w-[1100px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-white">{m.name}</p>
              <button onClick={close} aria-label="Close the player" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink transition active:scale-95">
                <X size={18} weight="bold" />
              </button>
            </div>
            {m.type === "youtube" ? (
              <iframe
                src={m.url}
                title={m.name}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="aspect-video w-full rounded-[18px] bg-black"
              />
            ) : video ? (
              <video src={m.url} controls autoPlay playsInline className="max-h-[78vh] w-full rounded-[18px] bg-black" />
            ) : (
              <div className="rounded-[18px] bg-white p-4">
                <audio src={m.url} controls autoPlay className="w-full" />
              </div>
            )}
            {m.source && <p className="mt-2 truncate text-[12.5px] text-white/70">{new URL(m.source, "https://x.invalid").hostname.replace(/^www\./, "")}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
