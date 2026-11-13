"use server";

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { outboundLinkOrigin } from "@/lib/domain/canonical";

/**
 * FORMER WORKER ↔ ORGANIZATION HISTORY, the app side of
 * `20261113100000_roster_history_claim_v1` (RED, NOT APPLIED).
 *
 * The database holds every rule; this file only carries words between the
 * screen and the four functions, and it is the ONE place the raw claim token
 * exists: it is minted here, shown once to the manager as a link, and only
 * its SHA-256 digest is sent to the database. A token is never logged, never
 * stored by us and never put in a notification.
 *
 * Nothing here links anything. The link is made by the person's own
 * confirmation through the existing roster-link door
 * (`respondToRosterLink` / `organization_people_subject_decides`), unchanged.
 *
 * While the migration is not applied every call answers `needs_migration`,
 * so the screen says the function is not available instead of failing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST / PostgreSQL: the function is not in this database yet. The same
 *  two codes `lib/invitations/actions.ts` reads for its own RPCs. */
function missing(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function outcomeOf(data: unknown): string {
  const o = (data as { outcome?: unknown } | null)?.outcome;
  return typeof o === "string" ? o : "error";
}

export type HistoryClaimCreateResult =
  | { readonly ok: true; readonly link: string; readonly expiresAt: string | null }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "invalid"
        | "not_found"
        | "already_linked"
        | "awaiting_decision"
        | "rate_limited"
        | "needs_migration"
        | "error";
    };

/**
 * OFFER. Mints a one-time token, stores only its digest, and returns the link
 * ONCE. We cannot show it again: the raw token is nowhere after this call.
 */
export async function createHistoryClaimAction(
  _previous: HistoryClaimCreateResult | null,
  form: FormData,
): Promise<HistoryClaimCreateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const personId = String(form.get("person_id") ?? "").trim();
  const locale = String(form.get("locale") ?? "").trim() || "en";
  if (!UUID.test(personId)) return { ok: false, code: "invalid" };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("create_roster_history_claim_v1", {
    p_person_id: personId,
    p_token_hash: tokenHash,
  });
  if (error) return { ok: false, code: missing(error) ? "needs_migration" : "error" };
  const outcome = outcomeOf(data);
  if (outcome !== "created") {
    const known = ["invalid", "not_found", "already_linked", "awaiting_decision", "rate_limited"] as const;
    return {
      ok: false,
      code: (known as readonly string[]).includes(outcome)
        ? (outcome as (typeof known)[number])
        : "error",
    };
  }

  const h = await headers();
  const origin = outboundLinkOrigin(h.get("host"), h.get("x-forwarded-proto"));
  revalidatePath("/[locale]/dashboard/company/people", "page");
  return {
    ok: true,
    link: `${origin.replace(/\/+$/, "")}/${locale}/history-claim/${token}`,
    expiresAt: ((data as { expires_at?: unknown } | null)?.expires_at as string | null) ?? null,
  };
}

export type HistoryClaimDecisionResult =
  | { readonly ok: true; readonly outcome: "approved" | "rejected" | "revoked" }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "invalid"
        | "not_found"
        | "not_awaiting_decision"
        | "cannot_decide_own"
        | "no_longer_possible"
        | "already_on_roster"
        | "not_live"
        | "needs_migration"
        | "error";
    };

/** CHECK. The organization answers the person who came: approve or reject. */
export async function decideHistoryClaimAction(
  _previous: HistoryClaimDecisionResult | null,
  form: FormData,
): Promise<HistoryClaimDecisionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const claimId = String(form.get("claim_id") ?? "").trim();
  const decision = String(form.get("decision") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  if (!UUID.test(claimId)) return { ok: false, code: "invalid" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } =
    decision === "revoke"
      ? await sb.rpc("revoke_roster_history_claim_v1", { p_claim_id: claimId })
      : decision === "approve" || decision === "reject"
        ? await sb.rpc("decide_roster_history_claim_v1", {
            p_claim_id: claimId,
            p_decision: decision,
            p_note: note.length > 0 ? note.slice(0, 500) : null,
          })
        : { data: null, error: null };
  if (!data && !error) return { ok: false, code: "invalid" };
  if (error) return { ok: false, code: missing(error) ? "needs_migration" : "error" };

  const outcome = outcomeOf(data);
  revalidatePath("/[locale]/dashboard/company/people", "page");
  if (outcome === "approved" || outcome === "rejected" || outcome === "revoked") {
    return { ok: true, outcome };
  }
  const known = [
    "invalid",
    "not_found",
    "not_awaiting_decision",
    "cannot_decide_own",
    "no_longer_possible",
    "already_on_roster",
    "not_live",
  ] as const;
  return {
    ok: false,
    code: (known as readonly string[]).includes(outcome)
      ? (outcome as (typeof known)[number])
      : "error",
  };
}

export type HistoryClaimRedeemResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "unavailable"
        | "email_not_verified"
        | "creator_cannot_redeem"
        | "no_worker_profile"
        | "already_on_roster"
        | "rate_limited"
        | "needs_migration"
        | "error";
    };

/**
 * REDEEM. "It is me." It links nothing and reveals nothing: the organization
 * is now asked to confirm who came, and after that the person still has to
 * accept the offer themselves.
 */
export async function redeemHistoryClaimAction(
  _previous: HistoryClaimRedeemResult | null,
  form: FormData,
): Promise<HistoryClaimRedeemResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const token = String(form.get("token") ?? "").trim();
  if (token.length < 8 || token.length > 200) return { ok: false, code: "unavailable" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("redeem_roster_history_claim_v1", {
    p_token: token,
  });
  if (error) return { ok: false, code: missing(error) ? "needs_migration" : "error" };
  const outcome = outcomeOf(data);
  if (outcome === "redeemed") {
    revalidatePath("/[locale]/history-claim/[token]", "page");
    return { ok: true };
  }
  const known = [
    "unavailable",
    "email_not_verified",
    "creator_cannot_redeem",
    "no_worker_profile",
    "already_on_roster",
    "rate_limited",
  ] as const;
  return {
    ok: false,
    code: (known as readonly string[]).includes(outcome)
      ? (outcome as (typeof known)[number])
      : "error",
  };
}

export type HistoryClaimPreview =
  | { readonly state: "open" | "redeemed" | "approved" | "rejected"; readonly organizationName: string | null }
  | { readonly state: "unavailable" }
  | { readonly state: "needs_migration" };

/** What the holder of a link is told before acting: the organization's name only. */
export async function readHistoryClaimPreview(token: string): Promise<HistoryClaimPreview> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_roster_history_claim_preview_v1", {
    p_token: token,
  });
  if (error) return { state: missing(error) ? "needs_migration" : "unavailable" };
  const outcome = outcomeOf(data);
  if (outcome === "open" || outcome === "redeemed" || outcome === "approved" || outcome === "rejected") {
    return {
      state: outcome,
      organizationName:
        ((data as { organization_name?: unknown } | null)?.organization_name as string | null) ?? null,
    };
  }
  return { state: "unavailable" };
}

export type HistoryClaimRow = {
  readonly claimId: string;
  readonly personId: string;
  readonly rosterName: string;
  readonly status: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly redeemedAt: string | null;
  readonly redeemerName: string | null;
  readonly redeemerEmail: string | null;
};

/** The organization's live claims: open ones and those waiting for its answer. */
export async function readHistoryClaims(
  organizationId: string,
): Promise<{ rows: readonly HistoryClaimRow[]; unavailable: boolean }> {
  if (!UUID.test(organizationId)) return { rows: [], unavailable: false };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("list_roster_history_claims_v1", {
    p_organization_id: organizationId,
  });
  // A read that failed is UNKNOWN, never "there are none" (SEP-7).
  if (error) return { rows: [], unavailable: true };
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  return {
    unavailable: false,
    rows: rows.map((r) => ({
      claimId: String(r.claim_id ?? ""),
      personId: String(r.organization_person_id ?? ""),
      rosterName: String(r.roster_name ?? ""),
      status: String(r.status ?? ""),
      createdAt: String(r.created_at ?? ""),
      expiresAt: String(r.expires_at ?? ""),
      redeemedAt: (r.redeemed_at as string | null) ?? null,
      redeemerName: (r.redeemer_name as string | null) ?? null,
      redeemerEmail: (r.redeemer_email as string | null) ?? null,
    })),
  };
}

export type RosterUnlinkResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "auth" | "invalid" | "reason_required" | "not_found" | "not_linked" | "needs_migration" | "error";
    };

/**
 * REVERSAL by the organization: a wrong link is taken back, with a reason, on
 * the audit trail. The person's own reversal stays `respondToRosterLink`.
 */
export async function unlinkRosterPersonAction(
  _previous: RosterUnlinkResult | null,
  form: FormData,
): Promise<RosterUnlinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const personId = String(form.get("person_id") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  if (!UUID.test(personId)) return { ok: false, code: "invalid" };
  if (reason.length === 0) return { ok: false, code: "reason_required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("unlink_roster_person_v1", {
    p_person_id: personId,
    p_reason: reason.slice(0, 500),
  });
  if (error) return { ok: false, code: missing(error) ? "needs_migration" : "error" };
  const outcome = outcomeOf(data);
  if (outcome === "unlinked") {
    revalidatePath("/[locale]/dashboard/company/people", "page");
    return { ok: true };
  }
  const known = ["reason_required", "not_found", "not_linked"] as const;
  return {
    ok: false,
    code: (known as readonly string[]).includes(outcome)
      ? (outcome as (typeof known)[number])
      : "error",
  };
}
