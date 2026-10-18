import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readVerifiedSessionEmail } from "@/lib/auth/verified-email-gate";

/**
 * Canonical-journey P3 — claim bridge: public /company-need intake → the
 * claimant's OWN draft demand.
 *
 * Before this bridge the anonymous public intake dead-ended in the operator
 * queue (audit §6/§7): a company that submitted publicly and then signed up
 * had to re-type everything. The bridge closes that loop WITHOUT weakening
 * the intake's security model (deny-all RLS, service-role-only reads):
 *
 *   - AUTHORIZATION IS THE VERIFIED-EMAIL MATCH: a signed-in user may see and
 *     claim ONLY intakes whose contact_email equals an address THEY HAVE
 *     PROVEN (the separate verified-email state, migration 20261003151000 —
 *     NEVER auth.users.email on its own: with "Confirm email" OFF that address
 *     is merely typed, so anyone could register as a victim's address and read
 *     or claim the victim's company-need intake). The verified check runs with
 *     the caller's own client BEFORE the service role is reached, fails closed
 *     (error / missing function / unverified => nothing), and the unverified
 *     state is surfaced as a progressive "verify your e-mail" prompt rather than
 *     a dead end. No listing beyond the caller's own proven address, no
 *     enumeration path (an unverified caller learns nothing about whether an
 *     intake exists), no intake id accepted from the client without the same
 *     verified-email re-check.
 *   - CLAIMING = the existing save_demand_draft RPC (owner-scoped upsert
 *     into customer_requests, status='draft') with the intake's own fields
 *     echoed back — nothing invented. The draft then flows through the ONE
 *     canonical sequence (draft → wizard prefill → submitted → scouting).
 *   - The intake row is marked status='converted' (display-only in the
 *     operator queue; operators cannot set it by hand) so the queue shows
 *     the true outcome.
 *
 * No contact data is exposed beyond what the claimant themselves typed into
 * the public form. Nothing external is ever sent.
 */

const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny<T>(c: T): any {
  return c;
}

/** Statuses still claimable — a rejected or already-converted intake is not. */
const CLAIMABLE = new Set(["new", "contacted", "qualified"]);

export type ClaimableIntake = {
  readonly id: string;
  readonly createdAt: string;
  readonly companyName: string;
  readonly country: string;
  readonly headcount: number | null;
  readonly descriptionExcerpt: string;
};

function normEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export type ClaimableIntakesState =
  | { readonly status: "ok"; readonly intakes: ClaimableIntake[] }
  /** The caller's address is not VERIFIED: nothing is read (the service role is
   *  never reached) and the UI may offer the progressive proof. */
  | { readonly status: "email_unverified" };

/** The caller's own claimable public intakes (VERIFIED-email matched), with the
 *  unverified state kept distinct so the page can offer the proof. Empty on any
 *  other missing state — an absent table / no session / no matches all render
 *  the same honest nothing. */
export async function listClaimablePublicIntakesState(): Promise<ClaimableIntakesState> {
  const supabase = await createClient();
  const proof = await readVerifiedSessionEmail(supabase);
  if (proof.status === "unverified") return { status: "email_unverified" };
  if (proof.status !== "verified") return { status: "ok", intakes: [] };
  return { status: "ok", intakes: await readIntakesFor(proof.email) };
}

/** Back-compat shape for surfaces that only count: unverified reads as none. */
export async function listClaimablePublicIntakes(): Promise<ClaimableIntake[]> {
  const state = await listClaimablePublicIntakesState();
  return state.status === "ok" ? state.intakes : [];
}

/** SERVICE-ROLE read, reachable ONLY from the verified branch above. */
async function readIntakesFor(email: string): Promise<ClaimableIntake[]> {

  try {
    const admin = createAdminClient();
    const { data, error } = await asAny(admin)
      .from("company_need_public_intakes")
      .select("id, created_at, company_name, country, headcount, description, status, contact_email")
      .ilike("contact_email", email)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error || !Array.isArray(data)) return [];
    return data
      .filter(
        (r: { status?: string; contact_email?: string | null }) =>
          CLAIMABLE.has(String(r.status)) &&
          normEmail(r.contact_email) === email,
      )
      .map(
        (r: {
          id: string;
          created_at: string;
          company_name: string | null;
          country: string | null;
          headcount: number | null;
          description: string | null;
        }) => ({
          id: String(r.id),
          createdAt: String(r.created_at),
          companyName: (r.company_name ?? "").slice(0, 160),
          country: (r.country ?? "").slice(0, 40),
          headcount: typeof r.headcount === "number" ? r.headcount : null,
          descriptionExcerpt: (r.description ?? "").slice(0, 200),
        }),
      );
  } catch {
    return [];
  }
}

export type ClaimIntakeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_authenticated"
        | "email_unverified"
        | "not_yours"
        | "not_claimable"
        | "needs_migration"
        | "error";
    };

/** Claim ONE intake into the caller's own draft demand (server action body —
 *  wrapped by claim-public-intake-actions.ts). */
export async function claimPublicIntake(intakeId: string): Promise<ClaimIntakeResult> {
  if (!intakeId) return { ok: false, reason: "error" };

  const supabase = await createClient();
  const proof = await readVerifiedSessionEmail(supabase);
  if (proof.status === "unauthenticated") return { ok: false, reason: "not_authenticated" };
  // Fail closed BEFORE the service role: unverified, errored or malformed all stop here.
  if (proof.status === "unverified") return { ok: false, reason: "email_unverified" };
  if (proof.status !== "verified") return { ok: false, reason: "error" };
  const email = proof.email;

  const admin = createAdminClient();
  const { data: intake, error } = await asAny(admin)
    .from("company_need_public_intakes")
    .select(
      "id, contact_email, status, company_name, country, city_or_region, sector, headcount, start_window, expected_duration, urgency, accommodation, languages, engagement_type, description",
    )
    .eq("id", intakeId)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === RELATION_NOT_FOUND) {
      return { ok: false, reason: "needs_migration" };
    }
    return { ok: false, reason: "error" };
  }
  if (!intake) return { ok: false, reason: "not_yours" };
  // The single authorization fact: the authenticated email owns this intake.
  if (normEmail(intake.contact_email) !== email) {
    return { ok: false, reason: "not_yours" };
  }
  if (!CLAIMABLE.has(String(intake.status))) {
    return { ok: false, reason: "not_claimable" };
  }

  // Echo the intake's own fields into the draft payload (CompanyRequestPayload
  // keys — the same shape the dashboard draft form saves). Nothing invented:
  // absent fields stay absent.
  const join = (parts: Array<string | null | undefined>, sep: string) =>
    parts
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(sep);
  const accommodation = ["yes", "no", "unknown"].includes(
    String(intake.accommodation ?? ""),
  )
    ? String(intake.accommodation)
    : "";
  const payload = {
    title: (intake.sector ?? "").slice(0, 120) || undefined,
    capabilities:
      join(
        [
          intake.description,
          intake.headcount != null ? `Darbuotojų: ${intake.headcount}` : null,
        ],
        "\n",
      ).slice(0, 4000) || undefined,
    location: join([intake.city_or_region, intake.country], ", ").slice(0, 160) || undefined,
    timing: join([intake.start_window, intake.expected_duration], "; ").slice(0, 160) || undefined,
    accommodation,
    languages: (intake.languages ?? "").slice(0, 160) || undefined,
    notes:
      join([intake.urgency, intake.engagement_type], "; ").slice(0, 500) || undefined,
  };

  // Owner-scoped draft upsert — the SAME canonical path the dashboard draft
  // form uses (customer_requests, status='draft', kind='company_request').
  const { error: draftErr } = await asAny(supabase).rpc("save_demand_draft", {
    p_kind: "company_request",
    p_title: payload.title ?? intake.company_name ?? null,
    p_payload: payload,
    p_original_language: "lt",
  });
  if (draftErr) {
    if ((draftErr as { code?: string }).code === "42883") {
      return { ok: false, reason: "needs_migration" };
    }
    return { ok: false, reason: "error" };
  }

  // Mark the true outcome. Draft creation already succeeded — a failure here
  // leaves the queue status behind reality (safe direction, retry-able).
  await asAny(admin)
    .from("company_need_public_intakes")
    .update({ status: "converted" })
    .eq("id", intakeId);

  return { ok: true };
}
