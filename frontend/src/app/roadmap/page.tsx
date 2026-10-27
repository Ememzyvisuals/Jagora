import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Roadmap | Jagora",
  description: "Jagora is a browser. The web app demonstrates it today; the desktop browser for Windows, macOS and Linux is in development, then Android and iPhone.",
};

const STAGES = [
  {
    when: "Now",
    title: "The Jagora browser, demonstrated on the web",
    body: "The same Chromium engine, agent, safety layers, voice and Meta models as the browser, running on our server, one private browser per person, streamed live to any phone or computer with nothing to install. This is how everyone, including the hackathon judges, can try Jagora today.",
    points: ["Five languages by voice or text", "The browsing agent with safety stops", "20 of 20 attacks resisted in the live test", "Scam and official-site checks, documents and downloads"],
  },
  {
    when: "In development",
    title: "Jagora for desktop: Windows, macOS, Linux",
    body: "The full browser, installed on your computer and built on Chromium. Browse normally, then speak and let the agent take over the page. The safety is built into the engine where pages load, your signed-in accounts never leave your computer, and Jagora can work in the background.",
    points: ["Safety built into the browser engine", "Your own sessions, kept on your computer", "Runs in the background, several tasks at once", "Safety checks on open-weights models where hardware allows"],
  },
  {
    when: "Then",
    title: "Jagora for Android and iPhone",
    body: "Native mobile apps with a voice button you can reach from anywhere on the phone, built for low data use and the phones most Nigerians actually own.",
    points: ["Talk to Jagora from anywhere on the phone", "Light on data and battery", "Offline voice for common phrases"],
  },
];

export default function Roadmap() {
  return (
    <InfoPage
      eyebrow="Roadmap"
      title="A browser, shown on the web first."
      lead="Jagora is a browser of its own. The web app lets anyone try it on any device in seconds; the desktop browser is our main target, then Android and iPhone."
    >
      <ol className="relative space-y-6 border-l border-ink/15 pl-6">
        {STAGES.map((s) => (
          <li key={s.when} className="relative">
            <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-accent ring-4 ring-white dark:ring-[#23262d]" />
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">{s.when}</p>
            <h2 className="!mt-1">{s.title}</h2>
            <p>{s.body}</p>
            <ul>
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <h2>Keeping Jagora going</h2>
      <p>
        Jagora is free for its users. Every account gets free credits each day, and the running costs of the voice, the agent and the browsers are kept
        low by design. Support from the hackathon would go straight into keeping Jagora online for the people who need it, and into building the desktop
        and mobile apps.
      </p>
    </InfoPage>
  );
}
