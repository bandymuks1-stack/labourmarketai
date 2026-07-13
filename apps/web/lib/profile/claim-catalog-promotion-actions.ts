"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { workerProfessionSkillIds } from "@/lib/skills";
import {
  mapClaimLabelsToCatalogSlugs,
  distinctMappedSlugs,
} from "@/lib/profile/claim-catalog-promotion";

/**
 * Canonical-journey P2 — promote the user's CONFIRMED claim labels into
 * catalogued `worker_skills` rows (living CV).
 *
 * Runs strictly AFTER the user confirmed the claims in the review step —
 * this action never decides anything itself, it only records the already-
 * confirmed fact in the second canonical place (the catalogued row that the
 * Verified CV, matching and journal evidence read).
 *
 * Order + honesty contract:
 *   1. caller's own worker row (RLS; a non-worker account is an honest no-op);
 *   2. deterministic label→slug mapping (shared lexicon, pure module);
 *   3. slugs → catalogue ids from the `skills` table (curated set only);
 *   4. clamp to the worker's OWN work directions (same scope guard as the
 *      skills API route) — outside-direction skills are counted as skipped
 *      and stay claims only, never silently stored;
 *   5. insert ONLY missing rows with column defaults
 *      (source='self_declared', verified=false) — promotion NEVER touches
 *      the verified flag; that stays the manager-confirmation chain's job.
 */

export type PromoteClaimsResult = {
  /** Catalogued skills actually inserted. */
  promoted: number;
  /** Mapped skills outside the worker's directions (stay claims only). */
  skippedOutsideDirections: number;
  /** Mapped skills that already existed as worker_skills rows. */
  alreadySaved: number;
  /** The caller has no worker row / nothing mapped — honest no-op. */
  applicable: boolean;
};

const NOOP: PromoteClaimsResult = {
  promoted: 0,
  skippedOutsideDirections: 0,
  alreadySaved: 0,
  applicable: false,
};

export async function promoteConfirmedClaimsAction(
  labels: string[],
): Promise<PromoteClaimsResult> {
  if (!Array.isArray(labels) || labels.length === 0) return NOOP;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NOOP;

  const { data: workerRow } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const workerId = (workerRow?.id as string | null) ?? null;
  if (!workerId) return NOOP;

  const mapped = mapClaimLabelsToCatalogSlugs(labels);
  const slugs = distinctMappedSlugs(mapped);
  if (slugs.length === 0) return NOOP;

  const { data: catalogRows } = await supabase
    .from("skills")
    .select("id, slug")
    .in("slug", slugs);
  const idBySlug = new Map(
    ((catalogRows ?? []) as { id: string; slug: string }[]).map((r) => [
      r.slug,
      r.id,
    ]),
  );
  const mappedIds = slugs
    .map((s) => idBySlug.get(s))
    .filter((v): v is string => typeof v === "string");
  if (mappedIds.length === 0) return NOOP;

  const [allowed, existingRes] = await Promise.all([
    workerProfessionSkillIds(supabase, workerId),
    supabase.from("worker_skills").select("skill_id").eq("worker_id", workerId),
  ]);
  const existing = new Set(
    ((existingRes.data ?? []) as { skill_id: string | null }[])
      .map((r) => r.skill_id)
      .filter((v): v is string => typeof v === "string"),
  );

  const toInsert: string[] = [];
  let skippedOutsideDirections = 0;
  let alreadySaved = 0;
  for (const id of mappedIds) {
    if (existing.has(id)) {
      alreadySaved += 1;
    } else if (allowed.has(id)) {
      toInsert.push(id);
    } else {
      skippedOutsideDirections += 1;
    }
  }

  if (toInsert.length > 0) {
    // Column defaults apply: source='self_declared', verified=false — the
    // promotion records the user's confirmed self-declaration, nothing more.
    const { error } = await supabase
      .from("worker_skills")
      .insert(toInsert.map((skill_id) => ({ worker_id: workerId, skill_id })));
    if (error) {
      console.error("[claim-promotion] insert failed:", error.message);
      return {
        promoted: 0,
        skippedOutsideDirections,
        alreadySaved,
        applicable: true,
      };
    }
  }

  return {
    promoted: toInsert.length,
    skippedOutsideDirections,
    alreadySaved,
    applicable: true,
  };
}
