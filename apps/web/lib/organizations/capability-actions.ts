"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSelfDeclarable } from "./capability-choices";

/**
 * Declare what an organization does.
 *
 * Every export of a `"use server"` module becomes a server ACTION, so the READ
 * lives next door in `capability-read.ts`: rendering a capability list is not
 * an action, and mixing the two put a plain read behind the action boundary.
 *
 * Both halves run under the CALLER'S OWN RLS — never the admin client. The
 * read is fenced by `organization_roles_select` (owner or member of that org),
 * and the write goes through `add_organization_role_v1`, which re-checks
 * OWNERSHIP server-side. Membership is deliberately not enough to write: a
 * capability is an identity claim about the organization, and the RPC is the
 * thing that enforces that, not this module.
 *
 * A forged organization id therefore fails in the database with `Not
 * permitted`, not here — which is the only place that check is trustworthy.
 */

// The generated Database type does not know organization_roles until the types
// are regenerated; the table IS applied in production (ledger 20260827064504).
// Same escape hatch, same shape, as every other module that reads a table the
// generated types have not caught up with.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny<T>(c: T): any {
  return c;
}

export type DeclareCapabilityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "auth" | "not-permitted" | "invalid" | "error" };

/**
 * Declare one or more capabilities.
 *
 * ADDITIVE, because the RPC is: this can grant a capability and can never
 * revoke one. Withdrawing a capability has consequences for everyone who
 * relied on it, and that decision was deliberately left out of the minimum
 * slice rather than guessed at. The UI reflects that honestly — it never
 * renders an already-declared capability as an untickable checkbox.
 */
export async function declareOrganizationCapabilities(
  organizationId: string,
  slugs: readonly string[],
): Promise<DeclareCapabilityResult> {
  const wanted = [...new Set(slugs)].filter(isSelfDeclarable);
  if (!organizationId || wanted.length === 0) return { ok: false, code: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  for (const slug of wanted) {
    const { error } = await asAny(supabase).rpc("add_organization_role_v1", {
      p_organization_id: organizationId,
      p_role_slug: slug,
    });
    if (error) {
      // 42501 is the RPC's own ownership refusal — surfaced as itself so the
      // screen can say "you cannot change this organization" rather than a
      // generic failure that reads like an outage.
      if (error.code === "42501") return { ok: false, code: "not-permitted" };
      if (error.code === "22023") return { ok: false, code: "invalid" };
      return { ok: false, code: "error" };
    }
  }

  revalidatePath("/[locale]/dashboard/company", "page");
  return { ok: true };
}
