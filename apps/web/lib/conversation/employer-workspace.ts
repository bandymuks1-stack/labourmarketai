"use server";

import "server-only";

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listCompanyDemands, runScouting } from "@/lib/scouting/scouting";
import { anonymizedToken } from "@/lib/scouting/scout-safe-view";
import { deriveCandidatePipelineStage } from "@/lib/pipeline/candidate-pipeline";
import { loadDemandPipelineFacts } from "@/lib/pipeline/candidate-pipeline-facts";

import {
  EMPLOYER_CANDIDATES_LIMIT,
  EMPLOYER_DEMANDS_LIMIT,
  type EmployerCandidateGapCode,
  type EmployerCandidateRow,
  type EmployerCandidatesResult,
  type EmployerDemandRow,
  type EmployerDemandsResult,
} from "@/lib/conversation/employer-workspace-contract";

/**
 * Employer chat-workspace READ adapter (W8 employer chat workspace).
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The employer half of the chat-first workspace had a hole the W4 AI workflow
 * named out loud in its own source: `runFindWorkers` ends with
 * "scoutingNotInWorkspaceYet" and returns NO chip, because
 * "running the scouting engine per demand needs a resolver so the candidates
 * land in the Context Panel; until that exists the AI states where the work
 * stops instead of handing the person a route".
 *
 * This is that resolver, and it is deliberately the THINNEST thing that can be:
 * two adapters over two canonical reads that already exist and are already the
 * scouting page's own source.
 *
 *   listCompanyDemands()  →  the company's own demands (workspace-gated)
 *   runScouting(id)       →  ranked candidates for ONE demand
 *
 * ─── WHAT IT MAY NEVER DO ───────────────────────────────────────────────────
 * NO SECOND MATCHING ENGINE. Not one line of ranking, scoring, filtering or
 * fit derivation happens here. `runScouting` runs match-v1 over the
 * RLS-scoped supply, ranks with the shared §19 comparator, and this function
 * reads its output in the order it arrived. Re-sorting here would be a second
 * engine that agrees with the first only by luck.
 *
 * NO SECOND READINESS. `dataReadiness` in the result registry is the ONE gate
 * that decides whether the panel may render; this module never second-guesses
 * it and never renders anything itself.
 *
 * NO SECOND AUTHORIZATION. `runScouting` already refuses outside a company
 * context (`no-company-context`) and already scopes every row to the caller
 * through RLS. This module re-checks nothing and grants nothing — it forwards
 * the canonical verdict, including the honest failure kinds, unchanged.
 *
 * NO CONTACT DATA. The projection reads only `ScoutSafeCandidate`, which the
 * Step 3A visibility policy already stripped and `assertContactSafe` already
 * proved. There is no field here that policy did not approve.
 */

/** Map the canonical gap union onto the opaque code the panel localizes. */
function gapCodes(
  gaps: readonly { readonly code: string }[],
): readonly EmployerCandidateGapCode[] {
  const known: readonly string[] = [
    "skills_missing",
    "language_missing",
    "country_mismatch",
    "location_outside_radius",
    "pay_above_offer",
    "accommodation_needed_not_provided",
    "profession_mismatch",
  ];
  // Default-closed: an unrecognized code is dropped rather than rendered raw.
  return gaps
    .map((g) => g.code)
    .filter((c): c is EmployerCandidateGapCode => known.includes(c));
}

/**
 * The company's own demands, for the chat and for the panel's demand picker.
 *
 * `listCompanyDemands` returns `[]` for BOTH "no company context" and "no
 * demands" — a distinction the chat has to make, because one is fixed by
 * switching workspace and the other by describing a need. So the canonical
 * context resolver is asked FIRST and its reason is forwarded; only then is
 * the list read.
 */
export async function loadEmployerDemandsForChat(): Promise<EmployerDemandsResult> {
  try {
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind !== "ok") return { kind: "no-company-context", reason: ctx.reason };

    const demands = await listCompanyDemands();
    if (demands.length === 0) return { kind: "empty" };

    return {
      kind: "demands",
      demands: demands.slice(0, EMPLOYER_DEMANDS_LIMIT).map(
        (d): EmployerDemandRow => ({
          requestId: d.id,
          title: d.title,
          status: d.status,
          structured: d.structured,
          // Title-only derivation here — see the contract's degradation note.
          needSource: d.needSource,
        }),
      ),
    };
  } catch {
    // An infrastructure failure is NOT an empty company. Its own kind.
    return { kind: "blocked" };
  }
}

/**
 * Ranked candidates for ONE of the company's own demands, projected for the
 * Context Panel.
 *
 * `requestId` is a REQUEST, never a permission: it is handed straight to
 * `runScouting`, which re-derives the company context, verifies the demand is
 * the caller's own (`profile_id = auth.uid()`, with RLS behind it) and answers
 * `not-found` for anything else. A hand-typed `?demand=` in the URL therefore
 * buys exactly nothing.
 */
export async function loadEmployerCandidatesForChat(
  requestId: string,
): Promise<EmployerCandidatesResult> {
  if (typeof requestId !== "string" || requestId.trim() === "") {
    return { kind: "not-found" };
  }

  let result;
  try {
    result = await runScouting(requestId);
  } catch {
    return { kind: "error" };
  }

  // Every canonical failure kind keeps its own identity — see the contract's
  // note on why collapsing any two of them would be a lie.
  if (result.kind === "not-found") return { kind: "not-found" };
  if (result.kind === "needs-migration") return { kind: "needs-migration" };
  if (result.kind === "error") return { kind: "error" };
  if (result.kind === "no-company-context") {
    return { kind: "no-company-context", reason: result.reason };
  }

  const demand: EmployerDemandRow = {
    requestId: result.demand.id,
    title: result.demand.title,
    status: result.demand.status,
    structured: result.demand.structured,
    // The AUTHORITATIVE derivation — `runScouting` ran it over the whole row.
    needSource: result.demand.needSource,
  };

  if (result.kind === "not-structured") return { kind: "not-structured", demand };

  // Ranked order is the ENGINE's order. The slice takes the top of the list
  // the §19 comparator produced; nothing is re-sorted here.
  const shown = result.candidates.slice(0, EMPLOYER_CANDIDATES_LIMIT);

  // The two pair-level facts the safe candidate view does not carry — the SAME
  // loader the scouting page uses, so the stage shown in the panel and the
  // stage shown on the full screen are one derivation, not two.
  let facts;
  try {
    facts = await loadDemandPipelineFacts(
      requestId,
      shown.map((c) => c.workerId),
    );
  } catch {
    // Honest degradation: absent facts fall through the precedence ladder to
    // the lower rungs. Nothing is invented, and the list still renders.
    facts = { bookingByWorker: new Map<string, string>(), conversationByWorker: new Set<string>() };
  }

  const candidates: readonly EmployerCandidateRow[] = shown.map((c) => {
    const bookingStatus = facts.bookingByWorker.get(c.workerId) ?? null;
    return {
      workerId: c.workerId,
      label: anonymizedToken(c.preview.anonymizedLabel),
      professionSlug: c.professionSlug,
      matchStatus: c.match.status,
      eligible: c.match.eligible,
      coveragePct: c.match.skillFit ? c.match.skillFit.pct : null,
      confirmedCount: c.match.evidence.matchedManagerConfirmed,
      gaps: gapCodes(c.match.gaps),
      // `location` is the visibility policy's own profile-safe field (the
      // country the candidate declared) — read from the preview, never from
      // the raw worker row.
      country: c.preview.location,
      canContact: c.canContact,
      shortlistStatus: c.shortlistStatus,
      shortlistNote: c.shortlistNote,
      // Derived at read time from the existing rows (P4) — no 7th enum. The
      // worker-initiated interest signal comes from the SAME scouting read, so
      // the panel's stage and the scouting page's stage are one derivation
      // over one fact set.
      pipelineStage: deriveCandidatePipelineStage({
        shortlistStatus: c.shortlistStatus,
        interestStatus: result.interestByWorker[c.workerId] ?? null,
        bookingStatus,
        conversationExists: facts.conversationByWorker.has(c.workerId),
      }),
      bookingStatus,
    };
  });

  return {
    kind: "ok",
    demand,
    candidates,
    total: result.candidates.length,
    capped: result.candidates.length > shown.length,
    retrievalCapped: result.retrieval.capped,
  };
}
