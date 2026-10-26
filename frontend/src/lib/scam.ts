/* Scam check for a message she received. The same signals the backend uses (Google Safe Browsing and domain age are
   added there); this part runs instantly on the phone: who the message claims to be, where its link really goes,
   and what it asks for. */

export type ScamResult = { verdict: "scam" | "safe" | "unsure"; reasons: string[]; link?: string; claimed?: string };

// Nigerian banks and services people are impersonated as, with the websites they really use.
const REAL: { name: string; words: string[]; sites: string[] }[] = [
  { name: "GTBank", words: ["gtbank", "gtb", "guaranty trust"], sites: ["gtbank.com"] },
  { name: "Access Bank", words: ["access bank", "accessbank"], sites: ["accessbankplc.com"] },
  { name: "First Bank", words: ["first bank", "firstbank"], sites: ["firstbanknigeria.com"] },
  { name: "Zenith Bank", words: ["zenith"], sites: ["zenithbank.com"] },
  { name: "UBA", words: ["uba", "united bank for africa"], sites: ["ubagroup.com"] },
  { name: "Opay", words: ["opay"], sites: ["opayweb.com"] },
  { name: "Moniepoint", words: ["moniepoint"], sites: ["moniepoint.com"] },
  { name: "Palmpay", words: ["palmpay"], sites: ["palmpay.com"] },
  { name: "Kuda", words: ["kuda"], sites: ["kuda.com"] },
  { name: "JAMB", words: ["jamb"], sites: ["jamb.gov.ng"] },
  { name: "NIMC", words: ["nimc", "nin "], sites: ["nimc.gov.ng"] },
  { name: "CBN", words: ["cbn", "central bank"], sites: ["cbn.gov.ng"] },
  { name: "MTN", words: ["mtn"], sites: ["mtn.ng", "mtn.com"] },
];

const SECRETS = /\b(bvn|pin|otp|password|cvv|card number|atm card|token)\b/i;
const PRESSURE = /\b(urgent|immediately|within 24 ?hours?|suspended|blocked|restricted|deactivated|last warning|expire[sd]?)\b/i;
const BAIT = /\b(won|winner|prize|reward|gift|bonus|free (money|data|airtime)|lottery|grant|empowerment|claim)\b/i;
const PAY = /\b(pay|send|transfer)\b.{0,30}(₦|n\s?\d|naira|fee|charge)/i;
const RISKY_TLD = /\.(xyz|top|click|link|info|online|site|live|icu|buzz|rest|cfd|sbs|monster|cam|work|support|vip)$/i;
const SHORTENER = /^(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|t\.ly|tiny\.cc)$/i;

function site(host: string) {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length >= 3 && ["gov", "com", "org", "edu", "net", "co"].includes(parts[parts.length - 2])) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function checkMessage(text: string): ScamResult {
  const reasons: string[] = [];
  let score = 0;
  const lower = text.toLowerCase();
  const urlMatch = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+|\b[a-z0-9-]+\.(?:com|ng|net|org|xyz|top|info|online|site|live|link|click|ly|co)(?:\/[^\s]*)?)/i);
  const link = urlMatch?.[0].replace(/[).,]+$/, "");
  const claimed = REAL.find((b) => b.words.some((w) => lower.includes(w)));

  if (link) {
    let host = "";
    try {
      host = new URL(link.startsWith("http") ? link : `https://${link}`).hostname;
    } catch {
      /* not a real address */
    }
    const s = site(host);
    if (claimed && host && !claimed.sites.includes(s)) {
      score += 3;
      reasons.push(`It says it is from ${claimed.name}, but the link goes to ${s}, not ${claimed.sites[0]}.`);
    }
    if (claimed && host && claimed.sites.includes(s)) {
      score -= 1;
      reasons.push(`The link really is ${claimed.name}'s website (${s}).`);
    }
    if (RISKY_TLD.test(host)) {
      score += 2;
      reasons.push(`The address ends in ".${host.split(".").pop()}", which banks and government sites do not use.`);
    }
    if (SHORTENER.test(host)) {
      score += 2;
      reasons.push("The link is shortened, so it hides where it really goes.");
    }
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host)) {
      score += 2;
      reasons.push("The link is a bare number address, not a real website name.");
    }
    if (claimed && host && claimed.words.some((w) => host.includes(w.replace(/\s/g, ""))) && !claimed.sites.includes(s)) {
      score += 1;
      reasons.push(`The address borrows the name "${claimed.name}" to look real.`);
    }
  }
  if (SECRETS.test(text)) {
    score += 3;
    reasons.push("It asks for secret details (PIN, BVN, OTP or password). Real banks never ask for these by message.");
  }
  if (PRESSURE.test(text)) {
    score += 1;
    reasons.push("It tries to rush you with a threat or a deadline.");
  }
  if (BAIT.test(text)) {
    score += 2;
    reasons.push("It promises money or a prize you did not ask for.");
  }
  if (PAY.test(text)) {
    score += 2;
    reasons.push("It asks you to pay a fee first.");
  }
  const verdict = score >= 3 ? "scam" : score <= 0 && link ? "safe" : "unsure";
  if (!reasons.length) reasons.push(link ? "I could not find warning signs in this message." : "There is no link in this message to check.");
  return { verdict, reasons: [...new Set(reasons)], link, claimed: claimed?.name };
}
