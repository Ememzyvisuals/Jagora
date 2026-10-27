"use client";

/* The demo engine: Jagora working without the server. It really operates the practice website inside the app
   (moves its cursor, types, ticks, chooses), stops for her yes exactly where the real backend does, checks messages
   for scams with real rules, and explains a sample letter. The real engine (remote.ts) sends the same events. */
import { t, type Lang } from "../i18n";
import { checkMessage } from "../scam";
import { useApp, uid, type Msg, type Profile } from "../store";
import { doc, navigate, placeOf, waitForFrame } from "./frame";
import { readablePhone, spokenPhone } from "../fields";
import { freeCoursesDoc } from "../docs/sample";

const S = () => useApp.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pending = new Map<string, (v: string) => void>();
let runId = 0;

class Stopped extends Error {}

function guard(id: number) {
  if (id !== runId) throw new Stopped();
}

export function answer(msgId: string, value: string) {
  const r = pending.get(msgId);
  if (r) {
    pending.delete(msgId);
    r(value);
  }
}

const NIN_SAY: Record<Lang, string> = {
  en: "This form needs your NIN. Please type it in the box, I won't say it out loud.",
  pcm: "This form need your NIN. Abeg type am for the box, I no go talk am out.",
  yo: "Fọ́ọ̀mù yìí nílò NIN yín. Ẹ jọ̀ọ́ ẹ tẹ̀ ẹ́ sínú àpótí náà, mi ò ní pè é jáde.",
  ha: "Wannan fom yana bukatar NIN ɗinka. Don Allah ka rubuta shi a akwatin, ba zan faɗe shi da ƙarfi ba.",
  ig: "Fọm a chọrọ NIN gị. Biko pịnye ya n'igbe ahụ, agaghị m ekwupụta ya.",
};
const NIN_LABEL: Record<Lang, string> = { en: "Your NIN (11 digits)", pcm: "Your NIN (11 numbers)", yo: "NIN yín (nọ́mbà 11)", ha: "NIN ɗinka (lambobi 11)", ig: "NIN gị (ọnụọgụgụ 11)" };

export function stopAll() {
  runId += 1;
  pending.forEach((r) => r("__stop"));
  pending.clear();
  const s = S();
  s.setPointer({ visible: false });
  s.setHighlight(null);
  s.setOrb("idle");
}

function waitFor(msgId: string): Promise<string> {
  return new Promise((resolve) => pending.set(msgId, resolve));
}

// ---- talking -----------------------------------------------------------------------------------------------------

async function say(taskId: string, text: string, my: number) {
  guard(my);
  S().push(taskId, { id: uid(), kind: "agent", text });
  S().setOrb("speaking");
  const lang = S().lang;
  const ms = Math.min(4200, 900 + text.length * 45);
  try {
    if (lang === "en" && "speechSynthesis" in window && !S().muted) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-NG";
      u.rate = 0.98;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
  } catch {
    /* no voice on this device: the orb still shows Jagora speaking */
  }
  await sleep(ms);
  guard(my);
  S().setOrb("thinking");
}

function step(taskId: string, text: string, status: "doing" | "done" = "done") {
  const id = uid();
  S().push(taskId, { id, kind: "step", text, status });
  return id;
}

async function confirm(taskId: string, question: string, my: number, value?: string, detail?: string) {
  const id = uid();
  S().push(taskId, { id, kind: "confirm", question, value, detail, status: "waiting" });
  S().setStatus(taskId, "waiting");
  S().setSheet(true);
  S().setOrb("idle");
  const v = await waitFor(id);
  guard(my);
  const yes = v === "yes";
  S().update(taskId, id, { status: yes ? "yes" : "no" } as Partial<Msg>);
  S().setStatus(taskId, "working");
  S().setOrb("thinking");
  return yes;
}

async function choose(taskId: string, question: string, choices: string[], my: number) {
  const id = uid();
  S().push(taskId, { id, kind: "choice", question, choices });
  S().setStatus(taskId, "waiting");
  S().setSheet(true);
  S().setOrb("idle");
  const v = await waitFor(id);
  guard(my);
  S().update(taskId, id, { picked: v } as Partial<Msg>);
  S().setStatus(taskId, "working");
  S().setOrb("thinking");
  return v;
}

// ---- acting on the page ------------------------------------------------------------------------------------------

async function point(el: Element, my: number, tone: "point" | "stop" = "point") {
  guard(my);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  await sleep(450);
  const p = placeOf(el);
  if (!p) return;
  S().setHighlight({ ...p, tone });
  S().setPointer({ x: p.x + Math.min(p.w * 0.7, p.w - 12), y: p.y + p.h * 0.62, visible: true });
  await sleep(700);
  guard(my);
}

async function tap(el: HTMLElement, my: number) {
  await point(el, my);
  S().setPointer({ clicking: true });
  await sleep(160);
  el.click();
  S().setPointer({ clicking: false });
  await sleep(250);
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  // the page lives in an iframe, so use that window's element classes (instanceof across frames is always false)
  const w = (el.ownerDocument.defaultView ?? window) as typeof window;
  const proto = el.tagName === "SELECT" ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function typeInto(el: HTMLInputElement, value: string, my: number) {
  await point(el, my);
  el.focus();
  if (el.type === "date") {
    setValue(el, value);
    await sleep(300);
    return;
  }
  setValue(el, "");
  for (const ch of value) {
    guard(my);
    setValue(el, el.value + ch);
    await sleep(38 + Math.random() * 30);
  }
  await sleep(200);
}

async function pick(el: HTMLSelectElement, label: string, my: number) {
  await point(el, my);
  const opt = [...el.options].find((o) => o.text.toLowerCase() === label.toLowerCase()) ??
    [...el.options].find((o) => o.text.toLowerCase().includes(label.toLowerCase()));
  if (opt) setValue(el, opt.value || opt.text);
  await sleep(350);
  return opt?.text ?? "";
}

// ---- tasks -------------------------------------------------------------------------------------------------------

export const SKILLS = ["Tailoring and fashion design", "Hairdressing and beauty", "Phone and computer repair", "Catering and baking",
  "Solar installation", "Digital marketing"];
const SKILL_WORDS: [RegExp, string][] = [
  [/phone|computer|fóònù|waya|ekwenti/i, "Phone and computer repair"], [/tailor|fashion|ìránṣọ|dinki/i, "Tailoring and fashion design"],
  [/hair|beauty|irun|kitso/i, "Hairdressing and beauty"], [/cater|bak|oúnjẹ|abinci|nri/i, "Catering and baking"],
  [/solar|oòrùn|rana/i, "Solar installation"], [/market|digital/i, "Digital marketing"],
];

export type Intent = "register" | "scam" | "paper" | "research" | "help";

export function intentOf(text: string, hasImage: boolean): Intent {
  if (hasImage) return "paper";
  if (/https?:\/\/|www\.|\.(com|ng|xyz|top|info|link)\b|scam|jìbìtì|jibiti|zamba|aghụghọ|aghughọ|aghugho|fake|bvn|otp/i.test(text)) return "scam";
  if (/letter|paper|ìwé|iwe|takarda|akwụkwọ|akwukwo|bill|notice|explain|read/i.test(text)) return "paper";
  if (/research|write (it|this|me|a)|document|report|course|find (me )?(free|the best|cheap)|compare|look for|search for|ẹ̀kọ́|kwasa|ọmụmụ|write am down/i.test(text)) return "research";
  if (/regist|skills? fair|forúkọ|foruko|rajista|ndebanye|sign me|enrol/i.test(text)) return "register";
  return "help";
}

export async function run(taskId: string, intent: Intent, text: string) {
  stopAll();
  const my = runId;
  S().setOrb("thinking");
  try {
    if (intent === "register") await register(taskId, text, my);
    else if (intent === "scam") await scam(taskId, text, my);
    else if (intent === "paper") await paper(taskId, text, my);
    else if (intent === "research") await research(taskId, text, my);
    else await help(taskId, my);
  } catch (e) {
    if (!(e instanceof Stopped)) {
      console.error(e);
      S().setStatus(taskId, "stopped");
    }
  } finally {
    if (my === runId) {
      S().setOrb("idle");
      S().setPointer({ visible: false });
      S().setHighlight(null);
    }
  }
}

export const PROMPT: Record<"scam" | "paper", L> = {
  scam: { en: "Paste the message you received, and I'll check it.", pcm: "Paste the message wey dem send you, I go check am.", yo: "Ẹ lẹ ọ̀rọ̀ tí wọ́n fi ránṣẹ́ sí yín síbí, màá yẹ̀ ẹ́ wò.", ha: "Liƙa saƙon da aka turo maka, zan duba shi.", ig: "Mado ozi ezitere gị ebe a, m ga-elele ya." },
  paper: { en: "Take a photo of the paper, and I'll read it to you.", pcm: "Snap the paper, I go read am for you.", yo: "Ẹ ya fọ́tò ìwé náà, màá kà á fún yín.", ha: "Ɗauki hoton takardar, zan karanta maka.", ig: "See foto akwụkwọ ahụ, m ga-agụrụ gị ya." },
};
export const TRY_SCAM: L = { en: "Try a sample message", pcm: "Try sample message", yo: "Gbìyànjú ọ̀rọ̀ àpẹẹrẹ", ha: "Gwada saƙon misali", ig: "Nwaa ozi ihe atụ" };

/** A quick action from the home screen: ask her for the message or the photo, offering a sample in the demo. */
export async function prompt(taskId: string, kind: "scam" | "paper") {
  stopAll();
  const my = runId;
  const lang = S().lang;
  try {
    await say(taskId, PROMPT[kind][lang], my);
    const sample = kind === "scam" ? TRY_SCAM[lang] : SAMPLE_LETTER_REF[lang];
    const v = await choose(taskId, PROMPT[kind][lang], [sample], my);
    if (kind === "scam" && v === sample) S().push(taskId, { id: uid(), kind: "user", text: SAMPLE_SCAM, attachment: { kind: "link", name: "SMS" } });
    if (kind === "scam") await scam(taskId, v === sample ? SAMPLE_SCAM : v, my);
    else await paper(taskId, v === sample || v === "sample" ? "sample" : "own", my);
  } catch (e) {
    if (!(e instanceof Stopped)) S().setStatus(taskId, "stopped");
  } finally {
    if (my === runId) S().setOrb("idle");
  }
}

/** Research and a written document: search, open a few sources, read them, then write it up. */
async function research(taskId: string, _text: string, my: number) {
  const lang = S().lang;
  await say(taskId, RESEARCH_SAY.start[lang], my);
  const sources = ["Google Skillshop", "Microsoft Learn", "freeCodeCamp", "Alison", "Coursera", "edX"];
  const s1 = step(taskId, RESEARCH_SAY.search[lang], "doing");
  await sleep(900);
  guard(my);
  S().update(taskId, s1, { status: "done" } as Partial<Msg>);
  for (const src of sources) {
    const id = step(taskId, `${RESEARCH_SAY.reading[lang]} ${src}`, "doing");
    await sleep(380);
    guard(my);
    S().update(taskId, id, { status: "done" } as Partial<Msg>);
  }
  const w = step(taskId, RESEARCH_SAY.writing[lang], "doing");
  await sleep(1100);
  guard(my);
  S().update(taskId, w, { status: "done" } as Partial<Msg>);
  S().push(taskId, { id: uid(), kind: "doc", doc: freeCoursesDoc() });
  dispatchEvent(new Event("jagora:done"));
  S().setSheet(true);
  await say(taskId, RESEARCH_SAY.done[lang], my);
  S().setStatus(taskId, "done");
}

const RESEARCH_SAY: Record<"start" | "search" | "reading" | "writing" | "done", L> = {
  start: { en: "I'll look this up and write it up for you.", pcm: "I go find am and write am down for you.", yo: "Màá wá a, màá sì kọ ọ́ sílẹ̀ fún yín.", ha: "Zan nemo shi in rubuta maka.", ig: "M ga-achọ ya ma dee ya maka gị." },
  search: { en: "Searching the web", pcm: "Dey search the web", yo: "Mò ń wá a lórí íńtánẹ́ẹ̀tì", ha: "Ina bincike a yanar gizo", ig: "Ana m achọ na ịntanetị" },
  reading: { en: "Reading", pcm: "Dey read", yo: "Mò ń ka", ha: "Ina karanta", ig: "Ana m agụ" },
  writing: { en: "Writing your document", pcm: "Dey write your document", yo: "Mò ń kọ ìwé yín", ha: "Ina rubuta takardarka", ig: "Ana m ede akwụkwọ gị" },
  done: { en: "Your document is ready. You can open it, or download it as PDF, Word or Markdown.", pcm: "Your document don ready. You fit open am, or download am as PDF, Word or Markdown.", yo: "Ìwé yín ti ṣetán. Ẹ lè ṣí i, tàbí ẹ gbà á sílẹ̀ bí PDF, Word tàbí Markdown.", ha: "Takardarka ta shirya. Za ka iya buɗe ta, ko ka sauke ta a PDF, Word ko Markdown.", ig: "Akwụkwọ gị adịla njikere. Ị nwere ike imepe ya, ma ọ bụ budata ya dịka PDF, Word ma ọ bụ Markdown." },
};

async function help(taskId: string, my: number) {
  const lang = S().lang;
  await say(taskId, HELP[lang], my);
  const v = await choose(taskId, HELP_Q[lang], [CHOICES.register[lang], CHOICES.scam[lang], CHOICES.paper[lang]], my);
  if (v === CHOICES.register[lang]) return register(taskId, "", my);
  if (v === CHOICES.scam[lang]) return scam(taskId, SAMPLE_SCAM, my);
  if (v === CHOICES.paper[lang]) return paper(taskId, "sample", my);
}

async function register(taskId: string, text: string, my: number) {
  const s = S();
  const lang = s.lang;
  const p: Profile = s.profile;
  s.setSheet(false);
  if (!(await waitForFrame())) throw new Error("page view not ready");
  await say(taskId, t(s.mode === "guide" ? "guideIntro" : "opening", lang), my);
  const url = "/practice/skills-fair/index.html";
  s.setUrl(taskId, url);
  const sid = step(taskId, "Naija Skills Fair 2026", "doing");
  await navigate(url);
  S().update(taskId, sid, { status: "done" } as Partial<Msg>);
  guard(my);
  const d = doc();
  if (!d) throw new Error("page not reachable");
  const $ = <T extends Element>(q: string) => d.querySelector(q) as T | null;

  const close = $<HTMLElement>("#notice button");
  if (close) {
    await say(taskId, t("closingNotice", lang), my);
    await tap(close, my);
    step(taskId, lang === "yo" ? "Mo pa ìkéde náà dé" : "Closed the notice");
  }

  if (S().mode === "guide") return guide(taskId, d, my);

  await say(taskId, t("filling", lang), my);
  if (p.full_name) {
    await typeInto($<HTMLInputElement>("#fullname")!, p.full_name, my);
    step(taskId, p.full_name);
  }
  let phone = p.phone;
  if (!phone) {
    const said = await askText(taskId, PHONE_Q[lang], my);
    phone = spokenPhone(said);
    if (!(await confirm(taskId, READBACK[lang].replace("{x}", readablePhone(phone)), my, readablePhone(phone)))) {
      await say(taskId, t("stoppedNo", lang), my);
      S().setStatus(taskId, "stopped");
      return;
    }
  }
  await typeInto($<HTMLInputElement>("#phone")!, phone, my);
  step(taskId, readablePhone(phone));
  if (p.email) {
    await typeInto($<HTMLInputElement>("#email")!, p.email, my);
    step(taskId, p.email);
  }
  if (p.date_of_birth) {
    await typeInto($<HTMLInputElement>("#dob")!, p.date_of_birth, my);
    step(taskId, p.date_of_birth);
  }
  // NIN is private: she types it, Jagora never asks for it aloud or says it back
  const nin = $<HTMLInputElement>("#nin");
  if (nin) {
    await point(nin, my);
    await say(taskId, NIN_SAY[lang], my);
    const nid = uid();
    S().push(taskId, { id: nid, kind: "secret", label: NIN_LABEL[lang], field: "nin", digits: 11, status: "waiting" });
    S().setStatus(taskId, "waiting");
    S().setSheet(true);
    const v = await new Promise<string>((resolve) => pending.set(nid, resolve));
    guard(my);
    if (!v || v === "__stop") {
      await say(taskId, t("stoppedNo", lang), my);
      S().setStatus(taskId, "stopped");
      return;
    }
    S().setSheet(false);
    await typeInto(nin, v, my);
    step(taskId, `NIN ••••${v.slice(-4)}`);
  }
  if (p.gender) {
    const r = $<HTMLInputElement>(`input[name=gender][value=${p.gender}]`);
    if (r) await tap(r, my);
  }
  if (p.state) {
    const st = await pick($<HTMLSelectElement>("#state")!, p.state, my);
    if (st) step(taskId, st);
  }
  let skill = SKILL_WORDS.find(([re]) => re.test(text))?.[1];
  if (!skill) skill = await choose(taskId, t("whichSkill", lang), SKILLS, my);
  await pick($<HTMLSelectElement>("#track")!, skill, my);
  step(taskId, skill);

  const consent = $<HTMLInputElement>("#consent")!;
  await point(consent, my, "stop");
  if (await confirm(taskId, t("agreeAsk", lang), my, undefined, "I agree to be contacted about my registration")) {
    await tap(consent, my);
  } else {
    await say(taskId, t("stoppedNo", lang), my);
    S().setStatus(taskId, "stopped");
    return;
  }
  const submit = $<HTMLButtonElement>("button[type=submit]")!;
  await point(submit, my, "stop");
  if (!(await confirm(taskId, t("submitAsk", lang), my, undefined, "Submit registration"))) {
    await say(taskId, t("stoppedNo", lang), my);
    S().setStatus(taskId, "stopped");
    return;
  }
  S().setSheet(false);
  await tap(submit, my);
  await sleep(500);
  const ref = ($<HTMLElement>("#ref")?.textContent ?? "").trim();
  const errors = [...d.querySelectorAll<HTMLElement>(".err")].filter((e) => e.style.display === "block").map((e) => e.textContent ?? "");
  if (!ref) {
    await say(taskId, errors.join(" ") || "The page did not accept the form.", my);
    S().setStatus(taskId, "stopped");
    return;
  }
  const rows = [...d.querySelectorAll("#summary dt")].map((dt) => [dt.textContent ?? "", dt.nextElementSibling?.textContent ?? ""] as [string, string]);
  S().push(taskId, { id: uid(), kind: "result", title: "Naija Skills Fair 2026", reference: ref, lines: rows });
  S().setSheet(true);
  await say(taskId, t("registered", lang, { ref }), my);
  S().setStatus(taskId, "done");
}

async function guide(taskId: string, d: Document, my: number) {
  const lang = S().lang;
  const name = d.querySelector<HTMLInputElement>("#fullname")!;
  await point(name, my);
  await say(taskId, t("pointName", lang), my);
  const id = uid();
  S().push(taskId, { id, kind: "handoff", text: t("pointName", lang), status: "waiting" });
  S().setStatus(taskId, "waiting");
  // she taps the box in the page herself; Jagora notices and continues
  await new Promise<void>((resolve) => {
    const on = () => (name.removeEventListener("focus", on), resolve());
    name.addEventListener("focus", on);
    pending.set(id, () => resolve());
  });
  guard(my);
  S().update(taskId, id, { status: "done" } as Partial<Msg>);
  S().setStatus(taskId, "working");
  if (S().profile.full_name) await typeInto(name, S().profile.full_name, my);
  await say(taskId, t("done", lang), my);
  S().setStatus(taskId, "done");
}

async function askText(taskId: string, question: string, my: number) {
  const id = uid();
  S().push(taskId, { id, kind: "choice", question, choices: [] });
  S().setStatus(taskId, "waiting");
  S().setSheet(true);
  const v = await waitFor(id);
  guard(my);
  S().update(taskId, id, { picked: v } as Partial<Msg>);
  return v;
}

async function scam(taskId: string, text: string, my: number) {
  const lang = S().lang;
  S().setSheet(true);
  await say(taskId, t("checking", lang), my);
  await sleep(700);
  const r = checkMessage(text);
  S().push(taskId, {
    id: uid(), kind: "verdict", verdict: r.verdict, link: r.link, reasons: r.reasons,
    title: r.verdict === "scam" ? VERDICT.scam[lang] : r.verdict === "safe" ? VERDICT.safe[lang] : VERDICT.unsure[lang],
  });
  await say(taskId, t(r.verdict, lang), my);
  S().setStatus(taskId, "done");
}

async function paper(taskId: string, text: string, my: number) {
  const lang = S().lang;
  S().setSheet(true);
  if (text !== "sample") {
    await say(taskId, t("needServer", lang), my);
    const v = await choose(taskId, CHOICES.paper[lang], [SAMPLE_LETTER_REF[lang]], my);
    if (!v) return;
  }
  await say(taskId, t("explaining", lang), my);
  S().push(taskId, { id: uid(), kind: "explain", title: "Lagoon Water Board", image: "/samples/letter.webp", sections: LETTER[lang] });
  for (const sec of LETTER[lang]) await say(taskId, sec.text, my);
  S().setStatus(taskId, "done");
}

// ---- words used above --------------------------------------------------------------------------------------------

type L = Record<Lang, string>;
const HELP: L = {
  en: "I can register you for the Skills Fair, check if a message is a scam, or read a letter for you.",
  pcm: "I fit register you for Skills Fair, check if message na scam, or read letter for you.",
  yo: "Mo lè forúkọ yín sílẹ̀ fún Skills Fair, yẹ̀ ọ̀rọ̀ wò bóyá jìbìtì ni, tàbí ka lẹ́tà fún yín.",
  ha: "Zan iya yi maka rajista don Skills Fair, duba ko saƙo zamba ne, ko karanta maka wasiƙa.",
  ig: "Enwere m ike idebanye aha gị maka Skills Fair, lelee ma ozi ọ bụ aghụghọ, ma ọ bụ gụọrọ gị akwụkwọ ozi.",
};
const HELP_Q: L = { en: "What would you like?", pcm: "Wetin you want?", yo: "Kí ni ẹ fẹ́?", ha: "Me kake so?", ig: "Gịnị ka ị chọrọ?" };
const CHOICES: Record<"register" | "scam" | "paper", L> = {
  register: { en: "Register for Skills Fair", pcm: "Register for Skills Fair", yo: "Forúkọsílẹ̀ fún Skills Fair", ha: "Rajista don Skills Fair", ig: "Debanye aha maka Skills Fair" },
  scam: { en: "Check a message", pcm: "Check message", yo: "Yẹ ọ̀rọ̀ kan wò", ha: "Duba saƙo", ig: "Lelee ozi" },
  paper: { en: "Read a letter", pcm: "Read letter", yo: "Ka lẹ́tà kan", ha: "Karanta wasiƙa", ig: "Gụọ akwụkwọ ozi" },
};
export const SAMPLE_LETTER_REF: L = { en: "Use the sample letter", pcm: "Use the sample letter", yo: "Lo lẹ́tà àpẹẹrẹ", ha: "Yi amfani da wasiƙar misali", ig: "Jiri akwụkwọ ozi ihe atụ" };
const PHONE_Q: L = { en: "What is your phone number?", pcm: "Wetin be your phone number?", yo: "Kí ni nọ́ńbà fóònù yín?", ha: "Mene ne lambar wayarka?", ig: "Gịnị bụ nọmba ekwentị gị?" };
const READBACK: L = { en: "I wrote {x}. Is that right?", pcm: "I don write {x}. E correct?", yo: "Mo kọ {x}. Ṣé ó tọ́?", ha: "Na rubuta {x}. Daidai ne?", ig: "Edere m {x}. Ọ ziri ezi?" };
const VERDICT: Record<"scam" | "safe" | "unsure", L> = {
  scam: { en: "This is a scam", pcm: "Na scam be this", yo: "Jìbìtì ni èyí", ha: "Wannan zamba ne", ig: "Nke a bụ aghụghọ" },
  safe: { en: "No warning signs", pcm: "No wahala sign", yo: "Kò sí àmì ewu", ha: "Babu alamar haɗari", ig: "Enweghị ihe egwu" },
  unsure: { en: "Be careful", pcm: "Shine your eye", yo: "Ẹ ṣọ́ra", ha: "Ka yi hankali", ig: "Kpachara anya" },
};
export const SAMPLE_SCAM =
  "GTBank: Your account has been BLOCKED due to BVN update. Click https://gtbank-verify.xyz/update within 24 hours and enter your PIN to restore access.";

type Sec = { label: string; text: string; box: [number, number, number, number] };
const BOX = { from: [0.12, 0.065, 0.79, 0.085], amount: [0.12, 0.31, 0.78, 0.125], when: [0.11, 0.5, 0.785, 0.125], warn: [0.11, 0.69, 0.78, 0.065] } as const;
const LETTER: Record<Lang, Sec[]> = {
  en: [
    { label: "Who sent it", text: "This letter is from Lagoon Water Board, about your water bill.", box: [...BOX.from] },
    { label: "How much", text: "They say you owe ₦18,450 for July to September.", box: [...BOX.amount] },
    { label: "By when", text: "Pay by 7 November at their office or your bank. If not, they may cut your water and charge ₦5,000 to reconnect.", box: [...BOX.when] },
    { label: "Be careful", text: "If you have paid already, keep your receipt. Never pay into a personal account if someone calls you.", box: [...BOX.warn] },
  ],
  pcm: [
    { label: "Who send am", text: "This letter na from Lagoon Water Board, about your water bill.", box: [...BOX.from] },
    { label: "How much", text: "Dem say you owe ₦18,450 for July reach September.", box: [...BOX.amount] },
    { label: "When", text: "Pay before 7 November for their office or your bank. If you no pay, dem fit cut your water and charge ₦5,000 to connect am back.", box: [...BOX.when] },
    { label: "Shine your eye", text: "If you don pay already, keep your receipt. No pay into anybody personal account if dem call you.", box: [...BOX.warn] },
  ],
  yo: [
    { label: "Ta ló fi ránṣẹ́", text: "Lẹ́tà yìí wá láti Lagoon Water Board, nípa owó omi yín.", box: [...BOX.from] },
    { label: "Èló ni", text: "Wọ́n ní ẹ jẹ ₦18,450 fún oṣù Keje sí oṣù Kẹsàn-án.", box: [...BOX.amount] },
    { label: "Ìgbà wo", text: "Ẹ san án kí ọjọ́ 7 oṣù Kọkànlá tó pé, ní ọ́fíìsì wọn tàbí ní báǹkì yín. Bí ẹ kò bá san, wọ́n lè gé omi yín, wọ́n á sì gba ₦5,000 láti dá a padà.", box: [...BOX.when] },
    { label: "Ẹ ṣọ́ra", text: "Bí ẹ bá ti san án, ẹ tọ́jú ìwé ẹ̀rí owó yín. Ẹ má san owó sí àkáǹtì ẹnikẹ́ni tó bá pè yín.", box: [...BOX.warn] },
  ],
  ha: [
    { label: "Wa ya aiko", text: "Wannan wasiƙa daga Lagoon Water Board ce, game da kuɗin ruwanka.", box: [...BOX.from] },
    { label: "Nawa ne", text: "Sun ce kana bin su ₦18,450 na watan Yuli zuwa Satumba.", box: [...BOX.amount] },
    { label: "Zuwa yaushe", text: "Ka biya kafin 7 ga Nuwamba a ofishinsu ko a bankinka. Idan ba ka biya ba, za su iya yanke ruwanka kuma su caje ₦5,000 don maido shi.", box: [...BOX.when] },
    { label: "Ka yi hankali", text: "Idan ka riga ka biya, ka ajiye rasidinka. Kada ka biya cikin asusun wani mutum idan wani ya kira ka.", box: [...BOX.warn] },
  ],
  ig: [
    { label: "Onye zitere ya", text: "Akwụkwọ ozi a si na Lagoon Water Board, banyere ụgwọ mmiri gị.", box: [...BOX.from] },
    { label: "Ole ka ọ bụ", text: "Ha kwuru na ị ji ₦18,450 maka ọnwa Julaị ruo Septemba.", box: [...BOX.amount] },
    { label: "Mgbe ole", text: "Kwụọ ụgwọ tupu 7 Nọvemba n'ụlọ ọrụ ha ma ọ bụ n'ụlọ akụ gị. Ọ bụrụ na ịkwụghị, ha nwere ike ịkwụsị mmiri gị ma kwụọ ₦5,000 iji jikọta ya.", box: [...BOX.when] },
    { label: "Kpachara anya", text: "Ọ bụrụ na ị kwụọla ụgwọ, debe akwụkwọ nnata gị. Akwụla ụgwọ n'akaụntụ onye ọ bụla kpọrọ gị.", box: [...BOX.warn] },
  ],
};
