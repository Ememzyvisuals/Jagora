"use client";

/* Her avatar: a 3D cartoon face (Microsoft Fluent Emoji, MIT licence) in Nigerian skin tones.
   Everyone gets one when they sign up, picked from their account so it is the same on every device. When she says
   her gender in My details, it moves to the matching set (same place in it); she can also pick any one herself, and
   that choice is kept (and synced with her account). */
import { getToken } from "./account";
import { useApp } from "./store";

export const AVATARS = {
  female: ["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"],
  male: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"],
  neutral: ["n1", "n2", "n3", "n4"],
} as const;
export const ALL_AVATARS: string[] = [...AVATARS.female, ...AVATARS.male, ...AVATARS.neutral];
export const avatarSrc = (id: string) => `/avatars/${id}.webp`;

/** a stable number from her account (the user id inside the sign-in token), or from this device for guests */
function seed(): number {
  let key = "";
  try {
    const t = getToken();
    if (t) key = JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).u || t;
  } catch {}
  if (!key) {
    try {
      key = localStorage.getItem("jagora:guest") || "";
      if (!key) {
        key = Math.random().toString(36).slice(2);
        localStorage.setItem("jagora:guest", key);
      }
    } catch {
      key = "guest";
    }
  }
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** the avatar to show: hers if she picked one, else the one her account gets for her gender */
export function pickAvatar(chosen: string, gender: string): string {
  if (chosen && ALL_AVATARS.includes(chosen)) return chosen;
  const set = gender === "female" ? AVATARS.female : gender === "male" ? AVATARS.male : AVATARS.neutral;
  return set[seed() % set.length];
}

export function useAvatar(): string {
  const chosen = useApp((s) => s.avatar);
  const gender = useApp((s) => s.profile.gender);
  return pickAvatar(chosen, gender);
}
