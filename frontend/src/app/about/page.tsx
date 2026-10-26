import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { BUILDER, PLOTWEAVER, REPO } from "@/lib/credits";

export const metadata: Metadata = {
  title: "About Jagora | A voice-first browser for Nigeria",
  description: "What Jagora is, who it is for, how it works, the technology behind it and who built it.",
};

export default function About() {
  return (
    <InfoPage
      eyebrow="About Jagora"
      title="The internet, in your own words."
      lead="Jagora is a voice-first browser built for Nigeria. You speak Yorùbá, Hausa, Igbo, Pidgin or English, and Jagora does the browsing: it searches, reads, checks that a site is real, fills the form and stops for your yes before anything important."
    >
      <h2>Why Jagora exists</h2>
      <p>
        Millions of Nigerians are online every day, yet much of the internet still assumes you read English comfortably, type fast and can tell a real
        government portal from a copy. Registering for JAMB, recovering a bank app, checking a result or applying for a training programme can mean hours
        of confusion, a paid helper, or a scam. Jagora removes that gap. It listens in the language you think in and does the work on real websites,
        while you stay in control.
      </p>

      <h2 id="how">How it works</h2>
      <ul>
        <li>
          <strong>You speak or type.</strong> Tap the cloud and talk, or turn on Live for a hands-free conversation. Jagora understands all five
          languages and answers in the one you use.
        </li>
        <li>
          <strong>Jagora browses for you.</strong> It opens the right site, reads the page, chooses, types and moves through steps on its own,
          and tells you in plain words what it is doing.
        </li>
        <li>
          <strong>You stay in charge.</strong> Before it submits, pays, signs in or shares anything, Jagora stops and asks. Passwords, PINs, OTPs,
          your NIN, BVN or account number are never said aloud: you type them into a private box and they go straight to the website.
        </li>
        <li>
          <strong>You get a result you can keep.</strong> A confirmation with the reference number, a clear explanation of a letter, or a well-made
          document with its sources.
        </li>
      </ul>

      <h2>Who it is for</h2>
      <ul>
        <li><strong>Students</strong> checking results, registering for exams and finding free courses.</li>
        <li><strong>People who do not read easily</strong>, who can now use any website by talking.</li>
        <li><strong>Business owners</strong> handling registrations, payments, suppliers and customers online.</li>
        <li><strong>Travellers</strong> booking, checking requirements and finding their way.</li>
        <li><strong>Professionals and developers</strong> who want research, downloads and paperwork done quickly.</li>
      </ul>

      <h2>Safety by design</h2>
      <p>
        Jagora checks that a site is the official one before you sign in, warns you when a message looks like a scam, refuses harmful requests and never
        invents personal details. Every important action needs your confirmation. Read more on the <a href="/safety">Safety</a> page.
      </p>

      <h2>The technology</h2>
      <ul>
        <li>
          <strong>Voice:</strong> speech recognition and the voice of Jagora come from STORM by{" "}
          <a href={PLOTWEAVER.url} target="_blank" rel="noreferrer">PlotWeaver</a>, built for Yorùbá, Hausa, Igbo, Pidgin and Nigerian English.
          Jagora speaks with Amina, a native Hausa voice that speaks all five languages.
        </li>
        <li>
          <strong>Intelligence:</strong> Meta Muse Spark runs the browsing agent, Muse Wonder understands photos, short videos and voice notes, and
          Muse Image draws picture guides for people who cannot read.
        </li>
        <li>
          <strong>Browser:</strong> a real browser on our server, driven step by step, with every action checked before Jagora moves on.
        </li>
      </ul>

      <h2 id="builder">The builder</h2>
      <p>
        Jagora is designed and built by <strong>{BUILDER.name}</strong> ({BUILDER.handle}), an AI and machine learning engineer who builds speech AI for
        African languages. See more of his work at <a href={BUILDER.site} target="_blank" rel="noreferrer">ememzyvisuals.vercel.app</a>, or follow him
        on <a href="https://x.com/ememzyvisuals" target="_blank" rel="noreferrer">X</a> and{" "}
        <a href="https://www.linkedin.com/in/ememzyvisuals" target="_blank" rel="noreferrer">LinkedIn</a>.
      </p>

      <h2>Hackathon</h2>
      <p>
        Jagora was built for the Meta Global AI Developer Hackathon 2026. The source code is public on{" "}
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>. The road from here is on the <a href="/roadmap">Roadmap</a>.
      </p>
    </InfoPage>
  );
}
