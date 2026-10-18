import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE PAGE TITLE — the h1 of every signed-in route. One type treatment in the
 * premium grammar (display face, tight tracking, warm-white text) replacing
 * hand-copied h1 class strings that had drifted across text-2xl, text-3xl and
 * text-title.
 *
 * It is deliberately PLAIN: no accent word, no italics, no colour. Owner
 * direction 2026-10-09 — the identity is restrained (black, warm white,
 * champagne gold for selected actions), and a decorative accent on every title
 * is exactly the repetition that was rejected. Hierarchy comes from size,
 * weight and spacing, not from ornament.
 */
export function PageTitle({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-display text-[clamp(1.75rem,3.4vw,2.35rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-text-primary",
        className,
      )}
    >
      {children}
    </h1>
  );
}
