import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Project management-strip facts (train D): the project's organization and
 * its responsible pointer. RLS-scoped read — a caller who cannot see the
 * project gets null. The responsible column ships in a LEAD-gated migration
 * (20260817152000); until applied the column is missing (42703) and the
 * read FALLS BACK to org-only so the operations page never regresses.
 */
export type ProjectManageFacts = {
  readonly organizationId: string | null;
  readonly responsibleProfileId: string | null;
};

export async function getProjectManageFacts(
  projectId: string,
): Promise<ProjectManageFacts | null> {
  const supabase = await createClient();
  const run = (columns: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("projects")
      .select(columns)
      .eq("id", projectId)
      .maybeSingle();
  let res = await run("organization_id, responsible_profile_id");
  if (res.error && res.error.code === "42703") {
    res = await run("organization_id");
  }
  if (res.error || !res.data) return null;
  const row = res.data as {
    organization_id?: string | null;
    responsible_profile_id?: string | null;
  };
  return {
    organizationId: row.organization_id ?? null,
    responsibleProfileId: row.responsible_profile_id ?? null,
  };
}
