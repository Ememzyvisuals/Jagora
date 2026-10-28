"use client";
import { motion } from "motion/react";

import { useCallback, useState } from "react";
import { ask, live, stop, voiceNote } from "@/lib/engine";
import { SAMPLE_SCAM } from "@/lib/engine";
import { t } from "@/lib/i18n";
import { activeTask, useApp } from "@/lib/store";
import { blobToDataUrl, useSpeakingPulse, useVoice } from "@/lib/voice";
import { Composer, StopButton, browserRecognizer } from "./Composer";
import { Conversation } from "./Conversation";
import { IconPasteMessage, IconRegister, IconSnapPaper } from "./icons";
import { Bounce, Orb } from "./Orb";
import { jagoraLevel, micLevel, startHandsFree, stopHandsFree, throughLiveKit, useHandsFree } from "@/lib/handsfree";
import { isSpeaking } from "@/lib/engine/remote";

export function ModeSwitch() {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const lang = useApp((s) => s.lang);
  return (
    <div className="glass-2 inline-flex rounded-full p-1 text-[14px]" role="radiogroup" aria-label="How Jagora helps">
      {(["guide", "do"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`rounded-full px-4 py-2 font-semibold transition ${mode === m ? "bg-ink text-paper shadow-[inset_0_1px_1px_rgba(255,255,255,.2)]" : "text-ink-2 hover:text-ink"}`}
        >
          {t(m === "guide" ? "guide" : "doIt", lang)}
        </button>
      ))}
    </div>
  );
}

/** The orb, wired to her microphone: tap once and Jagora listens hands-free (each turn is heard and sent by itself,
    and talking over Jagora stops it); tap again to stop listening. Phones without the speech detector: tap to
    talk, tap again to send. */
export function TalkOrb({ size = 96 }: { size?: number }) {
  const orb = useApp((s) => s.orb);
  const lang = useApp((s) => s.lang);
  const setOrb = useApp((s) => s.setOrb);
  const voice = useVoice();
  const speaking = useSpeakingPulse(orb === "speaking");
  const [hint, setHint] = useState("");
  const [rec, setRec] = useState<ReturnType<typeof browserRecognizer>>(null);
  const [t0, setT0] = useState(0);

  const handsFree = useHandsFree();
  const toggle = useCallback(async () => {
    if (live && !voice.listening) {
      // talking live happens only in Live mode, where End and the microphone button are always in view
      useApp.getState().setLive(true); // Live opens, or comes back up if it was folded
      return void useApp.getState().setLiveSmall(false);
    }
    if (voice.listening) {
      setOrb("thinking");
      rec?.stop();
      const blob = await voice.stop();
      if (live && blob) voiceNote(blob, await blobToDataUrl(blob), (performance.now() - t0) / 1000, { chat: useApp.getState().activeId ?? undefined });
      setTimeout(() => useApp.getState().orb === "thinking" && !live && setOrb("idle"), 2500);
      return;
    }
    setHint("");
    await voice.start();
    setT0(performance.now());
    const r = live ? null : browserRecognizer(lang);
    if (r) {
      r.onresult = (e) => {
        const said = e.results[0]?.[0]?.transcript?.trim();
        if (said) ask(said, undefined, { chat: useApp.getState().activeId ?? undefined });
      };
      try {
        r.start();
      } catch {
        /* already running */
      }
      setRec(r);
    } else if (!live && lang !== "en") {
      setHint("Speaking in this language needs Jagora's server. Type for now.");
    }
    setOrb("listening");
  }, [voice, rec, lang, setOrb, t0, handsFree]);

  const level = orb === "speaking" ? (throughLiveKit() ? jagoraLevel : speaking) : handsFree ? micLevel : voice.level;
  const label = voice.error ? "Allow the microphone to talk to Jagora" : hint || t(orb === "idle" ? "idle" : orb, lang);

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={toggle}
        className="rounded-full transition-transform active:scale-95"
        aria-label={handsFree ? "Stop listening" : voice.listening ? "Stop and send" : "Talk to Jagora"}
      >
        <Bounce level={level}>
          <Orb size={size} state={orb} levelRef={level} />
        </Bounce>
      </button>
      <p className="mt-1 min-h-5 text-center text-[13.5px] text-ink-2" aria-live="polite">
        {label}
      </p>
    </div>
  );
}

export function Suggestions() {
  const lang = useApp((s) => s.lang);
  const items = [
    { icon: <IconRegister size={36} />, title: lang === "yo" ? "Forúkọsílẹ̀ fún Skills Fair" : "Register for the Skills Fair", go: () => ask(lang === "yo" ? "Forúkọ mi sílẹ̀ fún Skills Fair" : "Register me for the Skills Fair") },
    { icon: <IconPasteMessage size={36} />, title: lang === "yo" ? "Ṣé jìbìtì ni ọ̀rọ̀ yìí?" : "Is this message a scam?", go: () => ask(SAMPLE_SCAM, { kind: "link", name: "SMS from GTBank" }) },
    { icon: <IconSnapPaper size={36} />, title: lang === "yo" ? "Ka lẹ́tà yìí fún mi" : "Read this letter for me", go: () => ask("", { kind: "image", name: "sample" }) },
  ];
  return (
    <div className="flex flex-col gap-2 px-4">
      {items.map((it) => (
        <button key={it.title} onClick={it.go} className="glass-2 flex items-center gap-3 rounded-[22px] p-3 text-left transition active:scale-[.98]">
          {it.icon}
          <span className="text-[15.5px] font-medium text-ink">{it.title}</span>
        </button>
      ))}
    </div>
  );
}

/** Stop, always in reach while Jagora works or talks: it goes quiet at once and the task stops. */
function ChatStop() {
  const task = useApp(activeTask);
  const orb = useApp((s) => s.orb);
  const busy = task?.status === "working" || task?.status === "waiting" || orb === "speaking" || isSpeaking();
  if (!task || !busy) return null;
  return <StopButton onStop={() => stop(task.id)} />;
}

export function AgentPanel({ orbSize = 96 }: { orbSize?: number }) {
  const task = useApp(activeTask);
  const lang = useApp((s) => s.lang);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col items-center gap-3 px-4 pb-2 pt-3">
        {/* the cloud drops in from the home screen as the sheet opens */}
        <motion.div initial={{ y: -150, scale: 1.3, opacity: 0.4 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 210, damping: 22 }}>
          <TalkOrb size={orbSize} />
        </motion.div>
        <div className="flex items-center gap-2">
          <ModeSwitch />
          <ChatStop />
        </div>
      </div>
      <div data-chat-scroll className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {task ? (
          <Conversation task={task} />
        ) : (
          <div className="pt-2">
            <p className="px-5 pb-3 text-center text-[15px] text-ink-2">{t("ask", lang)}</p>
            <Suggestions />
          </div>
        )}
      </div>
      <Composer />
    </div>
  );
}
