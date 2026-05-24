/**
 * Owner-only self-declared profile skill claims (`profile_skill_claims`,
 * migration 0015). All access here is per-user via RLS — the table only
 * returns rows where `profile_id = auth.uid()`. NEVER assert a claim as
 * verified; the UI must surface the self-declared / not-verified
 * disclaimer everywhere these rows are rendered.
 *
 * Type note: the table is added in 0015; the generated `Database` type
 * (`lib/supabase/types.ts`) is regenerated via `pnpm db:types` AFTER
 * production has the migration applied. Until then we cast at the
 * supabase boundary and return the strongly-typed `ProfileSkillClaimRow`
 * from this module so call sites stay typed.
 */

import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  extractProfileSkillClaims,
  normalizeClaimLabel,
  type SkillClaimSuggestion,
} from "./skill-claim-extractor";

export type ProfileSkillClaimRow = {
  id: string;
  profile_id: string;
  label: string;
  normalized_label: string;
  source: "profile_text";
  status: "self_declared";
  visibility: "closed";
  created_at: string;
  updated_at: string;
};

const MAX_LABEL_LEN = 80;
const MAX_CLAIMS_PER_SAVE = 12;

function table(supabase: SupabaseClient) {
  // The generated Database type does not yet know about profile_skill_claims
  // (added in migration 0015). Cast at the boundary; this file is the only
  // place that needs the escape hatch.
  return (
    supabase as unknown as {
      from: (name: string) => ReturnType<SupabaseClient["from"]>;
    }
  ).from("profile_skill_claims");
}

function cleanLabel(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL_LEN);
}

/**
 * Pure-function suggestions from the user's profile narrative. No IO, no
 * auth — safe to call from server components or actions. The caller still
 * must persist via {@link saveProfileSkillClaims} after user confirm.
 */
export function suggestProfileSkillClaims(
  rawText: string,
): SkillClaimSuggestion[] {
  return extractProfileSkillClaims(rawText);
}

/** Read the signed-in user's saved claims, newest first. */
export async function listProfileSkillClaims(): Promise<ProfileSkillClaimRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await table(supabase)
    .select(
      "id, profile_id, label, normalized_label, source, status, visibility, created_at, updated_at",
    )
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[profile-skill-claims] list failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as ProfileSkillClaimRow[];
}

/**
 * Upsert a batch of confirmed claims for the signed-in user. Each label is
 * trimmed, length-capped, and normalized; duplicates within the batch are
 * collapsed; existing rows with the same normalized_label are left alone
 * (idempotent on retry).
 *
 * Returns the rows that ended up persisted (existing + newly inserted),
 * newest first.
 */
export async function saveProfileSkillClaims(
  labels: string[],
): Promise<ProfileSkillClaimRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const cleaned = labels
    .map(cleanLabel)
    .filter((l) => l.length > 0)
    .slice(0, MAX_CLAIMS_PER_SAVE);
  if (cleaned.length === 0) return listProfileSkillClaims();

  const seen = new Set<string>();
  const rows = cleaned
    .map((label) => ({
      label,
      normalized_label: normalizeClaimLabel(label),
    }))
    .filter((r) => {
      if (seen.has(r.normalized_label)) return false;
      seen.add(r.normalized_label);
      return true;
    })
    .map((r) => ({
      profile_id: user.id,
      label: r.label,
      normalized_label: r.normalized_label,
      // source / status / visibility take the table defaults. Setting them
      // explicitly here would make a future status enum extension harder.
    }));

  // `upsert` on the unique (profile_id, normalized_label) so re-clicking
  // Save never produces duplicates or RLS errors. `ignoreDuplicates: true`
  // keeps the existing row's created_at stable.
  const { error } = await table(supabase).upsert(rows, {
    onConflict: "profile_id,normalized_label",
    ignoreDuplicates: true,
  });

  if (error) {
    console.error("[profile-skill-claims] save failed:", error.message);
    throw new Error(`save failed: ${error.message}`);
  }

  revalidatePath("/", "layout");
  return listProfileSkillClaims();
}

/** Owner-only delete by id. RLS additionally enforces profile_id = auth.uid(). */
export async function deleteProfileSkillClaim(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!id || typeof id !== "string") throw new Error("Invalid id");

  const { error } = await table(supabase)
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);

  if (error) {
    console.error("[profile-skill-claims] delete failed:", error.message);
    throw new Error(`delete failed: ${error.message}`);
  }

  revalidatePath("/", "layout");
}
