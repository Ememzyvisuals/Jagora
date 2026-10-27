"use client";

/* Safety, shown working: a fake bank text of the kind people in Nigeria get every week, and Jagora's answer in
   Pidgin with the reasons it found. The message, sender and link are made up for illustration. */
import { ChatText, Clock, Key, LinkBreak, WarningOctagon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { Mark } from "./Brand";

const REASONS = [
  { icon: LinkBreak, text: "bvn-unlock.top is not your bank's website" },
  { icon: Clock, text: "It rushes you: 24 hours or your account closes" },
  { icon: Key, text: "It wants your BVN and PIN. No bank asks for that by text" },
];

export function ScamCheck() {
  const still = useReducedMotion();
  const show = (delay: number, y = 18) =>
    still
      ? {}
      : { initial: { opacity: 0, y }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] as const } };

  return (
    <div className="relative mx-auto w-full max-w-[640px] 2xl:max-w-[760px]" role="group" aria-label="Example: Jagora checks a fake bank text message">
      {/* the text she got */}
      <motion.div {...show(0)} className="liquid-glass w-[88%] rounded-[26px] p-5 sm:p-6 2xl:p-7">
        <div className="flex items-center gap-2.5 text-[13.5px] font-semibold text-ink-2 2xl:text-[15px]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/70 text-ink">
            <ChatText size={17} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-ink">Bank Alert</span>
            <span className="font-semibold text-ink-2">Text message · 9:41 AM</span>
          </span>
        </div>
        <p className="mt-4 text-[16px] leading-relaxed text-ink sm:text-[17px] 2xl:text-[19px]">
          Dear customer, your BVN has been blocked. Click <span className="font-semibold text-accent underline underline-offset-2">bvn-unlock.top/verify</span> within 24 hours and enter
          your BVN and PIN to restore your account, or it will be closed.
        </p>
      </motion.div>

      {/* Jagora's answer */}
      <motion.div
        {...show(0.45, 26)}
        className="relative -mt-6 ml-auto w-[92%] rounded-[28px] bg-white p-5 shadow-[0_30px_70px_-30px_rgba(10,30,70,.45),0_2px_6px_rgba(10,30,70,.06)] ring-1 ring-black/5 sm:p-6 2xl:p-8 dark:bg-[#20232a]"
      >
        <div className="flex items-center gap-2.5">
          <Mark size={30} />
          <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink 2xl:text-[19px]">Jagora</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--color-danger-soft)] px-3 py-1 text-[13px] font-bold text-[var(--color-danger)] 2xl:text-[14.5px]">
            <WarningOctagon size={16} /> Scam
          </span>
        </div>
        <p className="mt-4 text-[18px] font-semibold leading-snug text-ink sm:text-[20px] 2xl:text-[23px]">
          Na scam be this. Abeg no click am, and no give anybody your BVN or PIN.
        </p>
        <ul className="mt-5 grid gap-2.5">
          {REASONS.map((r, i) => (
            <motion.li key={r.text} {...show(0.75 + i * 0.12, 10)} className="flex items-start gap-3 rounded-[16px] bg-[var(--color-mist)] px-3.5 py-3 text-[15px] font-medium text-ink 2xl:text-[16.5px] dark:bg-white/5">
              <r.icon size={19} className="mt-[1px] shrink-0 text-ink-2" />
              {r.text}
            </motion.li>
          ))}
        </ul>
        <p className="mt-4 text-[13.5px] text-ink-3 2xl:text-[14.5px]">Checked in Pidgin. Ask in Yorùbá, Hausa, Igbo or English too.</p>
      </motion.div>
    </div>
  );
}
