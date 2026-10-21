import "server-only";

import { createClient } from "@/lib/supabase/server";
import { withSessionWorkspacePointer } from "@/lib/company/active-organization";
import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "./evidence-org-context";
import { untypedClient } from "./evidence-store";
import { listAllEvidenceRecords, readAllPages } from "./evidence-pagination";
import { groupPossibleDuplicates, type DuplicateGroup } from "./duplicate-review-model";

/**
 * The organization's possible duplicate history records, for its review
 * (see duplicate-review-model.ts). The caller's own RLS reads; the
 * organization is the active one, checked against the caller's memberships
 * (resolveEvidenceOrganization), exactly like the work history beside it.
 */
export type DuplicateReviewLoad =
  | { readonly kind: "hidden" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly groups: readonly DuplicateGroup[];
      readonly objectNames: ReadonlyMap<string, string>;
      /** The record read hit its ceiling: the review may be incomplete. */
      readonly truncated: boolean;
    };

export async function loadDuplicateReview(locale: string): Promise<DuplicateReviewLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "hidden" };
  const caller: DomainCaller = await withSessionWorkspacePointer({ supabase, userId: user.id, locale });
  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) {
    return org.reason === "error" || org.reason === "needs-migration" ? { kind: "unavailable" } : { kind: "hidden" };
  }
  const recs = await listAllEvidenceRecords(caller, { organizationId: org.organizationId });
  if (recs.kind !== "ok") return { kind: "unavailable" };
  const groups = groupPossibleDuplicates(recs.records, org.organizationId);

  const objectIds = [...new Set(groups.map((g) => g.workObjectId))];
  const objectNames = new Map<string, string>();
  if (objectIds.length > 0) {
    for (let i = 0; i < objectIds.length; i += 200) {
      const chunk = objectIds.slice(i, i + 200);
      const rows = await readAllPages<{ id: string; name: string | null }>((from, to) =>
        untypedClient(supabase)
          .from("work_objects")
          .select("id, name")
          .in("id", chunk)
          .order("id", { ascending: true })
          .range(from, to),
      );
      for (const r of rows?.rows ?? []) if (r.name) objectNames.set(r.id, r.name);
    }
  }
  return { kind: "ok", organizationId: org.organizationId, groups, objectNames, truncated: recs.truncated };
}
