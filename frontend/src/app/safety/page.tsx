import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Safety | Jagora", description: "How Jagora keeps you safe while it browses for you." };

const RULES = [
  { title: "It stops for your yes", body: "Before submitting, paying, signing in, accepting terms or sharing details, Jagora pauses and shows exactly what will happen." },
  { title: "Private things stay private", body: "Passwords, PINs, codes, NIN, BVN and account numbers are typed by you, go straight to the website and are never spoken, stored or sent to the AI." },
  { title: "Real sites only", body: "Before you sign in anywhere, Jagora checks the site is the official one, and warns you about look-alike addresses." },
  { title: "Scam warnings", body: "Paste or forward a suspicious message and Jagora explains whether it looks like a scam, and why, before you click anything." },
  { title: "It never makes things up about you", body: "If a form asks for something Jagora does not know, it asks you. It never guesses an ID, a date or a number." },
  { title: "Pages cannot give it orders", body: "Text on a website is treated as information, never as instructions, so a page cannot trick Jagora into acting against you." },
  { title: "Harmful requests are refused", body: "Fraud, harassment, adult content and get-rich-quick schemes are refused, and harmful sites are blocked." },
  { title: "You can always stop it", body: "Say stop, or tap Stop, and Jagora halts at once. Nothing continues without you." },
];

export default function Safety() {
  return (
    <InfoPage eyebrow="Safety" title="Jagora works for you, never around you." lead="An assistant that acts on real websites must be careful. These are the rules Jagora follows on every task.">
      <div className="grid gap-3 sm:grid-cols-2">
        {RULES.map((r, i) => (
          <div key={r.title} className="rounded-[22px] bg-white/80 p-5 ring-1 ring-black/5 dark:bg-white/5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft font-display text-[14px] font-bold text-accent">{i + 1}</span>
            <p className="mt-3 font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">{r.title}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{r.body}</p>
          </div>
        ))}
      </div>
    </InfoPage>
  );
}
