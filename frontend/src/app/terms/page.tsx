import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { BUILDER } from "@/lib/credits";

export const metadata: Metadata = { title: "Terms of use | Jagora", description: "The terms for using Jagora." };

export default function Terms() {
  return (
    <InfoPage eyebrow="Legal" title="Terms of use" lead="The agreement between you and Jagora, in plain words. By creating an account or using Jagora you accept these terms." updated="26 October 2026">
      <h2>1. What Jagora is</h2>
      <p>
        Jagora is a voice-first browsing assistant. It acts on websites on your behalf, following your instructions, and asks for your confirmation before
        important actions such as submitting a form, paying, signing in or sharing personal information. Jagora is currently offered as a free service
        built for the Meta Global AI Developer Hackathon 2026.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You need an email address and a password. Keep your password private; you are responsible for activity on your account.</li>
        <li>You must be at least 13 years old, or have permission from a parent or guardian.</li>
        <li>One person, one account. Do not create accounts automatically or in bulk.</li>
        <li>Access codes are personal to the people they are given to and may not be shared or sold.</li>
      </ul>

      <h2>3. Credits and fair use</h2>
      <p>
        Every account receives free credits each day. Credits have no cash value, cannot be transferred and may change. To keep Jagora available for
        everyone, we may limit usage per account, device or network, and pause the live agent when the daily budget is reached.
      </p>

      <h2>4. You are in control</h2>
      <ul>
        <li>Jagora acts only on your instructions and stops for your yes before important actions. Read what Jagora shows you before you confirm.</li>
        <li>You remain responsible for what is submitted, paid or agreed to on third-party websites, and for the accuracy of the details you give.</li>
        <li>Jagora may make mistakes. Check important results, such as payment amounts, dates and reference numbers, against the website itself.</li>
      </ul>

      <h2>5. Third-party websites</h2>
      <p>
        Jagora visits websites that we do not own or control. Their own terms and privacy policies apply when you use them through Jagora. We are not
        responsible for their content, availability or actions.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        You agree to follow the <a href="/acceptable-use">Acceptable use policy</a>. We may refuse a request, stop a task or suspend an account that breaks it.
      </p>

      <h2>7. Content you create</h2>
      <p>
        Documents, notes and files Jagora makes for you are yours to use. Files downloaded from other websites remain under their own licences; Jagora
        shows the licence where it can find one.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        Jagora is provided as it is and as available, without warranties of any kind. We may change, pause or end features at any time. When these terms
        change, we will update the date above; continuing to use Jagora means you accept the new terms.
      </p>

      <h2>9. Liability</h2>
      <p>
        To the extent the law allows, Jagora and its builder are not liable for indirect or consequential losses, or for losses caused by third-party
        websites, by information you provided, or by actions you confirmed.
      </p>

      <h2>10. Law and contact</h2>
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria. Questions: <a href={`mailto:${BUILDER.email}`}>{BUILDER.email}</a>.
      </p>
    </InfoPage>
  );
}
