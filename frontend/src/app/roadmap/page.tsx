import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Roadmap | Jagora",
  description: "Where Jagora is today and where it is going: web now, then desktop and mobile apps.",
};

const STAGES = [
  {
    when: "Now",
    title: "Jagora on the web",
    body: "A web app that works on any phone, tablet or computer, with nothing to install. You can add it to your home screen and it opens full screen like an app. This is how everyone, including the hackathon judges, can try Jagora today.",
    points: ["Five languages by voice or text", "Browsing agent with safety stops", "Scam and official-site checks", "Documents and downloads"],
  },
  {
    when: "Next",
    title: "Jagora for desktop",
    body: "An installable desktop browser. Running on your own computer, Jagora can work in the background, use your own signed-in sessions safely, handle bigger downloads and run several tasks at once.",
    points: ["Runs in the background", "Your own sessions, kept on your computer", "Faster, and more capable with files"],
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
      title="Built for the web first, on purpose."
      lead="A web app lets anyone try Jagora on any device in seconds. Once the idea is proven, the desktop and mobile apps make it faster and more powerful."
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
