"use server";

import "server-only";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  processJournalEntrySkills,
  type JournalSkillPipelineResult,
} from "@/lib/journal/skill-pipeline";

/**
 * Re-run the canonical skill pipeline for one of the caller's OWN journal
 * entries (P0 Track B). Idempotent by construction — the pipeline's
 * ignore-duplicate upserts + normalized-label metric dedupe make a repeat run
 * safe — so this is the honest recovery path the composer's failure line
 * points at ("Atnaujinti atpažinimą").
 *
 * Owner-scoped: entry loaded under the caller's RLS; superseded / deleted
 * entries are refused (their replacement carries the live text).
 */
export type ReprocessEntrySkillsResult =
  | { ok: true; result: JournalSkillPipelineResult }
  | { ok: false; code: ReprocessEntrySkillsErrorCode };

export type ReprocessEntrySkillsErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "entry_not_found"
  | "entry_superseded"
  | "entry_deleted";

export async function reprocessJournalEntrySkills(
  entryId: string,
): Promise<ReprocessEntrySkillsResult> {
  if (!entryId || typeof entryId !== "string") {
    return { ok: false, code: "entry_not_found" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { ok: false, code: "no_worker_profile" };

  const { data: entry } = await supabase
    .from("journal_entries")
    .select(
      "id, worker_id, original_text, original_language, superseded_by, deleted_at",
    )
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.worker_id !== worker.id) {
    return { ok: false, code: "entry_not_found" };
  }
  if (entry.deleted_at) return { ok: false, code: "entry_deleted" };
  if (entry.superseded_by) return { ok: false, code: "entry_superseded" };

  // Locale for revalidation paths: current request locale, falling back to
  // the entry's own stored language, then LT.
  let locale = "lt";
  try {
    locale = await getLocale();
  } catch {
    locale = (entry.original_language as string | null) ?? "lt";
  }

  const result = await processJournalEntrySkills({
    entryId: entry.id,
    text: (entry.original_text as string | null) ?? "",
    locale,
  });
  return { ok: true, result };
}
