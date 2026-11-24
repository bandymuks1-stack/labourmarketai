import { getTranslations } from "next-intl/server";

import type { SourceLifecycleState } from "@/lib/intelligence/source-lifecycle";
import { INTEL_CHIP_CLASS, INTEL_LIFECYCLE_TONE } from "./badge-styles";

/**
 * Source lifecycle BADGE (Trust Layer v1) — the one reusable chip that says
 * where a data source stands: proposed / approved / active / paused /
 * deprecated / blocked / not available. Tones come from the ONE badge
 * design language (./badge-styles.ts).
 *
 * Pure server renderer over a state DERIVED by
 * lib/intelligence/source-lifecycle.ts — the badge never decides a state
 * itself and can never activate anything. Non-active states are visually
 * distinct from active so a proposed source can never pass for a live one.
 */

const STATE_LEAF: Record<SourceLifecycleState, string> = {
  proposed: "proposed",
  approved: "approved",
  active: "active",
  paused: "paused",
  deprecated: "deprecated",
  blocked: "blocked",
  not_available: "notAvailable",
};

export async function SourceStatusBadge({
  state,
}: {
  state: SourceLifecycleState;
}) {
  const t = await getTranslations("intelligence");
  return (
    <span
      className={`${INTEL_CHIP_CLASS} ${INTEL_LIFECYCLE_TONE[state]}`}
      data-testid="intelligence-source-status-badge"
      data-lifecycle={state}
    >
      {t(`lifecycle.${STATE_LEAF[state]}`)}
    </span>
  );
}
