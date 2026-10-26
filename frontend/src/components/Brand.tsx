import Link from "next/link";

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="jg-cloud" cx="38%" cy="32%" r="72%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".55" stopColor="#EEF3FA" />
          <stop offset="1" stopColor="#B9C7DA" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#0E0F12" />
      <circle cx="32" cy="33" r="17.5" fill="url(#jg-cloud)" />
    </svg>
  );
}

export function Brand({ href = "/", size = 26, className = "" }: { href?: string; size?: number; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Jagora home">
      <Mark size={size} />
      <span className="font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">Jagora</span>
    </Link>
  );
}
