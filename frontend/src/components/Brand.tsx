import Link from "next/link";

/** Jagora's mark: her cloud, rendered from the real orb, on a patch of sky. */
export function Mark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={size <= 40 ? "/brand/mark-64.png" : "/brand/mark.png"} width={size} height={size} alt="" aria-hidden="true" className={`shrink-0 ${className}`} style={{ borderRadius: size * 0.27 }} />
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
