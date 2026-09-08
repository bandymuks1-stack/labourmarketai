"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { respondToRosterLink } from "@/lib/organization-evidence/import-core";

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
  if (personId === "" || (raw !== "accept" && raw !== "refuse")) {
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
  revalidatePath("/dashboard/profile");
  return { ok: true, linkState: res.linkState };
}
