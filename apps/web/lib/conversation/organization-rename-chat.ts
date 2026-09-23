"use server";

import "server-only";

import { resolveRenameTarget } from "@/lib/company/organization-rename";

/**
 * "Pervadink šią agentūrą į …" — CAN this workspace be renamed by this person?
 *
 * Asked BEFORE the chat opens the confirm form, so a refusal is said as a
 * sentence at once instead of after the person has reviewed and confirmed a
 * form that was never going to save. It is the SAME gate chain the write
 * runs again (lib/company/organization-rename.ts) — one implementation, read
 * twice — and it is READ-ONLY: nothing here writes, dispatches or confirms.
 *
 * Only what the sentence needs crosses to the client: the kind, and — when it
 * can be renamed — the organisation's CURRENT name and its id (both already
 * in the person's own workspace list). The id is handed back with the form as
 * `expectedOrganizationId`, which can only make the save REFUSE if the
 * workspace changed meanwhile; it never chooses the target. No row.
 */
export type RenameTargetForChat =
  | { readonly kind: "ready"; readonly organizationId: string; readonly currentName: string | null }
  | { readonly kind: "personal" }
  | { readonly kind: "no-company-profile" }
  | { readonly kind: "not-authorized" }
  | { readonly kind: "legal-name-verified" }
  | { readonly kind: "unavailable" };

export async function readRenameTargetForChat(): Promise<RenameTargetForChat> {
  try {
    const target = await resolveRenameTarget();
    if (target.kind === "ready") {
      return { kind: "ready", organizationId: target.organizationId, currentName: target.currentName };
    }
    switch (target.reason) {
      case "personal_workspace":
        return { kind: "personal" };
      case "no_company_profile":
        return { kind: "no-company-profile" };
      case "not_authorized":
        return { kind: "not-authorized" };
      case "legal_name_verified":
        return { kind: "legal-name-verified" };
      default:
        return { kind: "unavailable" };
    }
  } catch {
    // Our failure, said as ours — never "you have no organisation".
    return { kind: "unavailable" };
  }
}
