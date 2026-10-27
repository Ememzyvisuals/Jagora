import type { JDoc } from "../store";

/** The demo's research write-up. Every link is the provider's own page. */
export function freeCoursesDoc(): JDoc {
  return {
    title: "Free online courses with certificates",
    subtitle: "Where to learn in-demand skills at no cost, and how to get the certificate",
    kind: "Research brief",
    created: Date.now(),
    lang: "en",
    summary: [
      "Six reliable platforms offer free courses that are useful for jobs in Nigeria today.",
      "Google, Microsoft, freeCodeCamp and Alison give the certificate itself for free.",
      "Coursera and edX let you study free; their certificates usually cost money, but Coursera offers financial aid.",
      "Start with one track and finish it before adding another: completion is what employers notice.",
    ],
    blocks: [
      { t: "h", text: "At a glance" },
      {
        t: "table",
        caption: "Free to learn on every platform. The last column is about the certificate.",
        head: ["Platform", "Good for", "Certificate"],
        rows: [
          ["Google Skillshop and Grow with Google", "Digital marketing, Google Ads, analytics", "Free"],
          ["Microsoft Learn", "Cloud, data, AI and Office skills", "Free badges; exams are paid"],
          ["freeCodeCamp", "Web development, Python, data", "Free"],
          ["Alison", "Business, IT, health and soft skills", "Free digital certificate option"],
          ["Coursera", "University courses from top schools", "Paid; financial aid available"],
          ["edX", "University courses and short programmes", "Paid; audit for free"],
        ],
      },
      { t: "h", text: "How to choose" },
      {
        t: "list",
        items: [
          "Pick the skill first, then the platform. For a first job in tech, freeCodeCamp's Responsive Web Design is a strong start.",
          "Look at the time needed. Most certificates take 20 to 300 hours; plan a fixed hour each day.",
          "Use your real name on the account, because it is printed on the certificate.",
          "Add each certificate to your LinkedIn profile as soon as you earn it.",
        ],
      },
      { t: "h", text: "Getting a paid certificate for free on Coursera" },
      {
        t: "list",
        ordered: true,
        items: [
          "Open the course and choose Enroll.",
          "Select Financial aid available, under the enrollment options.",
          "Answer the short questions about your goals and income honestly.",
          "Approval usually takes about two weeks; you can start learning while you wait.",
        ],
      },
      { t: "note", text: "Course offers and certificate rules change. Check the provider's page before you start; Jagora can do this for you." },
    ],
    sources: [
      { title: "Google Skillshop", url: "https://skillshop.withgoogle.com" },
      { title: "Microsoft Learn", url: "https://learn.microsoft.com/training" },
      { title: "freeCodeCamp certifications", url: "https://www.freecodecamp.org/learn" },
      { title: "Alison free online courses", url: "https://alison.com" },
      { title: "Coursera financial aid", url: "https://www.coursera.support/s/article/209819033-Apply-for-Financial-Aid-or-a-Scholarship" },
      { title: "edX, auditing a course", url: "https://www.edx.org" },
    ],
  };
}
