import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * NO SYNTHETIC LEARNING GROUP OUTLIVES ITS WALK. Owner order 2026-11-23: a
 * production walk must not depend on what earlier walks left behind.
 *
 * `prod-learning-practice` makes one group per run ("QA-SYNTHETIC grupė <run>")
 * and places the synthetic learner in it. Nothing ever archived those groups, so
 * the learner built up more than 20 live memberships; the compass read only
 * 20 of them, and L-5 failed (run 45240106971). The product fix orders that
 * read; this sweep keeps the synthetic data from growing at all.
 *
 * How: through the synthetic institution owner's OWN session (`qaApi` refuses
 * anything but an allowlisted synthetic identity on production), read the live
 * groups of the synthetic programme whose name is exactly a walk group, and
 * archive each with the product's own command `archive_education_cohort_v1`, the
 * same one the institution's page uses. Archiving keeps every membership row as
 * history and only takes the group off the learner's compass. Never a delete,
 * never the service role. `keep` spares the group of the run in progress.
 * Logs counts, never ids or names.
 */
export const SYNTHETIC_PROGRAM = "QA-SYNTHETIC praktikos programa";
const WALK_GROUP = /^QA-SYNTHETIC grupė (\d+|local[0-9a-z]+)$/;

export interface CohortSweepResult {
  readonly seen: number;
  readonly archived: number;
  readonly failed: number;
}

export async function archiveSyntheticCohorts(label: string, keep: string | null = null): Promise<CohortSweepResult> {
  const owner = bearerOf("owner");
  const res = await qaApi(
    `/rest/v1/education_cohorts?select=id,name,education_programs!inner(name)&archived_at=is.null&education_programs.name=eq.${encodeURIComponent(SYNTHETIC_PROGRAM)}&limit=500`,
    owner,
  );
  if (res.status !== 200) {
    console.info(`[cohort-sweep] ${label}: groups unreadable (${res.status})`);
    return { seen: 0, archived: 0, failed: 1 };
  }
  const rows = (await res.json()) as Array<{ id: string; name: string }>;
  const targets = rows.filter((r) => WALK_GROUP.test(r.name) && r.name !== keep);
  let archived = 0;
  let failed = 0;
  for (const r of targets) {
    const a = await qaApi("/rest/v1/rpc/archive_education_cohort_v1", owner, {
      method: "POST",
      body: { p_cohort_id: r.id },
    });
    if (a.ok) archived += 1;
    else failed += 1;
  }
  console.info(`[cohort-sweep] ${label}: walk groups ${targets.length}, archived ${archived}, failed ${failed}`);
  return { seen: targets.length, archived, failed };
}
