import { getTranslations } from "next-intl/server";

import type { ConfidenceLevel } from "@/lib/intelligence/confidence";
import type { FreshnessLabel } from "@/lib/intelligence/freshness";
import {
  INTEL_CHIP_CLASS,
  INTEL_CONFIDENCE_TONE,
  INTEL_ORIGIN_TONE,
} from "./badge-styles";

/**
 * Trust BADGES (Trust Layer v1 / Contextual UI v1) — the reusable renderers
 * every insight surface attaches. All tones come from the ONE badge design
 * language (./badge-styles.ts):
 *
 *  - ConfidenceBadge: the DERIVED confidence level (low/medium/high/unknown)
 *    — the level arrives from lib/intelligence/confidence.ts, never guessed
 *    here; "unknown" renders as its own honest state, not hidden;
 *  - FreshnessNote: the deterministic age label ("updated today" …
 *    "outdated" … "unknown") from lib/intelligence/freshness.ts;
 *  - OriginBadge: internal / external / blended origin — external always
 *    visually distinct (doctrine);
 *  - ConflictBadge: the loud "conflict detected" chip — rendered ONLY when
 *    the trust layer reported a real conflict.
 *
 * Pure server renderers: no computation, no IO beyond translations.
 */

export async function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const t = await getTranslations("intelligence");
  return (
    <span
      className={`${INTEL_CHIP_CLASS} ${INTEL_CONFIDENCE_TONE[level]}`}
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

export async function OriginBadge({
  originKind,
}: {
  originKind: "internal" | "external" | "blended";
}) {
  const t = await getTranslations("intelligence");
  return (
    <span
      className={`${INTEL_CHIP_CLASS} ${INTEL_ORIGIN_TONE[originKind]}`}
      data-testid="intelligence-origin-badge"
      data-origin={originKind}
    >
      {t(`origin.${originKind}`)}
    </span>
  );
}

export async function ConflictBadge() {
  const t = await getTranslations("intelligence");
  return (
    <span
      className={`${INTEL_CHIP_CLASS} border-state-danger/40 bg-state-danger/10 text-state-danger`}
      data-testid="intelligence-conflict-badge"
    >
      {t("trustCard.conflict.title")}
    </span>
  );
}
