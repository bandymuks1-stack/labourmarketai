import type { ProvenanceClass } from "@/lib/evidence/provenance";
import { cn } from "@/lib/utils";

/**
 * PROVENANCE MATERIAL — the ONE place a provenance class becomes an edge
 * (frozen design contract §2.9; design system A.5 "kilmė yra medžiaga", M).
 *
 *   SELF_DECLARED       dashed grey
 *   EVIDENCE_SUPPORTED  solid cyan
 *   EMPLOYER_CONFIRMED  solid gold — the ONLY gold on a person (scorecard X.28)
 *   SYSTEM_DERIVED      dotted grey
 *
 * The edge is NEVER the only signal: every mount pairs it with the text
 * equivalent (`ProvenanceLine`), and the class is exposed as a data attribute
 * so tests and assistive tooling read the fact, not the colour. Tokens only
 * (`tokens/colors.ts` → globals.css); the gold is the semantic trust accent
 * that already clears AA in both themes.
 */
export const PROVENANCE_EDGE_CLASS: Readonly<Record<ProvenanceClass, string>> = {
  SELF_DECLARED: "border-dashed border-ink-500",
  EVIDENCE_SUPPORTED: "border-solid border-brand-cyan",
  EMPLOYER_CONFIRMED: "border-solid border-trust-accent",
  SYSTEM_DERIVED: "border-dotted border-ink-500",
};

/** The vertical edge itself — a 3 px left border on a zero-width strip, so
 *  the dash/dot/solid material reads without a background fill. */
export function ProvenanceEdge({
  provenanceClass,
  className,
}: {
  readonly provenanceClass: ProvenanceClass;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden
      data-provenance-edge={provenanceClass}
      className={cn(
        "w-0 shrink-0 self-stretch rounded-full border-l-[3px]",
        PROVENANCE_EDGE_CLASS[provenanceClass],
        className,
      )}
    />
  );
}

/** The text equivalent of the edge — the SAME fact in words (a11y S: state is
 *  never colour alone). 13 px basis line, secondary ink. */
export function ProvenanceLine({
  provenanceClass,
  text,
  testid,
  className,
}: {
  readonly provenanceClass: ProvenanceClass;
  /** Already-localised text, e.g. "patvirtino E2E Walker UAB, 2026-09-05". */
  readonly text: string;
  readonly testid?: string;
  readonly className?: string;
}) {
  return (
    <span
      data-provenance={provenanceClass}
      data-testid={testid}
      className={cn("text-basis leading-relaxed text-text-secondary", className)}
    >
      {text}
    </span>
  );
}
