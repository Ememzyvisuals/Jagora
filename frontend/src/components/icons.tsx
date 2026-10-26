/* Jagora's illustrated icons. One style everywhere: a soft tinted body, crisp rounded outlines in ink,
   one detail in the accent colour. Drawn on a 48 grid, 2.2 px strokes. */
import type { SVGProps } from "react";

type P = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number; tone?: "blue" | "mist" | "amber" | "rose" | "green" };

const TONES = {
  blue: { body: "#E4ECFF", detail: "#1D63ED" },
  mist: { body: "#EEF1F6", detail: "#1D63ED" },
  amber: { body: "#FFF1D6", detail: "#C98612" },
  rose: { body: "#FFE3E8", detail: "#C93A50" },
  green: { body: "#DDF3E8", detail: "#2F9E6E" },
};

function Base({ size = 48, tone = "blue", children, ...rest }: Omit<P, "children"> & { children: (t: (typeof TONES)["blue"]) => React.ReactNode }) {
  const t = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" {...rest}>
      <g stroke="#0E0F12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{children(t)}</g>
    </svg>
  );
}

export const IconSpeak = (p: P) => (
  <Base {...p}>{(t) => <>
    <path d="M9 21c0-7.2 6.5-12 15-12s15 4.8 15 12-6.5 12-15 12c-1.9 0-3.7-.2-5.4-.7L11 36l1.6-6.4C10.3 27.4 9 24.4 9 21z" fill={t.body} />
    <path d="M18 18v6M24 15v12M30 18v6" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconPasteMessage = (p: P) => (
  <Base {...p}>{(t) => <>
    <rect x="11" y="6" width="22" height="36" rx="5" fill={t.body} />
    <path d="M19 10h6" />
    <rect x="15" y="16" width="14" height="9" rx="3.5" fill="#fff" />
    <path d="M30 26.5l3.2-3.2a4 4 0 0 1 5.7 5.7l-3.2 3.2M31 35.5l-3.2 3.2a4 4 0 0 1-5.7-5.7l3.2-3.2M28.5 33.5l4-4" stroke={t.detail} />
  </>}</Base>
);

export const IconSnapPaper = (p: P) => (
  <Base {...p}>{(t) => <>
    <path d="M12 7h17l9 9v25a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill={t.body} />
    <path d="M29 7v9h9" />
    <path d="M16 22h14M16 28h10" />
    <path d="M6 31v-4M6 31h4M42 31v-4M42 31h-4" stroke={t.detail} strokeWidth="2.6" />
    <path d="M6 41v4h4M42 41v4h-4" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconGuide = (p: P) => (
  <Base {...p}>{(t) => <>
    <rect x="7" y="9" width="30" height="13" rx="6.5" fill={t.body} />
    <circle cx="27" cy="15.5" r="9.5" stroke={t.detail} strokeWidth="2" strokeDasharray="3 3.4" />
    <path d="M24 16l15 7-6.5 1.8L30 31z" fill="#fff" />
  </>}</Base>
);

export const IconDoForMe = (p: P) => (
  <Base {...p}>{(t) => <>
    <rect x="6" y="8" width="36" height="30" rx="5" fill={t.body} />
    <path d="M6 15h36" />
    <circle cx="11" cy="11.5" r=".6" fill="#0E0F12" /><circle cx="15" cy="11.5" r=".6" fill="#0E0F12" />
    <rect x="12" y="20" width="24" height="5.5" rx="2.75" fill="#fff" />
    <path d="M12 31h12" />
    <path d="M27 29.5l2.8 2.8 5.2-5.6" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconShield = (p: P) => (
  <Base {...p}>{(t) => <>
    <path d="M24 5l15 5.5v11.2c0 9.6-6.4 17.6-15 21.3-8.6-3.7-15-11.7-15-21.3V10.5z" fill={t.body} />
    <path d="M17.5 24l4.6 4.6 8.8-9.4" stroke={t.detail} strokeWidth="2.8" />
  </>}</Base>
);

export const IconScam = (p: P) => (
  <Base tone="rose" {...p}>{(t) => <>
    <path d="M24 5l15 5.5v11.2c0 9.6-6.4 17.6-15 21.3-8.6-3.7-15-11.7-15-21.3V10.5z" fill={t.body} />
    <path d="M24 15v11" stroke={t.detail} strokeWidth="3" />
    <circle cx="24" cy="32" r="1.6" fill={t.detail} stroke="none" />
  </>}</Base>
);

export const IconLock = (p: P) => (
  <Base {...p}>{(t) => <>
    <path d="M15 21v-5a9 9 0 0 1 18 0v5" />
    <rect x="9" y="21" width="30" height="21" rx="5" fill={t.body} />
    <circle cx="24" cy="30" r="3" fill={t.detail} stroke="none" />
    <path d="M24 33v3.5" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconDetails = (p: P) => (
  <Base {...p}>{(t) => <>
    <rect x="5" y="10" width="38" height="28" rx="5" fill={t.body} />
    <circle cx="17" cy="21" r="4.5" fill="#fff" />
    <path d="M10 32.5c1.4-3.4 4-5 7-5s5.6 1.6 7 5" />
    <path d="M29 20h8M29 26h6" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconLanguages = (p: P) => (
  <Base {...p}>{(t) => <>
    <path d="M6 15c0-4.4 4-8 10.5-8S27 10.6 27 15s-4 8-10.5 8c-1.2 0-2.3-.1-3.4-.4L8 25l1-4C7 19.5 6 17.4 6 15z" fill="#fff" />
    <path d="M21 28c0-5.2 4.8-9 11-9s11 3.8 11 9c0 2.6-1.2 4.8-3 6.4l1 4.6-5.6-2.4c-1.1.3-2.2.4-3.4.4-6.2 0-11-3.8-11-9z" fill={t.body} />
    <path d="M13 15h7M28 28h8" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconRegister = (p: P) => (
  <Base {...p}>{(t) => <>
    <rect x="10" y="9" width="28" height="34" rx="4" fill={t.body} />
    <rect x="18" y="5" width="12" height="7" rx="2.5" fill="#fff" />
    <path d="M16 21h16M16 27h16M16 33h9" />
    <circle cx="33" cy="35" r="5" fill={t.detail} stroke="none" />
    <path d="M31 35l1.4 1.4 2.6-2.8" stroke="#fff" strokeWidth="1.8" />
  </>}</Base>
);

export const IconResult = (p: P) => (
  <Base {...p}>{(t) => <>
    <path d="M4 18L24 9l20 9-20 9z" fill={t.body} />
    <path d="M12 22v8.5c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5V22" fill="#fff" />
    <path d="M44 18v10" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconStatement = (p: P) => (
  <Base tone="green" {...p}>{(t) => <>
    <path d="M11 6h26v36l-4.3-2.6-4.4 2.6-4.3-2.6-4.4 2.6-4.3-2.6L11 42z" fill={t.body} />
    <path d="M17 15h14M17 21h14M17 27h8" />
    <path d="M28 30.5c0-1.2 1-2 2.5-2 1.3 0 2.2.5 2.6 1.4M33 33.2c0 1.2-1 2-2.5 2-1.3 0-2.2-.5-2.6-1.4M30.5 26.8v10" stroke={t.detail} strokeWidth="2" />
  </>}</Base>
);

export const IconLetter = (p: P) => (
  <Base tone="amber" {...p}>{(t) => <>
    <rect x="5" y="11" width="38" height="27" rx="4" fill={t.body} />
    <path d="M6 13l18 13 18-13" />
    <path d="M17 33h14" stroke={t.detail} strokeWidth="2.6" />
  </>}</Base>
);

export const IconBrowser = (p: P) => (
  <Base tone="mist" {...p}>{(t) => <>
    <rect x="5" y="8" width="38" height="32" rx="6" fill={t.body} />
    <path d="M5 16h38" />
    <circle cx="24" cy="28" r="7" fill="#fff" />
    <path d="M17 28h14M24 21c2.2 2 3.2 4.3 3.2 7s-1 5-3.2 7c-2.2-2-3.2-4.3-3.2-7s1-5 3.2-7z" stroke={t.detail} strokeWidth="1.8" />
  </>}</Base>
);
