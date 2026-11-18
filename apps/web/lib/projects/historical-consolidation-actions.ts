"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { projectOrganizationAuthority } from "@/lib/company/organization-authority";
import { createClient } from "@/lib/supabase/server";

import { loadConsolidationProposal } from "./historical-consolidation-read";

export type ConsolidationApplyResult =
  | { readonly ok: true; readonly marked: number; readonly already: number }
  | { readonly ok: false; readonly code: "auth" | "not_authorized" | "unavailable" | "no_such_group" | "needs_decision" | "partial"; readonly marked?: number };

/**
 * APPLY ONE CONSOLIDATION GROUP — the owner's own decision, one group at a
 * time. The group is RE-COMPUTED here from the live data; the form carries
 * only its key, so no client-supplied project id is ever trusted. Each
 * fragment goes through `mark_project_duplicate_v1` (authority re-checked in
 * the database, before/after written to audit_logs). Nothing is deleted: the
 * rows, their records, hours and people stay; readers fold them into the
 * canonical project. A B group needs `decided=1` — the owner's explicit
 * "these are the same object".
 */
export async function applyConsolidationGroupAction(
  _previous: ConsolidationApplyResult | null,
  form: FormData,
): Promise<ConsolidationApplyResult> {
  return applyConsolidationGroup(String(form.get("group") ?? ""), form.get("decided") === "1");
}

export async function applyConsolidationGroup(groupKey: string, decided: boolean): Promise<ConsolidationApplyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok" || !projectOrganizationAuthority({ role: ctx.role }).canGovern) {
    return { ok: false, code: "not_authorized" };
  }
  const proposal = await loadConsolidationProposal(supabase, ctx.organizationId);
  if (!proposal) return { ok: false, code: "unavailable" };
  const group = proposal.groups.find((g) => g.key === groupKey);
  if (!group) return { ok: false, code: "no_such_group" };
  if (group.level === "B" && !decided) return { ok: false, code: "needs_decision" };

  const reason = `Historical consolidation (${group.level}): same ${group.basis}; rows and records kept`;
  let marked = 0;
  let already = 0;
  for (const fragmentId of group.fragmentIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supabase as any).rpc("mark_project_duplicate_v1", {
      p_project_id: fragmentId,
      p_canonical_id: group.canonicalId,
      p_reason: reason,
    });
    const outcome = (res.data as { outcome?: string } | null)?.outcome;
    if (res.error || (outcome !== "marked" && outcome !== "already_duplicate")) {
      revalidatePath("/[locale]/dashboard/projects", "page");
      return { ok: false, code: "partial", marked };
    }
    if (outcome === "marked") marked += 1;
    else already += 1;
  }
  revalidatePath("/[locale]/dashboard/projects", "page");
  return { ok: true, marked, already };
}
