import { getTranslations } from "next-intl/server";

import type { SourceLifecycleState } from "@/lib/intelligence/source-lifecycle";

/**
 * Source lifecycle BADGE (Trust Layer v1) — the one reusable chip that says
 * where a data source stands: proposed / approved / active / paused /
 * deprecated / blocked / not available.
 *
 * Pure server renderer over a state DERIVED by
 * lib/intelligence/source-lifecycle.ts — the badge never decides a state
 * itself and can never activate anything. Non-active states are visually
 * distinct from active so a proposed source can never pass for a live one.
 */

const STATE_TONE: Record<SourceLifecycleState, string> = {
  proposed: "border-brand-orange/50 bg-brand-orange/10 text-brand-orange",
  approved: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  active: "border-state-success/40 bg-state-success/10 text-state-success",
  paused: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  deprecated: "border-ink-500 bg-ink-800/40 text-text-muted",
  blocked: "border-state-danger/40 bg-state-danger/10 text-state-danger",
  not_available: "border-ink-500 bg-ink-800/40 text-text-muted",
};

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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATE_TONE[state]}`}
      data-testid="intelligence-source-status-badge"
      data-lifecycle={state}
    >
      {t(`lifecycle.${STATE_LEAF[state]}`)}
    </span>
  );
}
