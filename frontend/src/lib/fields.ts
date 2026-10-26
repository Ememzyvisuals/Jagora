/* The same field rules as the backend (backend/jagora/fields.py): spoken numbers in five languages become digits,
   and Nigerian phone numbers and emails are checked before anything is typed. */

const fold = (s: string) =>
  s.replace(/ɗ/g, "d").replace(/ƙ/g, "k").replace(/ɓ/g, "b").toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");

const DIGITS: Record<string, string> = {};
Object.entries({
  "0": "zero oh nought odo sifiri sifili efu ofu",
  "1": "one okan kan ookan daya otu",
  "2": "two eji meji biyu abuo",
  "3": "three eta meta uku ato",
  "4": "four erin merin hudu ano",
  "5": "five arun marun biyar ise",
  "6": "six efa mefa shida isii",
  "7": "seven eje meje bakwai asaa",
  "8": "eight ejo mejo takwas asato",
  "9": "nine esan mesan tara itoolu iteghete",
}).forEach(([d, words]) => words.split(" ").forEach((w) => (DIGITS[w] = d)));

export function spokenDigits(text: string): string {
  let out = "";
  let repeat = 1;
  for (const tok of fold(text).match(/\+?\d+|\p{L}+/gu) ?? []) {
    if (/^\+?\d+$/.test(tok)) {
      out += tok;
      repeat = 1;
    } else if (tok === "double" || tok === "triple") repeat = tok === "double" ? 2 : 3;
    else if (DIGITS[tok]) {
      out += DIGITS[tok].repeat(repeat);
      repeat = 1;
    }
  }
  return out;
}

export function spokenPhone(text: string): string {
  let d = spokenDigits(text);
  if (d.startsWith("+234")) d = "0" + d.slice(4);
  else if (d.startsWith("234") && d.length === 13) d = "0" + d.slice(3);
  else if (d.length === 10 && "789".includes(d[0])) d = "0" + d;
  return d;
}

export const isPhone = (d: string) => /^0[789][01]\d{8}$/.test(d);
export const readablePhone = (d: string) => (d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : d);
export const isEmail = (s: string) => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(s.trim());

export function phoneProblem(d: string): string {
  if (isPhone(d)) return "";
  if (d.length !== 11) return `That has ${d.length} digits. A Nigerian mobile number has 11, like 0803 123 4567.`;
  return "A Nigerian mobile number starts with 070, 080, 081, 090 or 091.";
}

export const NG_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];
