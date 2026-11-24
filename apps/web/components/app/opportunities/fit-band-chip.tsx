import type { FitBand } from "@/lib/opportunities/fit-band";

/**
 * FIT BAND CHIP — the band a row sits in, as text plus §M material.
 *
 * A fit band is SYSTEM_DERIVED (the engine's reading of two sets of stated
 * facts), so every chip carries the dotted edge of that class; the band word
 * is the text the edge never replaces (§M: the edge is never the only
 * signal). Colour follows the engine's verdict and nothing else — gold is
 * reserved for EMPLOYER_CONFIRMED and never appears here; `not_assessed` is
 * muted, never success, because UNKNOWN is not a verdict.
 *
 * Pure presentation: no i18n (the caller resolves the label), no logic. Used
 * by the PASAULIS destination and the conversation readback alike so the
 * two surfaces can never paint the same band differently.
 */
const BAND_TONE: Record<FitBand, string> = {
  strong: "border-state-success/60 bg-state-success/10 text-state-success",
  possible: "border-brand-blue/60 bg-brand-blue/10 text-brand-blue",
  missing_requirement: "border-state-warning/60 bg-state-warning/10 text-state-warning",
  conflict: "border-state-amber/60 bg-state-amber/10 text-state-amber",
  not_assessed: "border-ink-500 bg-ink-800/40 text-text-muted",
};

export function FitBandChip({
  band,
  label,
  testId = "fit-band-chip",
}: {
  readonly band: FitBand;
  /** The band in the reader's words — resolved by the caller. */
  readonly label: string;
  readonly testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      data-band={band}
      data-provenance="system_derived"
      className={`inline-flex min-h-7 flex-none items-center rounded-full border border-dotted px-2.5 py-0.5 text-meta font-semibold ${BAND_TONE[band]}`}
    >
      {label}
    </span>
  );
}
