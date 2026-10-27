"use client";

/* Her Jagora account: the session token from sign-up or sign-in, and the ALTCHA puzzle the server asks for first. */

export const API = process.env.NEXT_PUBLIC_BACKEND_HTTP || "";
const KEY = "jagora:token";

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}
export function setToken(t: string) {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {}
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Solve the server's proof-of-work puzzle (about half a second on a mid-range phone). */
export async function solveAltcha(): Promise<string> {
  const ch = await (await fetch(`${API}/altcha`)).json();
  const enc = new TextEncoder();
  const BATCH = 400;
  for (let start = 0; start <= ch.maxnumber; start += BATCH) {
    const tries = await Promise.all(
      Array.from({ length: Math.min(BATCH, ch.maxnumber - start + 1) }, async (_, i) => {
        const n = start + i;
        return hex(await crypto.subtle.digest("SHA-256", enc.encode(`${ch.salt}${n}`))) === ch.challenge ? n : -1;
      }),
    );
    const hit = tries.find((n) => n >= 0);
    if (hit !== undefined) return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: hit, salt: ch.salt, signature: ch.signature }));
  }
  throw new Error("puzzle");
}

export async function authenticate(mode: "signup" | "signin", email: string, password: string, code?: string) {
  const altcha = await solveAltcha();
  const r = await fetch(`${API}/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, code: code || undefined, altcha }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "Something went wrong. Try again.");
  setToken(d.token);
  return d.user as { id: string; email: string; credits: number; plan: string };
}
