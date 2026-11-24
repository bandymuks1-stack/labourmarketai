/**
 * explainTopMatches (v1) — PURE. Wraps the canonical matchWorkerToNeed engine into
 * a "top 1–3 best options" explanation: for each candidate it returns the real
 * match result (reasons / gaps / missing data) plus a readiness band (ready /
 * needs_info / reject) and the next action. It NEVER returns more than `max`, and
 * it sorts strongest-first so the default UI shows only the best few — not 1000
 * random results.
 *
 * The caller supplies the subjects (an opaque id + a MatchSubject built from real
 * rows). Wiring this to a live, RLS-scoped worker pool is a later, owner-approved
 * PR — this module stays pure and testable in isolation.
 */
import {
  matchWorkerToNeed,
  matchStrengthOrder,
  type MatchNeed,
  type MatchSubject,
} from "@/lib/market/match-v1";
import type { MatchExplanation, MatchReadiness, NextAction } from "./types";

export interface MatchCandidate {
  /** Opaque id (e.g. worker row id) — NEVER a name. */
  readonly id: string;
  readonly subject: MatchSubject;
}

function readinessOf(
  status: MatchExplanation["status"],
  missingDataCount: number,
): MatchReadiness {
  if (status === "insufficient_data" || missingDataCount > 0) return "needs_info";
  if (status === "strong" || status === "possible") return "ready";
  return "reject";
}

function actionOf(readiness: MatchReadiness): NextAction {
  if (readiness === "ready") return { code: "review_matches" };
  if (readiness === "needs_info") return { code: "request_more_info" };
  return { code: "complete_missing_fields" };
}

export function explainTopMatches(
  need: MatchNeed,
  candidates: readonly MatchCandidate[],
  max = 3,
): MatchExplanation[] {
  const explained: MatchExplanation[] = candidates.map((c) => {
    const result = matchWorkerToNeed(need, c.subject);
    const readiness = readinessOf(result.status, result.missingData.length);
    return {
      subjectId: c.id,
      status: result.status,
      readiness,
      result,
      nextAction: actionOf(readiness),
    };
  });

  // Strongest-first; the default view shows only the best `max`.
  explained.sort(
    (a, b) => matchStrengthOrder(b.status) - matchStrengthOrder(a.status),
  );
  return explained.slice(0, Math.max(0, max));
}
