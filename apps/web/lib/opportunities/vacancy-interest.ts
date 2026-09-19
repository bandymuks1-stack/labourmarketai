import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { DomainCaller } from "@/lib/domain/caller";
import { matchWorkerToNeed } from "@/lib/market/match-v1";
import { getPublicVacancyById } from "@/lib/vacancy-store/vacancy-read";
import { buildNeedFromVacancy } from "@/lib/vacancy-sources/vacancy-need";
import {
  buildPropositionConsent,
  decideCommercialHandoff,
  type CommercialIneligibilityCode,
} from "@/lib/commercial/handoff-rule";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { dispatchAfterHandoff } from "@/lib/commercial/handoff-dispatch";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { bestEvidencedProfession } from "./adjacent-directions";
import { buildOwnWorkerContext, buildOwnWorkerContextCore } from "./worker-subject";
import {
  buildMatchSnapshot,
  buildSnapshotContext,
  type InterestStatus,
} from "./interest-snapshot";

/**
 * INTEREST IN A PUBLIC VACANCY — the second source of the ONE interest
 * object (`demand_interest_signals.public_vacancy_id`, migration
 * 20260917160000), and the first action on an external ad that reaches
 * somebody: the commercial partner's workflow, through `commercial_handoffs`.
 *
 * Until 2026-09-17 the only control on an imported ad was the publisher's
 * own advertisement, because an interest signal that delivered nowhere
 * would have been a fake control. It now delivers — so the control is real,
 * and this module is where its honesty lives:
 *
 *   1. the caller's OWN worker context (the same reader the board uses);
 *   2. the vacancy must be LIVE and readable under the caller's own RLS
 *      (`getPublicVacancyById` — active, not expired) — no oracle for
 *      guessed ids: unknown, expired and foreign look identical;
 *   3. the ONE engine's verdict at click time, from the same need builder
 *      the board used (`buildNeedFromVacancy`), stored as the snapshot —
 *      a status band with its basis, never a bare score;
 *   4. the idempotent upsert under the worker's own RLS policy
 *      (`demand_interest_signals_worker_all`), keyed on (worker, vacancy);
 *   5. THEN the commercial rule (`decideCommercialHandoff`) and, when it
 *      holds, `create_commercial_handoff_v1` — SECURITY DEFINER, re-checks
 *      every criterion in the database, idempotent on the signal id. A
 *      handoff that cannot be created never fails the interest: the hand
 *      is raised either way, and the outcome says exactly which.
 *
 * NOTHING LEAVES THE PLATFORM FROM THIS FUNCTION. No email, no message, no
 * webhook here. The handoff is a row; since 2026-09-17 the daily dispatcher
 * (`lib/commercial/handoff-dispatch.ts`, cron-gated) posts queued rows to the
 * commercial partner's durable receiver. Whether a row with
 * `proposition_consent.given = false` may be dispatched at all is an owner
 * rule recorded in docs/integrations/NONSTOP_COMMERCIAL_HANDOFF_V1.md — this
 * function only records the answer; it never decides for the person.
 *
 * CONSENT IS SEPARATE (owner rule §17): interest is not permission to be
 * proposed to the employer. The form asks that question explicitly
 * (`employer-proposition-v1`) and the answer travels on the handoff.
 *
 * Migration not applied yet (column / RPC absent) → `needs-migration`, and
 * the surfaces do not offer the control. Never a dead button.
 */

const RELATION_NOT_FOUND = "42P01";
const COLUMN_NOT_FOUND = "42703";
const FUNCTION_NOT_FOUND = "42883";
const RPC_NOT_FOUND = "PGRST202";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isMissingSchema(error: { code?: string } | null | undefined): boolean {
  const code = error?.code;
  return (
    code === RELATION_NOT_FOUND ||
    code === COLUMN_NOT_FOUND ||
    code === FUNCTION_NOT_FOUND ||
    code === RPC_NOT_FOUND
  );
}

export type VacancyHandoffOutcome =
  | { readonly kind: "created"; readonly outreachState: string }
  | { readonly kind: "exists"; readonly outreachState: string; readonly status: string }
  | { readonly kind: "ineligible"; readonly reason: CommercialIneligibilityCode }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

export type VacancyInterestWriteResult =
  | { kind: "ok"; status: InterestStatus; handoff: VacancyHandoffOutcome }
  | { kind: "invalid" }
  | { kind: "no-worker" }
  | { kind: "not-visible" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/** Cookie-session wrapper over the transport-neutral core. */
export async function expressVacancyInterest(input: {
  vacancyId: string;
  /** The worker's explicit answer to "may the commercial partner present me to this
   *  employer?" — unchecked by default; never inferred from anything. */
  propositionConsent: boolean;
}): Promise<VacancyInterestWriteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };
  return expressVacancyInterestCore({ supabase, userId: user.id }, input);
}

export async function expressVacancyInterestCore(
  caller: DomainCaller,
  input: { vacancyId: string; propositionConsent: boolean },
): Promise<VacancyInterestWriteResult> {
  if (!input.vacancyId || !/^[0-9a-f-]{36}$/i.test(input.vacancyId)) {
    return { kind: "invalid" };
  }
  const supabase = caller.supabase;

  const ctx = await buildOwnWorkerContextCore(caller);
  if (!ctx) return { kind: "no-worker" };

  // 2) LIVE and readable under the caller's own RLS — the same read the
  //    public job page uses. Anything else is "not visible", with no oracle.
  let vacancyRead: Awaited<ReturnType<typeof getPublicVacancyById>>;
  try {
    vacancyRead = await getPublicVacancyById(supabase, input.vacancyId);
  } catch {
    return { kind: "error", message: "vacancy_read_failed" };
  }
  if (vacancyRead.status === "not_provisioned") return { kind: "needs-migration" };
  if (vacancyRead.status !== "ok") return { kind: "not-visible" };
  const vacancy = vacancyRead.vacancy;

  // 3) The ONE engine, the SAME need builder as the board.
  const skillSource = vacancy.skillSlugs.length > 0 ? "recognized_from_text" : null;
  const { need } = buildNeedFromVacancy(vacancy, skillSource);
  const match = matchWorkerToNeed(need, ctx.subject);
  const snapshot = {
    ...buildMatchSnapshot(match, "public_vacancy"),
    context: buildSnapshotContext({
      roleText: vacancy.titleRaw,
      country: vacancy.location.country ?? null,
      locationLabel: vacancy.location.city ?? null,
      companyName: vacancy.employer.name ?? null,
    }),
    source: "public_vacancy",
  };

  // 4) The idempotent upsert, own RLS. `.select("id")` because the handoff
  //    is keyed on the SIGNAL row.
  const { data: signalRow, error } = await asAny(supabase)
    .from("demand_interest_signals")
    .upsert(
      {
        public_vacancy_id: input.vacancyId,
        worker_id: ctx.workerId,
        status: "interested",
        note: null,
        match_snapshot: snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "worker_id,public_vacancy_id" },
    )
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  const signalId = (signalRow as { id?: string } | null)?.id ?? null;

  emitServerFunnelEvent(FUNNEL_EVENTS.vacancyInterestExpressed, {
    source: "opportunities",
    route: "/dashboard/opportunities",
    metadata: { surface: "external_vacancy", role_context: "worker", success: true },
  });

  if (!signalId) {
    return { kind: "ok", status: "interested", handoff: { kind: "error" } };
  }

  // 5) The commercial rule — stated here, enforced again in the database.
  const evidencedProfessionSlug = bestEvidencedProfession({
    workerSkillSlugs: ctx.subject.skills.map((s) => s.uri),
    declaredProfessionSlug: ctx.subject.professionSlug ?? null,
  });
  const decision = decideCommercialHandoff({
    workerMatchable:
      Boolean(ctx.subject.professionSlug || evidencedProfessionSlug) &&
      ctx.skillRowCount > 0,
    source: "public_vacancy",
    interestStatus: "interested",
    vacancyLive: true,
    employer: {
      name: vacancy.employer.name,
      externalOrgId: vacancy.employer.externalOrgId,
      homepage: vacancy.employer.homepage,
    },
    publishedAt: vacancy.publishedAt,
    nowMs: Date.now(),
  });
  if (!decision.eligible) {
    return {
      kind: "ok",
      status: "interested",
      handoff: { kind: "ineligible", reason: decision.reason },
    };
  }

  const handoff = await createHandoffForSignal(
    supabase,
    signalId,
    input.propositionConsent,
  );
  if (handoff.kind === "created") {
    emitServerFunnelEvent(FUNNEL_EVENTS.commercialHandoffCreated, {
      source: "opportunities",
      route: "/dashboard/opportunities",
      metadata: {
        surface: "external_vacancy",
        role_context: "worker",
        success: true,
        result_kind: handoff.outreachState,
      },
    });
  }
  // CONNECTION (2026-09-17): a created or re-queued handoff is handed to the
  // partner door now, through the ONE dispatcher — awaited (serverless can
  // freeze a detached call), bounded, and unable to fail the interest. The
  // cron sweep picks up anything the door did not accept.
  if (handoff.kind === "created" || (handoff.kind === "exists" && handoff.status === "queued")) {
    await dispatchAfterHandoff();
  }
  return { kind: "ok", status: "interested", handoff };
}

async function createHandoffForSignal(
  supabase: SupabaseClient,
  signalId: string,
  propositionConsent: boolean,
): Promise<VacancyHandoffOutcome> {
  try {
    const { data, error } = await asAny(supabase).rpc("create_commercial_handoff_v1", {
      p_signal_id: signalId,
      p_proposition_consent: buildPropositionConsent(propositionConsent),
    });
    if (error) {
      if (isMissingSchema(error)) return { kind: "needs-migration" };
      // P0002 = a database-side criterion did not hold (vacancy closed
      // between read and write, employer not identifiable, …). The interest
      // stands; the handoff honestly does not.
      return { kind: "error" };
    }
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : null;
    if (!row) return { kind: "error" };
    const outreachState = String(row.outreach_state ?? "");
    return row.created === true
      ? { kind: "created", outreachState }
      : { kind: "exists", outreachState, status: String(row.status ?? "") };
  } catch {
    return { kind: "needs-migration" };
  }
}

/** Withdraw own interest in a vacancy (row stays; the DB trigger closes the
 *  handoff — the commercial partner never acts on a lowered hand). */
export async function withdrawVacancyInterest(input: {
  vacancyId: string;
}): Promise<VacancyInterestWriteResult> {
  if (!input.vacancyId) return { kind: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };
  const ctx = await buildOwnWorkerContext(supabase, user.id);
  if (!ctx) return { kind: "no-worker" };

  const { error } = await asAny(supabase)
    .from("demand_interest_signals")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("worker_id", ctx.workerId)
    .eq("public_vacancy_id", input.vacancyId);
  if (error) {
    if (isMissingSchema(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", status: "withdrawn", handoff: { kind: "error" } };
}

/** The worker's OWN handoff rows (RLS: own worker_id) — so the board can say
 *  "the commercial partner was informed" only when a row actually exists. */
/** The handoff is "pending for the partner" only while it is queued — a
 *  closed one (withdrawn before dispatch) or a delivered one must never be
 *  described as waiting. */
export function handoffIsPending(status: string): boolean {
  return status === "queued";
}

export async function listMyHandoffsByVacancy(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ReadonlyMap<string, { status: string; outreachState: string }>> {
  const out = new Map<string, { status: string; outreachState: string }>();
  try {
    const { data, error } = await asAny(supabase)
      .from("commercial_handoffs")
      .select("public_vacancy_id, status, outreach_state")
      .eq("worker_id", workerId);
    if (error || !Array.isArray(data)) return out;
    for (const r of data as {
      public_vacancy_id: string | null;
      status: string;
      outreach_state: string;
    }[]) {
      if (r.public_vacancy_id) {
        out.set(r.public_vacancy_id, { status: r.status, outreachState: r.outreach_state });
      }
    }
    return out;
  } catch {
    return out;
  }
}
