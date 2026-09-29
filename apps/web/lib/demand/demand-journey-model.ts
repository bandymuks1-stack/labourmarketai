/**
 * THE DEMAND JOURNEY — where one need has actually got to (premium company
 * view, owner command 2026-09-29 §18).
 *
 *   NEED → CANDIDATES → SHORTLIST → IN CONTACT → OFFER → ACCEPTED (→ CLOSED)
 *
 * Pure. It is given the facts the scouting page already derived — the need's
 * stored status and each compared candidate's ONE canonical pipeline stage
 * (`deriveCandidatePipelineStage`, never stored) — and counts how many
 * candidates have reached each step. A later stage counts toward every
 * earlier step (an accepted offer was shortlisted, contacted and offered):
 * the counts are a real funnel of people, never a score.
 *
 * AGENCY CANDIDATES COUNT TOO. A person an agency presented for this need is
 * a real candidate of it: presented = shortlisted (they reached the owner's
 * decision), a booking proposed = offered, a booking accepted = accepted.
 * Without them a need filled through an agency read "0 accepted" while the
 * agency's own view showed the placement (production walk 2026-09-29).
 * ONE PERSON, ONE COUNT: someone found both by the company's own search and
 * through an agency is merged by worker id at the furthest step reached.
 *
 * Steps nobody has reached stay `upcoming` — the whole journey is drawn, and
 * nothing claims progress that did not happen. Assignment / work / team are
 * deliberately NOT here: they need a read this page does not make.
 */

import type { CandidatePipelineStage } from "@/lib/pipeline/candidate-pipeline";

export type DemandJourneyStepKey =
  | "need"
  | "candidates"
  | "shortlist"
  | "contact"
  | "offer"
  | "accepted"
  | "closed";

export interface DemandJourneyStep {
  readonly key: DemandJourneyStepKey;
  /** People who reached this step; null for the need / closed steps. */
  readonly count: number | null;
  readonly state: "done" | "current" | "upcoming" | "ended";
}

/** How far along a candidate stage is (rejected = compared only). */
const DEPTH: Record<CandidatePipelineStage, number> = {
  new: 0,
  rejected: 0,
  reviewing: 1,
  contacted: 2,
  interview: 2,
  offer: 3,
  accepted: 4,
};

export function buildDemandJourney({
  demandStatus,
  stages,
  agencyOffers,
}: {
  /** customer_requests.status of the need. */
  readonly demandStatus: string;
  /** The compared candidates and their canonical pipeline stage. */
  readonly stages: readonly { readonly workerId: string; readonly stage: CandidatePipelineStage }[];
  /** Agency-presented candidates: booking_requests.status (null = no booking yet). */
  readonly agencyOffers?: readonly { readonly workerId: string; readonly bookingStatus: string | null }[];
}): DemandJourneyStep[] {
  const byWorker = new Map<string, number>();
  const note = (id: string, d: number) => byWorker.set(id, Math.max(byWorker.get(id) ?? 0, d));
  for (const c of stages) note(c.workerId, DEPTH[c.stage]);
  for (const o of agencyOffers ?? [])
    note(o.workerId, o.bookingStatus === "accepted" ? 4 : o.bookingStatus ? 3 : 1);
  const depths = [...byWorker.values()];
  const reached = (min: number) => depths.filter((d) => d >= min).length;
  const counts: [DemandJourneyStepKey, number][] = [
    ["candidates", depths.length],
    ["shortlist", reached(1)],
    ["contact", reached(2)],
    ["offer", reached(3)],
    ["accepted", reached(4)],
  ];
  // The furthest step anyone reached is the need's CURRENT step.
  let furthest = -1;
  counts.forEach(([, n], i) => {
    if (n > 0) furthest = i;
  });
  const closed = demandStatus === "closed";
  const steps: DemandJourneyStep[] = [
    { key: "need", count: null, state: furthest < 0 && !closed ? "current" : "done" },
    ...counts.map(([key, n], i): DemandJourneyStep => ({
      key,
      count: n,
      state:
        n === 0 ? (closed ? "ended" : "upcoming") : i === furthest && !closed ? "current" : "done",
    })),
  ];
  if (closed) steps.push({ key: "closed", count: null, state: "current" });
  return steps;
}
