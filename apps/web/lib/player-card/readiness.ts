import type { WorkerPlayerCard } from "@/lib/player-card/player-card";

/**
 * Worker readiness — an HONEST signal hierarchy for the Player Card ring.
 *
 * This is NOT a rating and NOT a fabricated OVR. It is a count of REAL,
 * already-loaded binary readiness signals the worker has met (profession set,
 * availability set, declared skills, work-journal evidence, supported/confirmed
 * skill, confirmed work card). The ring shows "met of total signals", so a
 * worker always understands what raises their readiness — never a fake score.
 *
 * Pure, deterministic, no DB, no external references.
 */

export type ReadinessLevel = "ready" | "building" | "start";

export type ReadinessPillarKey =
  | "profession"
  | "availability"
  | "skills"
  | "journal"
  | "evidence"
  | "workCard";

export type ReadinessPillar = { key: ReadinessPillarKey; met: boolean };

export type WorkerReadiness = {
  /** How many readiness signals are met. */
  met: number;
  /** Total readiness signals tracked. */
  total: number;
  /** met / total in [0, 1]. */
  fraction: number;
  /** Honest level band derived from the fraction (not a rating). */
  level: ReadinessLevel;
  /** Per-signal breakdown so the UI can show what is missing. */
  pillars: ReadinessPillar[];
};

/** Derive readiness from the REAL fields already on the player card. */
export function deriveWorkerReadiness(card: WorkerPlayerCard): WorkerReadiness {
  const pillars: ReadinessPillar[] = [
    { key: "profession", met: Boolean(card.professionSlug) },
    { key: "availability", met: Boolean(card.availabilityStatus) },
    { key: "skills", met: card.skillsDeclared > 0 },
    { key: "journal", met: card.evidenceEntries > 0 },
    {
      key: "evidence",
      met: card.journalSupportedSkills > 0 || card.verifiedSkills.length > 0,
    },
    { key: "workCard", met: card.workCardConfirmed },
  ];
  const met = pillars.filter((p) => p.met).length;
  const total = pillars.length;
  const fraction = total > 0 ? met / total : 0;
  const level: ReadinessLevel =
    fraction >= 0.8 ? "ready" : fraction >= 0.4 ? "building" : "start";
  return { met, total, fraction, level, pillars };
}

/** The keys of the pillars NOT yet met (UI surfaces them as next steps). */
export function missingReadinessPillars(r: WorkerReadiness): ReadinessPillarKey[] {
  return r.pillars.filter((p) => !p.met).map((p) => p.key);
}
