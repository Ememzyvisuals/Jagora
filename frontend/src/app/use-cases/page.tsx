import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Use cases | Jagora",
  description: "What people do with Jagora: research, official sites, sign-ups, forms, downloads, documents, learning and more.",
};

const GROUPS: { title: string; items: { say: string; does: string }[] }[] = [
  {
    title: "Find and check information",
    items: [
      { say: "Is this the real JAMB portal?", does: "Checks the address against the official site and tells you before you type anything." },
      { say: "How do I check my WAEC result?", does: "Finds the official steps, opens the page and walks you through them." },
      { say: "Find me free data science courses with certificates.", does: "Searches, compares the options and gives you a short list with links." },
      { say: "Is this bank message real?", does: "Reads the message, checks the link and the sender, and explains the warning signs." },
    ],
  },
  {
    title: "Do the task on real websites",
    items: [
      { say: "Register me for the Skills Fair.", does: "Fills the form from your details, asks for anything missing and stops for your yes before sending." },
      { say: "Help me open an Instagram account.", does: "Goes through sign-up with you; you type the password and the code yourself." },
      { say: "Log me in to WhatsApp Web.", does: "Opens it and shows you the QR code to scan with your phone." },
      { say: "Recover my email account.", does: "Follows the recovery steps and hands over to you for codes and passwords." },
    ],
  },
  {
    title: "Make and download things",
    items: [
      { say: "Research the best solar inverters under ₦500,000 and write it up.", does: "Produces a clean, well-formatted document with a summary, a comparison table and sources." },
      { say: "Download this font for my project.", does: "Finds the official source, checks the licence and downloads the files for you." },
      { say: "Get me a free photo of Lagos at night I can use.", does: "Searches free image libraries, shows the licence and saves the picture." },
      { say: "Turn this letter into simple notes.", does: "Reads a photo of the letter and gives you what it says, what to do and by when." },
    ],
  },
  {
    title: "Learn and watch",
    items: [
      { say: "Play a Yoruba cooking video on YouTube.", does: "Finds a good one and plays it." },
      { say: "Explain this news story to me in Hausa.", does: "Reads the article and explains it in your language, out loud." },
      { say: "Teach me how to use Excel formulas.", does: "Finds a free course, opens the first lesson and keeps your place." },
    ],
  },
];

export default function UseCases() {
  return (
    <InfoPage
      eyebrow="Use cases"
      title="Most things you would use a browser for."
      lead="Ask in your own words and in your own language. These are some of the things people ask Jagora to do."
    >
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {g.items.map((it) => (
              <div key={it.say} className="rounded-[22px] bg-white/80 p-5 ring-1 ring-black/5 dark:bg-white/5">
                <p className="font-display text-[17px] font-semibold leading-snug tracking-[-0.02em] text-ink">“{it.say}”</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{it.does}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </InfoPage>
  );
}
