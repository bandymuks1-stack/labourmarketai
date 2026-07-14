import { getTranslations } from "next-intl/server";

import type { ConfidenceLevel } from "@/lib/intelligence/confidence";
import type { FreshnessLabel } from "@/lib/intelligence/freshness";

/**
 * Trust BADGES (Trust Layer v1) — the two small reusable renderers every
 * insight surface can attach:
 *
 *  - ConfidenceBadge: the DERIVED confidence level (low/medium/high/unknown)
 *    — the level arrives from lib/intelligence/confidence.ts, never guessed
 *    here; "unknown" renders as its own honest state, not hidden;
 *  - FreshnessNote: the deterministic age label ("updated today" …
 *    "outdated" … "unknown") from lib/intelligence/freshness.ts.
 *
 * Pure server renderers: no computation, no IO beyond translations.
 */

const CHIP_CLASS =
  "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label";

const CONFIDENCE_TONE: Record<ConfidenceLevel, string> = {
  high: "border-state-success/40 bg-state-success/10 text-state-success",
  medium: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  low: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  unknown: "border-ink-500 bg-ink-800/40 text-text-muted",
};

export async function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const t = await getTranslations("intelligence");
  return (
    <span
      className={`${CHIP_CLASS} ${CONFIDENCE_TONE[level]}`}
      data-testid="intelligence-confidence-badge"
      data-confidence={level}
    >
      {t("confidence.label")}: {t(`confidence.${level}`)}
    </span>
  );
}

export async function FreshnessNote({ label }: { label: FreshnessLabel }) {
  const t = await getTranslations("intelligence");
  return (
    <span
      className="text-[11px] text-text-muted"
      data-testid="intelligence-freshness-note"
      data-freshness-code={label.code}
    >
      {t(
        label.code.replace(/^intelligence\./, "") as never,
        label.params as never,
      ) as string}
    </span>
  );
}
