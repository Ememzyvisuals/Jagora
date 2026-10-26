import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Acceptable use | Jagora", description: "What Jagora can and cannot be used for." };

export default function AcceptableUse() {
  return (
    <InfoPage eyebrow="Legal" title="Acceptable use" lead="Jagora is for getting things done online, honestly and safely. These are the things it will not help with." updated="26 October 2026">
      <h2>Do not use Jagora to</h2>
      <ul>
        <li>commit fraud, scams or impersonation, or get into accounts that are not yours;</li>
        <li>break the law, or help someone else break it;</li>
        <li>harass, threaten, bully or spread hate against anyone;</li>
        <li>find, create or share sexual content involving minors, or any pornographic content;</li>
        <li>get around security measures, captchas, paywalls or rate limits on other websites;</li>
        <li>collect other people&apos;s personal information without their consent;</li>
        <li>send spam, create accounts in bulk or automate abuse of any service;</li>
        <li>gamble, or chase get-rich-quick schemes and &quot;make me money fast&quot; offers;</li>
        <li>attack, overload or test the security of Jagora or any other system.</li>
      </ul>

      <h2>What happens when a request crosses the line</h2>
      <p>
        Jagora politely refuses and, where it can, suggests a safe alternative. Repeated attempts may lead to a paused account. Requests are checked by an
        automatic safety layer before the agent acts, and adult or harmful websites are blocked.
      </p>

      <h2>Reporting</h2>
      <p>
        If you see Jagora used for harm, or Jagora does something it should not, write to <a href="mailto:ememzyvisuals@gmail.com">ememzyvisuals@gmail.com</a>.
      </p>
    </InfoPage>
  );
}
