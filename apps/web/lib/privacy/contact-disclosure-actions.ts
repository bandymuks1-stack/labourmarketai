"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  CONSENT_LOCALES,
  EMPLOYER_DATA_DISCLOSURE_V1,
  consentTextHash,
  type ConsentLocale,
} from "@/lib/privacy/consent-definitions";
import {
  DEFAULT_CONTACT_REQUEST_FIELDS,
  isContactDisclosureStatus,
  validateRequestedFields,
  type ContactDisclosureField,
  type ContactDisclosureStatus,
} from "@/lib/privacy/contact-disclosure-shared";
import {
  COMPANY_REQUEST_LIMITS,
  evaluateRequestBudget,
  rollingDayFloorIso,
} from "@/lib/limits/request-rate-limits";

/**
 * Contact-disclosure request lifecycle — server actions (Wagon 1, SHARED
 * CONTACT/CONSENT CONTRACT).
 *
 * Employer side: ASK a discoverable worker for contact details, scoped to ONE
 * own demand + ONE own organization. Worker side, TWO DISTINCT decisions
 * (shared contract — accepting NEVER discloses anything by itself):
 *   1. respondContactDisclosureAction — accept/decline the ASK (request row
 *      only; writes NO consent);
 *   2. grantContactDisclosureAction — SEPARATELY grant the contact-detail
 *      disclosure through the APPLIED consent-ledger RPC
 *      grant_employer_data_disclosure (append-only privacy_consent_events —
 *      the legal truth).
 *
 * A granted disclosure EXPOSES NOTHING through this module: contact fields
 * stay behind can_view_worker RLS + the admin-only
 * record_personal_data_disclosure execution path. This module never selects
 * a contact column.
 *
 * HONEST DEGRADATION: the ask table/RPCs are a DRAFT-gated migration
 * (20260716120000). While unapplied every read reports applied:false and
 * every write returns kind:"needs-migration" — prepared, not enabled; never
 * a fake success.
 *
 * RATE LIMIT (shared contract, app layer, works today): max 10 open + 30/24h
 * asks per requester (lib/limits/request-rate-limits.ts, fail closed on
 * unreadable counts). The draft RPC enforces the same caps in the DB.
 */

const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function toConsentLocale(locale: string): ConsentLocale {
  return (CONSENT_LOCALES as readonly string[]).includes(locale)
    ? (locale as ConsentLocale)
    : "lt";
}

// ─── Employer side ───────────────────────────────────────────────────────────

export type RequestContactDisclosureResult =
  | { kind: "ok"; status: "created" }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "no-organization" }
  | { kind: "rate-limited" }
  | { kind: "already-accepted" }
  | { kind: "error" };

/** Count the caller's open + last-24h asks. Null on any read failure —
 *  evaluateRequestBudget then fails closed. */
async function countOwnContactAsks(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ open: number | null; day: number | null }> {
  const head = async (
    filter: (q: unknown) => unknown,
  ): Promise<number | null> => {
    try {
      let q = asAny(supabase)
        .from("contact_disclosure_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId);
      q = filter(q);
      const { count, error } = await q;
      if (error) return null;
      return typeof count === "number" ? count : null;
    } catch {
      return null;
    }
  };
  const [open, day] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    head((q) => (q as any).eq("status", "created")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    head((q) => (q as any).gt("created_at", rollingDayFloorIso())),
  ]);
  return { open, day };
}

export async function requestContactDisclosureAction(input: {
  locale: string;
  requestId: string;
  workerId: string;
  fields?: readonly string[];
}): Promise<RequestContactDisclosureResult> {
  if (!input.requestId || !input.workerId) return { kind: "error" };
  const fields = validateRequestedFields(
    input.fields ? [...input.fields] : [...DEFAULT_CONTACT_REQUEST_FIELDS],
  );
  if (!fields) return { kind: "error" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  // G6 fix (Stage A): the identity the ask is made AS (and the recipient of a
  // later grant) is the ACTIVE workspace's organization, derived through the
  // ONE canonical resolver — never "the first owned org by created_at", which
  // ignored the workspace switch and could persist the WRONG organization id
  // into the request row. Fail-closed with the module's named reasons when
  // the workspace resolves to no organization.
  const employer = await requireEmployerCompany();
  if (!employer.ok) {
    return employer.reason === "unauthenticated"
      ? { kind: "not-authed" }
      : { kind: "no-organization" };
  }
  const organizationId = employer.organizationId;

  // App-layer budget FIRST (works today; the draft RPC re-checks in the DB).
  // While the ask table is unapplied the counts read null; we must not let
  // that mask the honest needs-migration answer — probe the table first.
  const probe = await asAny(supabase)
    .from("contact_disclosure_requests")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  if (probe.error) {
    if (probe.error.code && ABSENT.has(probe.error.code)) {
      return { kind: "needs-migration" };
    }
    return { kind: "error" };
  }
  const counts = await countOwnContactAsks(supabase, user.id);
  const budget = evaluateRequestBudget(
    { openCount: counts.open, last24hCount: counts.day },
    COMPANY_REQUEST_LIMITS,
  );
  if (!budget.allowed) return { kind: "rate-limited" };

  const { data, error } = await asAny(supabase).rpc(
    "propose_contact_disclosure_request_v1",
    {
      p_request_id: input.requestId,
      p_worker_id: input.workerId,
      p_organization_id: organizationId,
      p_requested_fields: fields,
      p_note: null,
    },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) {
    if (data?.error === "already_accepted") return { kind: "already-accepted" };
    if (data?.error === "limit_reached" || data?.error === "rate_limited") {
      return { kind: "rate-limited" };
    }
    return { kind: "error" };
  }
  // Shared contract idempotency: a deduplicated create is still the same
  // honest 'created' state for the UI.
  revalidatePath(`/${input.locale}/dashboard/company/scouting`);
  return { kind: "ok", status: "created" };
}

export interface ScoutingContactRequestState {
  readonly status: ContactDisclosureStatus;
  /** True only when the SEPARATE consent-ledger grant currently exists
   *  (verified live via has_employer_data_disclosure — a worker withdrawal
   *  flips this immediately; never derived from the request row). */
  readonly disclosureGranted: boolean;
}

export interface ScoutingContactRequestStates {
  /** False while the draft-gated ask model is not applied (prepared, not
   *  enabled) — the UI shows the honest unavailable note, no dead button. */
  readonly applied: boolean;
  /** worker_id → newest ask state for THIS demand (owner-scoped read). */
  readonly byWorker: Readonly<Record<string, ScoutingContactRequestState>>;
}

export async function getScoutingContactRequestStates(
  requestId: string,
): Promise<ScoutingContactRequestStates> {
  const none: ScoutingContactRequestStates = { applied: false, byWorker: {} };
  if (!requestId) return none;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return none;

  const { data, error } = await asAny(supabase)
    .from("contact_disclosure_requests")
    .select("worker_id, status, expires_at, organization_id, created_at")
    .eq("owner_id", user.id)
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });
  if (error) return none; // absent table (draft-gated) or read failure

  const byWorker: Record<string, ScoutingContactRequestState> = {};
  const acceptedRows: { workerId: string; organizationId: string }[] = [];
  for (const r of (data ?? []) as {
    worker_id: string;
    status: string;
    expires_at: string | null;
    organization_id: string;
  }[]) {
    if (byWorker[r.worker_id]) continue; // newest row per worker wins
    const expired =
      r.status === "created" &&
      typeof r.expires_at === "string" &&
      Date.parse(r.expires_at) <= Date.now();
    const status = expired ? "expired" : r.status;
    if (!isContactDisclosureStatus(status)) continue;
    byWorker[r.worker_id] = { status, disclosureGranted: false };
    if (status === "accepted") {
      acceptedRows.push({ workerId: r.worker_id, organizationId: r.organization_id });
    }
  }

  // For accepted asks, verify the SEPARATE ledger grant live (honest state:
  // acceptance alone never means disclosure; withdrawal flips this off).
  await Promise.all(
    acceptedRows.map(async ({ workerId, organizationId }) => {
      try {
        const { data: worker } = await asAny(supabase)
          .from("workers")
          .select("profile_id")
          .eq("id", workerId)
          .maybeSingle();
        const profileId = worker?.profile_id as string | null;
        if (!profileId) return;
        const { data: granted } = await asAny(supabase).rpc(
          "has_employer_data_disclosure",
          {
            p_worker_profile: profileId,
            p_recipient_organization_id: organizationId,
            p_context_type: "company_need",
            p_context_id: requestId,
          },
        );
        if (granted === true) {
          byWorker[workerId] = { status: "accepted", disclosureGranted: true };
        }
      } catch {
        // ledger probe unavailable → stays false (fail closed)
      }
    }),
  );

  return { applied: true, byWorker };
}

// ─── Worker side ─────────────────────────────────────────────────────────────

export interface WorkerContactRequestRow {
  readonly id: string;
  readonly status: ContactDisclosureStatus;
  readonly requestedFields: readonly ContactDisclosureField[];
  readonly note: string | null;
  readonly createdAt: string;
  readonly respondedAt: string | null;
  readonly organizationName: string | null;
  readonly needTitle: string | null;
  /** The SEPARATE consent-ledger grant state (decision 2), read live. */
  readonly disclosureGranted: boolean;
}

export type WorkerContactRequestsResult =
  | { kind: "ok"; requests: WorkerContactRequestRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "error" };

/** The worker's own contact-detail asks (names via the SECURITY DEFINER list
 *  RPC — never a raw cross-table read). Empty list is an honest empty. */
export async function listMyContactDisclosureRequests(): Promise<WorkerContactRequestsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc(
    "list_my_contact_disclosure_requests_v1",
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok || !Array.isArray(data.items)) return { kind: "error" };

  const requests: WorkerContactRequestRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of data.items as any[]) {
    const fields = validateRequestedFields(r.requested_fields);
    if (!fields || !isContactDisclosureStatus(r.status)) continue;
    requests.push({
      id: String(r.id),
      status: r.status,
      requestedFields: fields,
      note: typeof r.note === "string" ? r.note : null,
      createdAt: String(r.created_at ?? ""),
      respondedAt: typeof r.responded_at === "string" ? r.responded_at : null,
      organizationName:
        typeof r.organization_name === "string" ? r.organization_name : null,
      needTitle: typeof r.need_title === "string" ? r.need_title : null,
      disclosureGranted: r.disclosure_granted === true,
    });
  }
  return { kind: "ok", requests };
}

export type RespondContactDisclosureResult =
  | { kind: "ok"; status: "accepted" | "declined" }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "not-open" }
  | { kind: "expired" }
  | { kind: "error" };

/** Decision 1 (shared contract): answer the ASK. Writes NO consent —
 *  accepting alone discloses nothing. */
export async function respondContactDisclosureAction(input: {
  locale: string;
  id: string;
  decision: "accepted" | "declined";
}): Promise<RespondContactDisclosureResult> {
  if (!input.id || (input.decision !== "accepted" && input.decision !== "declined")) {
    return { kind: "error" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data: resp, error: respError } = await asAny(supabase).rpc(
    "respond_contact_disclosure_request_v1",
    { p_id: input.id, p_decision: input.decision },
  );
  if (respError) {
    if (respError.code && ABSENT.has(respError.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!resp?.ok) {
    if (resp?.error === "expired") return { kind: "expired" };
    if (resp?.error === "not_open") return { kind: "not-open" };
    return { kind: "error" };
  }
  revalidatePath(`/${input.locale}/dashboard/privacy`);
  return { kind: "ok", status: input.decision };
}

export type GrantContactDisclosureResult =
  | { kind: "ok" }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "not-accepted" }
  | { kind: "stale-version" }
  | { kind: "error" };

/** Decision 2 (shared contract): the SEPARATE contact-detail disclosure
 *  grant, recorded in the APPLIED append-only consent ledger. Only offered
 *  for an ask the worker already ACCEPTED; declining or ignoring the ask
 *  never reaches this. */
export async function grantContactDisclosureAction(input: {
  locale: string;
  id: string;
}): Promise<GrantContactDisclosureResult> {
  if (!input.id) return { kind: "error" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  // Load the ask (RLS: requester, subject worker or admin can read it).
  const { data: row, error: rowError } = await asAny(supabase)
    .from("contact_disclosure_requests")
    .select("id, request_id, organization_id, worker_id, requested_fields, status")
    .eq("id", input.id)
    .maybeSingle();
  if (rowError) {
    if (rowError.code && ABSENT.has(rowError.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!row) return { kind: "error" };
  if (row.status !== "accepted") return { kind: "not-accepted" };

  // The caller must BE the subject worker (the ledger RPC also verifies the
  // caller is a worker; this pins the grant to the right ask).
  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("id", row.worker_id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { kind: "error" };

  const fields = validateRequestedFields(row.requested_fields);
  if (!fields) return { kind: "error" };

  const def = EMPLOYER_DATA_DISCLOSURE_V1;
  const { data: grant, error: grantError } = await asAny(supabase).rpc(
    "grant_employer_data_disclosure",
    {
      p_version: def.version,
      p_hash: consentTextHash(def),
      p_locale: toConsentLocale(input.locale),
      p_source: "privacy_contact_request",
      p_recipient_organization_id: row.organization_id,
      p_context_type: "company_need",
      p_context_id: row.request_id,
      p_selected_fields: fields,
    },
  );
  if (grantError) {
    if (grantError.code && ABSENT.has(grantError.code)) {
      return { kind: "needs-migration" };
    }
    return { kind: "error" };
  }
  if (!grant?.ok) {
    if (grant?.error === "stale_consent_version") return { kind: "stale-version" };
    return { kind: "error" };
  }
  revalidatePath(`/${input.locale}/dashboard/privacy`);
  return { kind: "ok" };
}
