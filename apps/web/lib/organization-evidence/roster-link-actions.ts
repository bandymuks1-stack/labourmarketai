"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { offerRosterLink, respondToRosterLink } from "@/lib/organization-evidence/import-core";
import { createAndSendInvitations } from "@/lib/invitations/actions";
import { isRelationshipInviteSlug } from "@/lib/invitations/model";

/**
 * THE PERSON'S ANSWER to an organization's offer to link a roster record to
 * them (the subject side of the evidence import).
 *
 * There are exactly two answers and no default. Accepting makes the imported
 * history theirs; refusing returns the row to `unlinked` — the organization
 * keeps its own record, and what it loses is the false claim about whose it
 * is. An unanswered offer stays an offer forever, which is the correct
 * behaviour: silence is not consent.
 *
 * The action re-derives the caller rather than trusting the form, and the
 * database refuses any row that does not already name them.
 */

export type RosterLinkActionResult =
  | { readonly ok: true; readonly linkState: "linked" | "unlinked" }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "invalid"
        | "not_found"
        | "needs_migration"
        | "error";
    };

export async function respondToRosterLinkAction(
  _previous: RosterLinkActionResult | null,
  form: FormData,
): Promise<RosterLinkActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const personId = String(form.get("person_id") ?? "").trim();
  const raw = String(form.get("decision") ?? "");
  if (
    personId === "" ||
    (raw !== "accept" && raw !== "refuse" && raw !== "withdraw")
  ) {
    return { ok: false, code: "invalid" };
  }

  const res = await respondToRosterLink(
    { supabase, userId: user.id, locale: undefined },
    { personId, decision: raw },
  );
  if (res.kind !== "ok") {
    return {
      ok: false,
      code:
        res.kind === "needs-migration"
          ? "needs_migration"
          : res.kind === "not-found"
            ? "not_found"
            : "error",
    };
  }
  revalidatePath("/[locale]/dashboard/profile", "page");
  return { ok: true, linkState: res.linkState };
}

/**
 * THE ORGANIZATION'S OFFER — the other half of the link, which had a domain
 * function (`offerRosterLink`) and no caller anywhere in the app: a committed
 * import could reach the roster and never a person, because nobody could
 * propose the link (found on the local proof of the post-commit path,
 * 2026-09-17). The manager names a worker who already stands in an active
 * relationship with this organization; the database refuses anyone else,
 * and the person still has to accept — the offer claims nothing by itself.
 */
export type RosterLinkOfferResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "auth" | "invalid" | "not_found" | "needs_migration" | "error";
    };

export async function offerRosterLinkAction(
  _previous: RosterLinkOfferResult | null,
  form: FormData,
): Promise<RosterLinkOfferResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const personId = String(form.get("person_id") ?? "").trim();
  // "<workerId>:<profileId>" — one choice, both ids, no free text.
  const choice = String(form.get("worker") ?? "").trim();
  const [workerId, profileId] = choice.split(":");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(personId) || !uuid.test(workerId ?? "") || !uuid.test(profileId ?? "")) {
    return { ok: false, code: "invalid" };
  }

  const res = await offerRosterLink(
    { supabase, userId: user.id, locale: undefined },
    { personId, profileId, workerId },
  );
  if (res.kind !== "ok") {
    return {
      ok: false,
      code:
        res.kind === "needs-migration"
          ? "needs_migration"
          : res.kind === "not-found"
            ? "not_found"
            : "error",
    };
  }
  revalidatePath("/[locale]/dashboard/company/people", "page");
  revalidatePath("/[locale]/dashboard/company/history", "page");
  return { ok: true };
}

/**
 * INVITE A ROSTER PERSON TO CLAIM THEIR HISTORY.
 *
 * Five of the seven people in the first imported history have no account at
 * all, so there is nobody an offer could name: the database admits an offer
 * only for a profile that already stands in an active relationship with the
 * organization. This is the missing first step. It uses the ONE invitation
 * primitive (`createAndSendInvitations` -> `create_invitation_v1`, which
 * re-checks the sender's authority) and nothing else.
 *
 * What it deliberately does NOT do:
 *   - it never links anything. An unlinked roster name is not an identity;
 *     after the person accepts, the manager still OFFERS the link (existing
 *     control) and the person still ANSWERS it on their own profile;
 *   - it never matches by name or e-mail address. The invitation carries no
 *     roster id (the create RPC exposes no free foreign-id field), so the
 *     connection is made by a human decision, not inferred;
 *   - it never names a relationship the roster row does not hold: a kind that
 *     cannot be offered by invitation is refused, not defaulted.
 */
export type RosterClaimInviteResult =
  | {
      readonly ok: true;
      readonly outcome: "sent" | "created" | "delivery_failed";
      readonly inviteLink?: string;
    }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "invalid"
        | "invalid_email"
        | "not_found"
        | "duplicate_pending"
        | "rate_limited"
        | "limit_reached"
        | "not_authorized"
        | "invalid_relationship"
        | "needs_migration"
        | "error";
    };

const SINGLE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const ROSTER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function inviteRosterPersonToClaimAction(
  _previous: RosterClaimInviteResult | null,
  form: FormData,
): Promise<RosterClaimInviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const personId = String(form.get("person_id") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const locale = String(form.get("locale") ?? "").trim() || "en";
  if (!ROSTER_UUID.test(personId)) return { ok: false, code: "invalid" };
  if (!SINGLE_EMAIL.test(email)) return { ok: false, code: "invalid_email" };

  // Under the caller's own RLS: a person they cannot see is "not found".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: person, error } = await (supabase as any)
    .from("organization_people")
    .select("id, organization_id, display_name, relationship_kind, link_state")
    .eq("id", personId)
    .maybeSingle();
  if (error) return { ok: false, code: "error" };
  if (!person) return { ok: false, code: "not_found" };
  // Only a name nobody has claimed is invited; a proposed or confirmed link is
  // somebody's decision already.
  if (person.link_state !== "unlinked") return { ok: false, code: "invalid" };

  const kind = (person.relationship_kind as string | null) ?? null;
  if (kind !== null && !isRelationshipInviteSlug(kind)) {
    return { ok: false, code: "invalid_relationship" };
  }

  const res = await createAndSendInvitations({
    emails: email,
    invitationType: "join_as_employee",
    locale,
    organizationId: person.organization_id as string,
    invitedName: (person.display_name as string | null) ?? null,
    relationshipSlug: kind,
  });
  if (res.status === "needs-migration") return { ok: false, code: "needs_migration" };
  if (res.status === "not-authed") return { ok: false, code: "auth" };
  const first = res.results[0];
  if (!first) return { ok: false, code: "invalid_email" };
  if (
    first.outcome === "sent" ||
    first.outcome === "created" ||
    first.outcome === "delivery_failed"
  ) {
    revalidatePath("/[locale]/dashboard/company/people", "page");
    return { ok: true, outcome: first.outcome, inviteLink: first.inviteLink };
  }
  const known = [
    "duplicate_pending",
    "invalid_email",
    "rate_limited",
    "limit_reached",
    "not_authorized",
    "invalid_relationship",
  ] as const;
  return {
    ok: false,
    code: (known as readonly string[]).includes(first.outcome)
      ? (first.outcome as (typeof known)[number])
      : "error",
  };
}
