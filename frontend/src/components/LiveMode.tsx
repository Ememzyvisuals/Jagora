"use client";

/* Live mode: talk to Jagora hands-free, turn by turn. It listens, notices when she stops talking, sends what she
   said, waits while Jagora thinks and answers, then listens again, until she taps End. While Jagora works on a page
   the session shrinks to a small island at the top so she can watch and keep talking.

   Speech-to-text: with the backend, her audio goes to STORM ASR (Yorùbá, Hausa, Igbo, Pidgin, English). Without it
   (demo), the browser's own recognizer handles English and Pidgin. */
import { Rich } from "./Rich";
import { Microphone, MicrophoneSlash, Minus, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ask, live as backendLive, voiceNote } from "@/lib/engine";
import type { Lang } from "@/lib/i18n";
import { activeTask, useApp } from "@/lib/store";
import { duckVoice, hush, remoteFocus, remoteStop } from "@/lib/engine/remote";
import { Listener } from "@/lib/turns";
import { runApp } from "@/lib/appctl";
import { muteHandsFree, parkVoice, reconnectVoice, startHandsFree, stopHandsFree, throughLiveKit, useVoiceLost } from "@/lib/handsfree";
import { blobToDataUrl, useSpeakingPulse, useVoice, watchForVoice } from "@/lib/voice";
import { browserRecognizer } from "./Composer";
import { Glass } from "./glass/Glass";
import { Orb } from "./Orb";

/** two short soft notes: the voice line is open and Jagora can hear her now */
function readyTone() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.18);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* no sound: the words on screen still say it */
  }
}

const SAY: Record<"joining" | "listen" | "think" | "work" | "speak" | "paused" | "hint" | "end" | "live" | "hide" | "lost" | "again" | "parked", Record<Lang, string>> = {
  joining: { en: "Connecting… one moment", pcm: "I dey connect… small time", yo: "Ẹ dúró díẹ̀, mo ń so pọ̀…", ha: "Ina haɗawa… ɗan lokaci", ig: "Ana m ejikọ… nwa oge" },
  listen: { en: "Listening…", pcm: "I dey hear you…", yo: "Mo ń gbọ́ yín…", ha: "Ina sauraro…", ig: "Ana m ege ntị…" },
  work: { en: "Working on the page…", pcm: "I dey work for the page…", yo: "Mo ń ṣiṣẹ́ lórí ojú-ìwé náà…", ha: "Ina aiki a shafin…", ig: "Ana m arụ ọrụ na peeji ahụ…" },
  think: { en: "Thinking…", pcm: "I dey think…", yo: "Mo ń ronú…", ha: "Ina tunani…", ig: "Ana m eche echiche…" },
  speak: { en: "Jagora is speaking", pcm: "Jagora dey talk", yo: "Jagora ń sọ̀rọ̀", ha: "Jagora tana magana", ig: "Jagora na-ekwu okwu" },
  paused: { en: "Microphone off", pcm: "Mic don off", yo: "Gbohùngbohùn ti pa", ha: "An kashe makirufo", ig: "Emechiri igwe okwu" },
  hint: {
    en: "Say what you need. Jagora will answer, then listen again.",
    pcm: "Talk wetin you need. Jagora go answer, then hear you again.",
    yo: "Ẹ sọ ohun tí ẹ nílò. Jagora á dáhùn, á sì tún gbọ́ yín.",
    ha: "Faɗi abin da kake bukata. Jagora za ta amsa, sannan ta sake saurare.",
    ig: "Kwuo ihe ị chọrọ. Jagora ga-aza, wee gee ntị ọzọ.",
  },
  end: { en: "End", pcm: "Stop", yo: "Parí", ha: "Gama", ig: "Kwụsị" },
  parked: { en: "Tap the mic to talk", pcm: "Tap the mic to talk", yo: "Tẹ mic láti sọ̀rọ̀", ha: "Taɓa mic don magana", ig: "Pịa mic ka ị kwuo okwu" },
  lost: { en: "Voice disconnected", pcm: "Voice don cut", yo: "Ohùn ti já", ha: "Murya ta katse", ig: "Olu akwụsịla" },
  again: { en: "Reconnect", pcm: "Connect am again", yo: "Tún so pọ̀", ha: "Sake haɗawa", ig: "Jikọọ ọzọ" },
  hide: { en: "Hide this screen", pcm: "Comot this screen", yo: "Pa ojú-iboju yìí mọ́", ha: "Ɓoye wannan allo", ig: "Zoo ihuenyo a" },
  live: { en: "Live", pcm: "Live", yo: "Láàyè", ha: "Kai tsaye", ig: "Ndụ" },
};

// used only when the speech detector cannot load (very old browsers): a loudness meter and a pause
const SPEECH_ON = 0.09; // level that counts as talking
const SILENCE_MS = 1600; // pause that ends her turn
const MAX_TURN_MS = 20000;

/** The black "Live" pill that starts a session. */
export function LiveButton({ compact = false }: { compact?: boolean }) {
  const lang = useApp((s) => s.lang);
  const setLive = useApp((s) => s.setLive);
  return (
    <button
      onClick={() => setLive(true)}
      className={`flex shrink-0 items-center gap-1.5 rounded-full bg-ink font-semibold text-paper shadow-[inset_0_1px_1px_rgba(255,255,255,.22),0_8px_18px_-10px_rgba(10,20,40,.6)] transition active:scale-95 ${compact ? "h-10 px-3 text-[13.5px]" : "h-11 px-4 text-[14.5px]"}`}
      aria-label="Start live voice"
    >
      <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
        {[4, 8, 12, 16, 20].map((x, i) => (
          <rect key={x} x={x - 1.1} y={12 - [6, 12, 16, 11, 7][i] / 2} width="2.2" height={[6, 12, 16, 11, 7][i]} rx="1.1" fill="currentColor" />
        ))}
      </svg>
      {SAY.live[lang]}
    </button>
  );
}

export function LiveMode() {
  const on = useApp((s) => s.live);
  const setLive = useApp((s) => s.setLive);
  const lang = useApp((s) => s.lang);
  const orb = useApp((s) => s.orb);
  const setOrb = useApp((s) => s.setOrb);
  const task = useApp(activeTask);
  const voice = useVoice();
  const speaking = useSpeakingPulse(orb === "speaking");
  const [muted, setMuted] = useState(false);
  // the call dropped by itself (weak network, phone asleep): the bar says so, with Reconnect; one quiet retry first
  const lost = useVoiceLost();
  const [rejoining, setRejoining] = useState(false);
  const rejoin = useCallback(async () => {
    setRejoining(true);
    await reconnectVoice();
    setRejoining(false);
  }, []);
  useEffect(() => {
    if (!on || !lost) return;
    const t = window.setTimeout(() => void rejoin(), 2500);
    return () => clearTimeout(t);
  }, [on, lost, rejoin]);
  const [heard, setHeard] = useState("");
  const [phase, setPhase] = useState<"listen" | "think" | "speak" | "work">("listen");
  const busy = useRef(false);
  // the speech detector (lib/turns.ts); null while loading, false if it could not load (then the old way is used)
  const listener = useRef<Listener | null>(null);
  const [smart, setSmart] = useState<boolean | null>(null);
  // the voice line is still connecting: she is told to wait, so her first words are not spoken into nothing
  const [joining, setJoining] = useState(false);

  // Jagora's latest reply, shown as a caption
  const reply = [...(task?.messages ?? [])].reverse().find((m) => m.kind === "agent" || m.kind === "confirm" || m.kind === "choice");
  const replyText = reply ? ("text" in reply ? reply.text : "question" in reply ? reply.question : "") : "";
  // the page comes into view only when she asks to see it, or when Jagora needs her to type on it (password, code)
  const showPage = useApp((s) => s.showPage);
  const setShowPage = useApp((s) => s.setShowPage);
  const last = task?.messages.at(-1);
  const mustType = last?.kind === "handoff" && last.status === "waiting"; // she must do it on the page itself
  // Jagora is waiting for her in the chat (a yes or no, a choice, a box to fill): the Live screen folds to the small
  // bar and the chat comes up with that card, on the phone and on the computer; it opens again once she has answered
  const waitingCard = (task?.messages ?? []).slice(-3).some((m) =>
    (m.kind === "choice" && !m.picked) || ((m.kind === "confirm" || m.kind === "secret" || m.kind === "form" || m.kind === "pointask") && "status" in m && m.status === "waiting"));
  // folded down (her tap, "close this screen", or a video playing): the small bar at the top, the call goes on
  const small = useApp((s) => s.liveSmall);
  const setSmall = useApp((s) => s.setLiveSmall);
  const playing = useApp((s) => !!s.playing);
  const folded = useRef(false);
  useEffect(() => {
    if (!on) return;
    if (waitingCard && !useApp.getState().liveSmall) {
      folded.current = true;
      useApp.getState().setLiveSmall(true);
      runApp("show_chat");
    } else if (!waitingCard && folded.current) {
      folded.current = false;
      if (!useApp.getState().playing) useApp.getState().setLiveSmall(false);
    }
  }, [on, waitingCard]);
  const island = small || playing || waitingCard || (!!task && task.kind === "browse" && !!task.url && (showPage || mustType));
  // a film or song playing: the microphone stays on; when she talks, it goes quiet and pauses (lib/sound.ts)

  const listen = useCallback(async () => {
    if (busy.current || listener.current) return;
    busy.current = true;
    setPhase("listen");
    setOrb("listening");
    await voice.start();
    const rec = !backendLive ? browserRecognizer(lang) : null;
    let said = "";
    if (rec) {
      rec.onresult = (e) => (said = e.results[0]?.[0]?.transcript?.trim() ?? "");
      try {
        rec.start();
      } catch {}
    }
    // turn detection: wait for speech, then for a pause
    const t0 = performance.now();
    let spoke = false;
    let quietSince = 0;
    await new Promise<void>((done) => {
      const id = setInterval(() => {
        const lvl = voice.level.current;
        const now = performance.now();
        if (lvl > SPEECH_ON) {
          spoke = true;
          quietSince = 0;
        } else if (spoke) {
          quietSince ||= now;
          if (now - quietSince > SILENCE_MS) (clearInterval(id), done());
        }
        if (now - t0 > MAX_TURN_MS || !useApp.getState().live) (clearInterval(id), done());
      }, 60);
    });
    rec?.stop();
    const blob = await voice.stop();
    busy.current = false;
    if (!useApp.getState().live) return;
    if (!spoke) return void listen();
    setPhase("think");
    setOrb("thinking");
    const chat = useApp.getState().activeId ?? undefined;
    if (backendLive && blob) {
      // her words go in the chat as a voice message; the server fills in what it heard and answers in text and voice
      voiceNote(blob, await blobToDataUrl(blob), (performance.now() - t0) / 1000, { chat });
    } else {
      await new Promise((r) => setTimeout(r, 450)); // let the recognizer deliver its result
      if (said) {
        setHeard(said);
        ask(said, undefined, { chat });
      } else setHeard("");
    }
  }, [voice, lang, setOrb]);

  // barge-in: while Jagora speaks, talking over her (or tapping the orb) stops her and she listens at once
  const interrupt = useCallback(() => {
    hush();
    setOrb("idle");
  }, [setOrb]);
  useEffect(() => {
    if (!on || muted || phase !== "speak" || smart !== false) return;
    let stop = () => {};
    let gone = false;
    void watchForVoice(interrupt).then((s) => (gone ? s() : (stop = s)));
    return () => {
      gone = true;
      stop();
    };
  }, [on, muted, phase, interrupt, smart]);

  // the speech detector runs for the whole session (with the backend): it hears turns and barge-ins by itself
  useEffect(() => {
    if (!on || !backendLive) return;
    let gone = false;
    let viaLiveKit = false;
    // first choice: Jagora's voice on LiveKit (as in Kivo); it hears her turns and her cutting in by itself
    setJoining(true);
    void startHandsFree().then((ok) => {
      setJoining(false);
      if (!gone && ok) readyTone(); // she hears when Jagora can hear her: nothing she says is lost to the connecting
      if (gone || !ok || !throughLiveKit()) return startListener();
      viaLiveKit = true;
      setSmart(true);
      // inside a chat with a story: Jagora opens by picking it up from this chat's memory
      const st = useApp.getState();
      const t = st.tasks.find((x) => x.id === st.activeId);
      if (t && t.messages.length > 1) void remoteFocus(t.id, true);
    });
    const startListener = () => {
    if (gone) return;
    const l = new Listener({
      onTurn: async (wav, secs) => {
        if (!useApp.getState().live) return;
        setPhase("think");
        setOrb("thinking");
        const chat = useApp.getState().activeId ?? undefined;
        voiceNote(wav, await blobToDataUrl(wav), secs, { chat });
      },
      onBarge: (stop) => (stop ? interrupt() : duckVoice(0.2)),
      onFalseAlarm: () => duckVoice(1),
    });
    void l.start().then((ok) => {
      if (gone) return void l.destroy();
      if (ok) listener.current = l;
      setSmart(ok);
    });
    };
    return () => {
      gone = true;
      const l = listener.current;
      listener.current = null;
      setSmart(null);
      void l?.destroy();
      void viaLiveKit;
      void stopHandsFree(); // the call ends for real: LiveKit (even one still connecting) and every listener
    };
  }, [on, interrupt, setOrb]);
  // microphone off means nothing is heard at all: this listener, the hands-free one and the LiveKit microphone
  useEffect(() => {
    const l = listener.current;
    if (l) {
      if (muted) l.pause();
      else l.resume();
    }
    void muteHandsFree(muted);
  }, [muted, smart]);

  // start listening when live mode opens; listen again each time Jagora finishes speaking
  useEffect(() => {
    if (!on) return;
    listener.current?.setAgentTalking(orb === "speaking");
    if (muted) return;
    if (orb === "speaking") return setPhase("speak");
    if (orb === "working") return setPhase("work"); // she can still talk: the detector keeps listening
    if (orb === "thinking") return setPhase("think");
    if (smart) {
      if (orb === "idle") setPhase("listen");
      return;
    }
    if (smart === null && backendLive) return; // still loading the detector
    if (orb === "idle" && !busy.current) void listen();
  }, [on, orb, muted, listen, smart]);

  useEffect(() => {
    if (!on) {
      void voice.stop();
      setHeard("");
      busy.current = false;
    }
  }, [on, voice]);

  // End ends everything: the call, Jagora's voice, and the task it was doing
  const end = () => {
    setLive(false);
    setMuted(false);
    void voice.stop();
    void stopHandsFree();
    hush();
    const t = useApp.getState().tasks.find((x) => x.id === useApp.getState().activeId);
    if (t && (t.status === "working" || t.status === "waiting")) void remoteStop(t.id);
    setOrb("idle");
  };
  const toggleMute = () => {
    if (parked) {
      // back from watching: join the voice room again, same chat, and Jagora is told what is on her screen
      setParked(false);
      setMuted(false);
      void rejoin();
      return;
    }
    setMuted((m) => {
      if (!m) void voice.stop();
      return !m;
    });
  };

  // watching a video and nobody has spoken for 30 s: the voice room is left (it costs minutes and holds a worker);
  // the microphone shows off, and turning it on joins again
  const [parked, setParked] = useState(false);
  const quietSince = useRef(Date.now());
  useEffect(() => {
    quietSince.current = Date.now();
  }, [heard, phase, playing, orb]);
  useEffect(() => {
    if (!on || !playing || muted || parked) return;
    const t = window.setInterval(() => {
      if (phase !== "listen" || useApp.getState().orb === "speaking" || !throughLiveKit()) return;
      if (Date.now() - quietSince.current < 30_000) return;
      setParked(true);
      setMuted(true);
      void parkVoice();
    }, 5000);
    return () => clearInterval(t);
  }, [on, playing, muted, parked, phase]);
  useEffect(() => {
    if (!on) setParked(false);
  }, [on]);

  // the big orb fits the phone: smaller on short screens so the reply and buttons stay in view
  const orbBig = typeof window !== "undefined" ? (window.innerHeight < 760 ? 180 : window.innerHeight < 880 ? 220 : 260) : 220;
  const level = phase === "speak" ? speaking : smart && listener.current ? listener.current.level : voice.level;
  // while Jagora works, the caption says what it is doing right now (its latest step)
  const lastStep = [...(task?.messages ?? [])].reverse().find((m) => m.kind === "step");
  const doing = lastStep && "text" in lastStep ? lastStep.text : "";
  const label = joining ? SAY.joining[lang] : lost ? SAY.lost[lang] : parked ? SAY.parked[lang] : muted ? SAY.paused[lang] : phase === "speak" ? SAY.speak[lang] : phase === "work" ? doing || SAY.work[lang] : phase === "think" ? SAY.think[lang] : SAY.listen[lang];
  const orbState = joining ? "idle" : phase === "speak" ? "speaking" : phase === "work" ? "working" : phase === "think" ? "thinking" : muted ? "idle" : "listening";

  return (
    <AnimatePresence>
      {on &&
        (island ? (
          <motion.div
            key="island"
            initial={{ y: -40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] z-[80] flex justify-center px-4"
          >
            <Glass flat radius={28} bezel={14} refraction={30} blur={14} tint="rgba(14,15,18,.82)">
              <div className="flex h-14 items-center gap-2.5 pl-2 pr-2 text-snow">
                <Orb size={44} state={orbState} levelRef={level} />
                <button onClick={() => (parked ? toggleMute() : (setShowPage(false), setSmall(false)))} className="min-w-0 max-w-[48vw] truncate text-left text-[14px] font-medium" aria-label="Back to live view">
                  {label}
                </button>
                {lost && (
                  <button onClick={() => void rejoin()} disabled={rejoining} className="h-10 shrink-0 rounded-full bg-white px-4 text-[13.5px] font-semibold text-ink transition active:scale-95 disabled:opacity-60">
                    {SAY.again[lang]}
                  </button>
                )}
                <button onClick={toggleMute} className="grid h-10 w-10 place-items-center rounded-full bg-white/12" aria-label={muted ? "Turn microphone on" : "Turn microphone off"}>
                  {muted ? <MicrophoneSlash size={18} /> : <Microphone size={18} />}
                </button>
                <button onClick={end} className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink" aria-label={SAY.end[lang]}>
                  <X size={16} weight="bold" />
                </button>
              </div>
            </Glass>
          </motion.div>
        ) : (
          <motion.div
            key="full"
            role="dialog"
            aria-label="Live voice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex flex-col items-center bg-[#dcecfb]/55 dark:bg-[#141a24]/70 px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] backdrop-blur-[26px] backdrop-saturate-150"
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-display font-bold tracking-[-0.035em] text-[26px] text-ink">Jagora</span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/70 px-3 py-1 text-[12.5px] font-semibold text-ink-2">{SAY.live[lang]}</span>
                {/* fold the Live screen down to the small bar; the call goes on */}
                <button onClick={() => setSmall(true)} className="grid h-10 w-10 place-items-center rounded-full bg-white/70 text-ink transition active:scale-95" aria-label={SAY.hide[lang]}>
                  <Minus size={18} weight="bold" />
                </button>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center">
              <motion.div
                animate={{ scale: phase === "listen" ? 1 : 0.94 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                onClick={() => phase === "speak" && interrupt()}
                className={phase === "speak" ? "cursor-pointer" : ""}
                title={phase === "speak" ? "Tap to interrupt" : undefined}
              >
                <Orb size={orbBig} state={orbState} levelRef={level} />
              </motion.div>
              <p className="mt-2 text-[17px] font-semibold text-ink" aria-live="polite">
                {label}
              </p>
              <div className="mt-6 min-h-[96px] w-full max-w-[420px] text-center">
                {heard && <p className="line-clamp-2 text-[15px] leading-snug text-ink-2">“{heard}”</p>}
                {replyText ? (
                  // Jagora's latest reply: never more than a few lines on screen (it scrolls if longer), so the orb and
                  // the buttons always stay in view
                  <div className="no-scrollbar mx-auto mt-3 max-h-[7.6em] overflow-y-auto text-[16px] font-semibold leading-snug text-ink [mask-image:linear-gradient(to_bottom,black_80%,transparent)] sm:text-[17px]">
                    <Rich text={replyText} />
                  </div>
                ) : (
                  !heard && <p className="text-[15.5px] leading-snug text-ink-2">{SAY.hint[lang]}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {lost && (
                <button onClick={() => void rejoin()} disabled={rejoining} className="h-16 rounded-full bg-white px-6 text-[17px] font-semibold text-ink shadow-[0_12px_24px_-12px_rgba(10,20,40,.4)] transition active:scale-95 disabled:opacity-60">
                  {SAY.again[lang]}
                </button>
              )}
              <button onClick={toggleMute} className="glass-2 grid h-16 w-16 place-items-center rounded-full text-ink transition active:scale-95" aria-label={muted ? "Turn microphone on" : "Turn microphone off"}>
                {muted ? <MicrophoneSlash size={26} /> : <Microphone size={26} />}
              </button>
              <button onClick={end} className="flex h-16 items-center gap-2 rounded-full bg-ink px-8 text-[17px] font-semibold text-paper shadow-[inset_0_1px_1px_rgba(255,255,255,.22),0_12px_24px_-12px_rgba(10,20,40,.7)] transition active:scale-95">
                <X size={20} weight="bold" /> {SAY.end[lang]}
              </button>
            </div>
          </motion.div>
        ))}
    </AnimatePresence>
  );
}
