import type {
  ReadinessPillarKey,
  WorkerReadiness,
} from "@/lib/player-card/readiness";

/**
 * Readiness → next steps (full-completion train PR 2).
 *
 * Turns each UNMET readiness signal into ONE concrete, honest next action the
 * worker can take to improve it. No fake verification, no auto-confirm — every
 * step is a real route the worker controls. The order follows the readiness
 * pillars so the most foundational gap is surfaced first.
 *
 * Pure, deterministic, no DB, no external references.
 */

export type ReadinessStep = {
  pillar: ReadinessPillarKey;
  /** Real in-app route the step points at. */
  href: string;
  /** i18n key (under playerCard.readinessSteps) for the action label. */
  labelKey: string;
};

const STEP_BY_PILLAR: Record<ReadinessPillarKey, { href: string; labelKey: string }> = {
  profession: { href: "/dashboard/profile", labelKey: "profession" },
  availability: { href: "/dashboard/profile", labelKey: "availability" },
  skills: { href: "/dashboard/profile#capabilities", labelKey: "skills" },
  journal: { href: "/dashboard/journal", labelKey: "journal" },
  evidence: { href: "/dashboard/journal", labelKey: "evidence" },
  workCard: { href: "/dashboard/profile", labelKey: "workCard" },
};

/** The ordered next steps for every readiness signal NOT yet met. */
export function readinessNextSteps(readiness: WorkerReadiness): ReadinessStep[] {
  return readiness.pillars
    .filter((p) => !p.met)
    .map((p) => ({
      pillar: p.key,
      href: STEP_BY_PILLAR[p.key].href,
      labelKey: STEP_BY_PILLAR[p.key].labelKey,
    }));
}

/** The single most important next step (or null when fully ready). */
export function primaryReadinessStep(readiness: WorkerReadiness): ReadinessStep | null {
  return readinessNextSteps(readiness)[0] ?? null;
}
