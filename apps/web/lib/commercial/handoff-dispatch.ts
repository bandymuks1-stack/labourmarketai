import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildWorkerVacancyInterestEnvelope,
  HANDOFF_ENVELOPE_KIND,
  type WorkerVacancyInterestEnvelopeV1,
} from "./handoff-contract";

/**
 * THE DISPATCHER — hands queued `commercial_handoffs` rows to Nonstop's
 * receiving door, one envelope per row, and marks each `delivered` ONLY on
 * a 2xx/duplicate answer. Inert until the owner configures the door:
 *
 *   NONSTOP_HANDOFF_ENDPOINT  https://nonstopgroup.eu/api/partners/labourmarket/handoffs/v1
 *   NONSTOP_HANDOFF_TOKEN     the bearer Nonstop issued for LabourMarket.ai
 *                             (server env only; never printed, never logged)
 *
 * TWO TRIGGERS, ONE DISPATCHER (connection 2026-09-17): the Vercel cron
 * `/api/cron/commercial-handoffs` is the retry SWEEP (the project is on the
 * Hobby plan, whose crons fire at most once a day), and the interest write
 * path calls this same function right after it creates or re-queues a
 * handoff (`dispatchAfterHandoff`), so a fresh hand-off reaches the door in
 * seconds. Both paths read the same queue and mark the same rows; there is
 * no second queue and no second scheduler.
 *
 * While either is unset `dispatchQueuedHandoffs` answers `not_configured`
 * and performs NO network call and NO status change — the queue simply
 * waits. This mirrors the inbound referral door (Nonstop → LabourMarket,
 * `docs/integrations/EXTERNAL_WORKER_REFERRAL_V1.md`) in the other
 * direction; the receiving contract is `docs/integrations/
 * NONSTOP_COMMERCIAL_HANDOFF_V1.md`.
 *
 * WHAT THIS IS NOT: employer outreach. The recipient is Nonstop Group — a
 * partner system under its own owner gate — never an employer, never a
 * worker. Nothing here emails, messages or bulk-contacts anyone.
 *
 * DATA PATH: `list_queued_commercial_handoffs_v1` (SECURITY DEFINER,
 * service_role only) projects the allow-listed facts from the canonical
 * tables at read time; the pure envelope builder shapes them. service_role
 * holds no table grant on skills / professions / languages / profiles and
 * needs none.
 */

export const NONSTOP_HANDOFF_ENDPOINT_ENV = "NONSTOP_HANDOFF_ENDPOINT";
export const NONSTOP_HANDOFF_TOKEN_ENV = "NONSTOP_HANDOFF_TOKEN";
export const HANDOFF_SOURCE_HEADER = "X-Handoff-Source";
export const HANDOFF_SOURCE_VALUE = "labourmarket.ai";

/** Hard ceiling per sweep — a partner door is not a firehose. */
const DISPATCH_LIMIT = 25;

export type DispatchSummary =
  | { readonly kind: "not_configured" }
  | { readonly kind: "unavailable"; readonly reason: string }
  | {
      readonly kind: "ran";
      readonly queued: number;
      readonly delivered: number;
      readonly duplicates: number;
      readonly rejected: number;
      /** 409 from the door — a different payload under this id. Fail-closed. */
      readonly conflicts: number;
      /** 401 / 403 — the bearer or the door is misconfigured. Nothing moved. */
      readonly authFailed: number;
      readonly retryLater: number;
    };

interface QueuedRow {
  handoff_id: string;
  created_at: string;
  outreach_state: string;
  employer_key: string;
  proposition_consent: unknown;
  interest_signal_id: string;
  interest_at: string | null;
  interest_status: string;
  match_status: string | null;
  profile_id: string;
  worker_id: string;
  locale: string | null;
  profession_slug: string | null;
  skill_slugs: string[] | null;
  languages: string[] | null;
  availability_status: string | null;
  current_country: string | null;
  basis: "declared" | "evidenced" | "mixed";
  vacancy_id: string;
  provider_key: string;
  external_id: string;
  title: string;
  country: string;
  city: string | null;
  published_at: string;
  expires_at: string | null;
  application_url: string | null;
  vacancy_profession: string | null;
  employer_name: string | null;
  employer_org_id: string | null;
  employer_homepage: string | null;
}

/** Pure: a queued row → the versioned envelope. Exported for the guard. */
export function envelopeFromQueuedRow(row: QueuedRow): WorkerVacancyInterestEnvelopeV1 {
  return buildWorkerVacancyInterestEnvelope({
    handoffId: row.handoff_id,
    createdAt: row.created_at,
    outreachStateAtCreation: row.outreach_state,
    employerKey: row.employer_key,
    propositionConsent: row.proposition_consent,
    worker: {
      profileRef: row.profile_id,
      workerRef: row.worker_id,
      locale: row.locale,
      professionSlug: row.profession_slug,
      skillSlugs: row.skill_slugs ?? [],
      languages: row.languages ?? [],
      availabilityStatus: row.availability_status,
      currentCountry: row.current_country,
      basis: row.basis,
    },
    vacancy: {
      vacancyRef: row.vacancy_id,
      providerKey: row.provider_key,
      externalId: row.external_id,
      title: row.title,
      country: row.country,
      city: row.city,
      publishedAt: row.published_at,
      expiresAt: row.expires_at,
      applicationUrl: row.application_url,
      professionSlug: row.vacancy_profession,
    },
    employer: {
      name: row.employer_name ?? "",
      externalOrgId: row.employer_org_id,
      homepage: row.employer_homepage,
    },
    interest: {
      signalRef: row.interest_signal_id,
      expressedAt: row.interest_at ?? row.created_at,
      matchStatus: row.match_status,
    },
  });
}

export function handoffDoorSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { endpoint: string; token: string } | null {
  const endpoint = env[NONSTOP_HANDOFF_ENDPOINT_ENV]?.trim() ?? "";
  const token = env[NONSTOP_HANDOFF_TOKEN_ENV]?.trim() ?? "";
  if (!/^https:\/\//.test(endpoint) || token.length < 32) return null;
  return { endpoint, token };
}

/**
 * What the door's answer means for the row. Pure; guard-pinned.
 *   - 201 delivered / 200 duplicate → the row is marked delivered (the
 *     only two answers that move state);
 *   - 409 conflict → the door holds a DIFFERENT payload under this handoffId.
 *     FAIL-CLOSED: never success, never marked; counted and logged so an
 *     operator sees it; retried by the sweep (the door stays authoritative);
 *   - 400 / 413 / 422 → the envelope was refused (contract); rejected;
 *   - 401 / 403 → authentication / configuration failure; rejected, and the
 *     run reports it as such (nothing is retried into a wrong door);
 *   - 429 / 5xx / network / timeout → retryable; the row stays queued for
 *     the next sweep.
 */
export type PostOutcome = "delivered" | "duplicate" | "conflict" | "rejected" | "auth_failed" | "retry";

export function classifyDoorResponse(status: number): PostOutcome {
  if (status === 201) return "delivered";
  if (status === 200) return "duplicate";
  if (status === 409) return "conflict";
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 400 || status === 413 || status === 422) return "rejected";
  return "retry";
}

async function postEnvelope(
  settings: { endpoint: string; token: string },
  envelope: WorkerVacancyInterestEnvelopeV1,
  fetchImpl: typeof fetch,
): Promise<{ outcome: PostOutcome; http: number | null }> {
  try {
    const res = await fetchImpl(settings.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${settings.token}`,
        [HANDOFF_SOURCE_HEADER]: HANDOFF_SOURCE_VALUE,
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(10_000),
    });
    return { outcome: classifyDoorResponse(res.status), http: res.status };
  } catch {
    return { outcome: "retry", http: null };
  }
}

/** ONE greppable, bounded line per attempted row: handoff id (short), the
 *  outcome word and the HTTP status. Never the payload, never the bearer,
 *  never a person. This is the observability the owner asked for — queued /
 *  attempted / delivered / retryable / conflict / auth failure are
 *  distinguishable from the logs and from the run summary alone. */
export const HANDOFF_DISPATCH_LOG = "[commercial-handoff]";
function logAttempt(handoffId: string, outcome: PostOutcome, http: number | null): void {
  console.log(HANDOFF_DISPATCH_LOG, { handoff: handoffId.slice(0, 8), outcome, http });
}

export async function dispatchQueuedHandoffs(deps?: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: typeof fetch;
  /** Test seam: the admin client factory (production uses the real one). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly adminFactory?: () => any;
}): Promise<DispatchSummary> {
  const settings = handoffDoorSettings(deps?.env ?? process.env);
  if (!settings) return { kind: "not_configured" };
  const fetchImpl = deps?.fetchImpl ?? fetch;

  // The generated Database type predates migration 20260917160000 (types
  // regenerate after the owner applies it); cast at the boundary, once.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any;
  try {
    admin = deps?.adminFactory ? deps.adminFactory() : createAdminClient();
  } catch {
    return { kind: "unavailable", reason: "no_service_env" };
  }

  const { data, error } = await admin.rpc("list_queued_commercial_handoffs_v1", {
    p_limit: DISPATCH_LIMIT,
  });
  if (error) {
    return { kind: "unavailable", reason: error.code ?? "read_failed" };
  }
  const rows = (Array.isArray(data) ? (data as unknown[]) : []) as QueuedRow[];
  const summary = {
    queued: rows.length,
    delivered: 0,
    duplicates: 0,
    rejected: 0,
    conflicts: 0,
    authFailed: 0,
    retryLater: 0,
  };

  for (const row of rows) {
    const envelope = envelopeFromQueuedRow(row);
    if (envelope.kind !== HANDOFF_ENVELOPE_KIND) continue;
    const { outcome, http } = await postEnvelope(settings, envelope, fetchImpl);
    logAttempt(row.handoff_id, outcome, http);
    if (outcome === "delivered" || outcome === "duplicate") {
      // Marked ONLY on the door's own answer. A rejected or unreachable
      // door leaves the row queued; the next sweep tries again.
      const { error: markError } = await admin
        .from("commercial_handoffs")
        .update({ status: "delivered", delivered_at: new Date().toISOString() })
        .eq("id", row.handoff_id)
        .eq("status", "queued");
      if (markError) {
        summary.retryLater += 1;
        continue;
      }
      if (outcome === "delivered") summary.delivered += 1;
      else summary.duplicates += 1;
    } else if (outcome === "rejected") {
      summary.rejected += 1;
    } else if (outcome === "conflict") {
      summary.conflicts += 1;
    } else if (outcome === "auth_failed") {
      summary.authFailed += 1;
      // A misconfigured bearer fails every row identically: stop the sweep,
      // report it, retry nothing into a door that refuses us.
      break;
    } else {
      summary.retryLater += 1;
    }
  }
  console.log(HANDOFF_DISPATCH_LOG, { run: summary });
  return { kind: "ran", ...summary };
}

/**
 * The near-real-time trigger used by the interest write path right after a
 * handoff was created or re-queued: the SAME sweep, bounded, and never able
 * to fail the caller — a door that is down simply leaves the row queued for
 * the cron sweep. Inert while the door is not configured (returns
 * `not_configured` without touching the service key).
 */
export async function dispatchAfterHandoff(): Promise<DispatchSummary> {
  try {
    return await dispatchQueuedHandoffs();
  } catch {
    return { kind: "unavailable", reason: "dispatch_threw" };
  }
}
