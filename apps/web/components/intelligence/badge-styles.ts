/**
 * Intelligence BADGE design language (Contextual Intelligence UI v1) — the
 * ONE place every intelligence chip/badge takes its base class and tone
 * from. Guard-pinned (intelligence-ui-consistency.test.ts): no component
 * under components/intelligence may re-declare the chip class or a tone
 * map — confidence, freshness, source, conflict and status badges all read
 * from here, so they cannot drift apart visually.
 *
 * Pure constants — no React, no IO.
 */
import type { IntelligenceCardState } from "@/lib/intelligence/intelligence-view-model";
import type { ConfidenceLevel } from "@/lib/intelligence/confidence";
import type { InsightOriginKind } from "@/lib/intelligence/explainability";
import type { SourceLifecycleState } from "@/lib/intelligence/source-lifecycle";
import type { TrustCardStatus } from "@/lib/intelligence/trust-card-model";

/** Base chip class shared by EVERY intelligence badge. */
export const INTEL_CHIP_CLASS =
  "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label";

/** V1 card states (dashboard/intelligence workspace cards). */
export const INTEL_STATE_TONE: Record<IntelligenceCardState, string> = {
  ready: "border-state-success/40 bg-state-success/10 text-state-success",
  insufficient_data: "border-ink-500 bg-ink-800/40 text-text-muted",
  needs_migration: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  stale: "border-state-amber/40 bg-state-amber/10 text-state-amber",
};

/** Trust-card statuses (contextual cards). Conflict is deliberately loud. */
export const INTEL_TRUST_STATUS_TONE: Record<TrustCardStatus, string> = {
  ready: "border-state-success/40 bg-state-success/10 text-state-success",
  conflict: "border-state-danger/40 bg-state-danger/10 text-state-danger",
  unavailable: "border-ink-500 bg-ink-800/40 text-text-muted",
};

/** Origin kinds — external stays visually distinct from internal
 *  (doctrine: an external figure must never pass for a platform average). */
export const INTEL_ORIGIN_TONE: Record<InsightOriginKind, string> = {
  internal: "border-ink-500 bg-ink-800/40 text-text-secondary",
  external: "border-brand-orange/50 bg-brand-orange/10 text-brand-orange",
  blended: "border-state-amber/50 bg-state-amber/10 text-state-amber",
};

/** Derived confidence levels — unknown renders as its own honest state. */
export const INTEL_CONFIDENCE_TONE: Record<ConfidenceLevel, string> = {
  high: "border-state-success/40 bg-state-success/10 text-state-success",
  medium: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  low: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  unknown: "border-ink-500 bg-ink-800/40 text-text-muted",
};

/** Source lifecycle states (governance-derived). */
export const INTEL_LIFECYCLE_TONE: Record<SourceLifecycleState, string> = {
  proposed: "border-brand-orange/50 bg-brand-orange/10 text-brand-orange",
  approved: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  active: "border-state-success/40 bg-state-success/10 text-state-success",
  paused: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  deprecated: "border-ink-500 bg-ink-800/40 text-text-muted",
  blocked: "border-state-danger/40 bg-state-danger/10 text-state-danger",
  not_available: "border-ink-500 bg-ink-800/40 text-text-muted",
};
