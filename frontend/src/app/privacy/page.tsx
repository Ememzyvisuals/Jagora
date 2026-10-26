import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { BUILDER, PLOTWEAVER } from "@/lib/credits";

export const metadata: Metadata = { title: "Privacy | Jagora", description: "What Jagora collects, why, and how it is protected." };

export default function Privacy() {
  return (
    <InfoPage eyebrow="Legal" title="Privacy" lead="What we collect, why we need it, and how it is protected. We collect as little as possible and never sell your data." updated="26 October 2026">
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address and a securely hashed password. We never see or store your password in readable form.</li>
        <li><strong>Your details, if you add them:</strong> name, phone number, date of birth, gender and state, used only to fill forms you ask Jagora to fill. They are kept on your device and you can edit or delete them at any time in My details.</li>
        <li><strong>Your requests:</strong> what you say or type to Jagora, and the steps it takes, so it can do the task and show you what happened.</li>
        <li><strong>Usage:</strong> credits used, errors and basic device type, to keep the service working and fair.</li>
      </ul>

      <h2>Private fields never leave your control</h2>
      <p>
        Passwords, PINs, one-time codes, your NIN, BVN, card and account numbers are never spoken and never sent to the AI model. You type them into a
        private box; the value goes straight into the website field, is checked for length only and is then discarded. It is not logged, stored, shown in
        the live page view or included in any transcript. The app keeps only a masked hint such as ••••8901.
      </p>

      <h2>Your voice</h2>
      <p>
        Your speech is turned into text by STORM from <a href={PLOTWEAVER.url} target="_blank" rel="noreferrer">PlotWeaver</a>. Only speech is sent;
        silence is cut on your device first. Jagora does not keep recordings of your voice after they are transcribed.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li><strong>Meta Muse</strong> runs the browsing agent and reads images you share. It receives your request and page content, never your private fields.</li>
        <li><strong>PlotWeaver STORM</strong> provides speech recognition and Jagora&apos;s voice.</li>
        <li><strong>Our servers</strong> run the browser and store your account and credits.</li>
      </ul>
      <p>Each processes data only to provide its part of Jagora.</p>

      <h2>How long we keep it</h2>
      <p>
        Account data is kept while your account is open. Task history is kept on your device and can be cleared at any time. Server logs are kept for a
        short period for security and then deleted.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Nigeria Data Protection Act 2023 you may ask to see, correct or delete your data, or close your account. Write to{" "}
        <a href={`mailto:${BUILDER.email}`}>{BUILDER.email}</a> and we will respond promptly.
      </p>

      <h2>Children</h2>
      <p>Jagora is not intended for children under 13 without a parent or guardian.</p>
    </InfoPage>
  );
}
