"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { offerRosterLink, respondToRosterLink } from "@/lib/organization-evidence/import-core";

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
