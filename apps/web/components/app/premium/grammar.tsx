import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE PREMIUM GRAMMAR — the owner-accepted internal design class (frozen at
 * 4e695e261, branch feat/cc/visual-language-proof), ported as GRAMMAR onto the
 * product's own tokens. Never the proof's fixtures: every value a page shows
 * comes from its canonical reader.
 *
 *   eyebrow → headline with ONE accent word → one-line sub   (the rhythm)
 *   stamp   provenance / state / dates — small tracked mono
 *   mark    solid = a second party stands behind it; hollow = the person's
 *           own record; dashed = declared, nothing shows it yet
 */

export type EvidenceLevel = "confirmed" | "recorded" | "declared";

export function Stamp({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn("font-mono text-[0.72rem] uppercase leading-snug tracking-[0.14em] text-text-muted [font-feature-settings:'tnum']", className)}>
      {children}
    </span>
  );
}

/** Gold eyebrow — the first line of every region. */
export function Eyebrow({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn("font-mono text-[0.7rem] uppercase tracking-[0.14em] text-brand-orange", className)}>{children}</span>
  );
}

/** "Where things *stand*." — exactly one accent word, set in the accent face. */
export function Accented({ text, className }: { readonly text: string; readonly className?: string }) {
  const parts = text.split("*");
  return (
    <span className={className}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <em key={i} className="font-accent font-normal italic tracking-[-0.01em] text-brand-orange">
            {p}
          </em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

/** The region head — repeated at every region; that repetition is the rhythm. */
export function RegionHead({
  eyebrow,
  title,
  sub,
  className,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly sub?: string;
  readonly className?: string;
}) {
  return (
    <header className={cn("flex flex-col", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2.5 font-display text-[clamp(1.55rem,2.6vw,2.15rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-text-primary">
        <Accented text={title} />
      </h2>
      {sub ? <p className="mt-2.5 max-w-[52ch] text-[0.95rem] leading-snug text-text-muted">{sub}</p> : null}
    </header>
  );
}

export function LevelMark({ level, className }: { readonly level: EvidenceLevel; readonly className?: string }) {
  return (
    <span
      aria-hidden
      data-level={level}
      className={cn(
        "inline-block h-[7px] w-[7px] shrink-0 rounded-full",
        level === "confirmed" && "bg-text-primary",
        level === "recorded" && "border border-text-primary/70",
        level === "declared" && "border border-dashed border-text-muted",
        className,
      )}
    />
  );
}

/** What stands behind something, as a thin bar — the numbers are always also written as text. */
export function EvidenceBar({
  confirmed,
  recorded,
  width = 72,
  label,
  className,
}: {
  readonly confirmed: number;
  readonly recorded: number;
  readonly width?: number;
  /** Accessible text, already localised (e.g. "12 h confirmed, 40 h recorded"). */
  readonly label: string;
  readonly className?: string;
}) {
  const total = Math.max(confirmed + recorded, 0);
  const scale = Math.max(total, 8);
  const c = total === 0 ? 0 : (confirmed / scale) * 100;
  const r = total === 0 ? 0 : (recorded / scale) * 100;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative inline-block h-[3px] overflow-hidden rounded-full bg-text-primary/10", className)}
      style={{ width }}
    >
      <span className="absolute inset-y-0 left-0 bg-text-primary" style={{ width: `${Math.min(100, c)}%` }} />
      <span
        className="absolute inset-y-0 bg-text-primary/35"
        style={{ left: `${Math.min(100, c)}%`, width: `${Math.min(100 - Math.min(100, c), r)}%` }}
      />
    </span>
  );
}
