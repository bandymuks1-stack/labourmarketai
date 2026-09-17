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

type PostOutcome = "delivered" | "duplicate" | "rejected" | "retry";

async function postEnvelope(
  settings: { endpoint: string; token: string },
  envelope: WorkerVacancyInterestEnvelopeV1,
  fetchImpl: typeof fetch,
): Promise<PostOutcome> {
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
    if (res.status === 201) return "delivered";
    if (res.status === 200) return "duplicate";
    if (res.status === 400 || res.status === 401 || res.status === 413 || res.status === 422) {
      return "rejected";
    }
    return "retry";
  } catch {
    return "retry";
  }
}

export async function dispatchQueuedHandoffs(deps?: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: typeof fetch;
}): Promise<DispatchSummary> {
  const settings = handoffDoorSettings(deps?.env ?? process.env);
  if (!settings) return { kind: "not_configured" };
  const fetchImpl = deps?.fetchImpl ?? fetch;

  // The generated Database type predates migration 20260917160000 (types
  // regenerate after the owner applies it); cast at the boundary, once.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any;
  try {
    admin = createAdminClient();
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
  const summary = { queued: rows.length, delivered: 0, duplicates: 0, rejected: 0, retryLater: 0 };

  for (const row of rows) {
    const envelope = envelopeFromQueuedRow(row);
    if (envelope.kind !== HANDOFF_ENVELOPE_KIND) continue;
    const outcome = await postEnvelope(settings, envelope, fetchImpl);
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
    } else {
      summary.retryLater += 1;
    }
  }
  return { kind: "ran", ...summary };
}
