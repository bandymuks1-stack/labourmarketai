"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server action for Journal Entry ↔ Skill links v1.
 *
 * The worker marks which of THEIR OWN declared skills a work-journal entry
 * supports. Evidence-support only — this never verifies/confirms a skill (that
 * is the separate manager-confirm flow). Owner-scoped: the action re-checks
 * that the entry AND every skill belong to the caller's worker row, and RLS on
 * `journal_entry_skills` re-enforces the same ownership server-side.
 *
 * Returns a tagged result (Next.js prod strips thrown server-action messages).
 */
export type SetEntrySkillsResult =
  | { ok: true; linked: number }
  | { ok: false; code: SetEntrySkillsErrorCode; message: string };

export type SetEntrySkillsErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "entry_not_found"
  | "skill_not_owned"
  | "link_write_failed";

export async function setJournalEntrySkillLinks(
  entryId: string,
  skillIds: string[],
): Promise<SetEntrySkillsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated", message: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { ok: false, code: "no_worker_profile", message: "no_worker_profile" };

  // The entry must be the caller's own.
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id, worker_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.worker_id !== worker.id) {
    return { ok: false, code: "entry_not_found", message: "entry_not_found" };
  }

  // Every requested skill must already be one of the worker's declared skills —
  // we never invent a skill or link one the worker hasn't claimed.
  const unique = [...new Set(skillIds)].filter((s) => typeof s === "string" && s.length > 0);
  if (unique.length > 0) {
    const { data: owned } = await supabase
      .from("worker_skills")
      .select("skill_id")
      .eq("worker_id", worker.id)
      .in("skill_id", unique);
    const ownedSet = new Set((owned ?? []).map((r) => r.skill_id));
    if (unique.some((id) => !ownedSet.has(id))) {
      return { ok: false, code: "skill_not_owned", message: "skill_not_owned" };
    }
  }

  // Replace the link set for this entry (delete then insert). The new table is
  // not in the generated Supabase types yet, so route it through `any` — RLS
  // still enforces ownership at the DB layer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkTable = () => (supabase as any).from("journal_entry_skills");

  const del = await linkTable()
    .delete()
    .eq("journal_entry_id", entryId)
    .eq("worker_id", worker.id);
  if (del.error) return { ok: false, code: "link_write_failed", message: del.error.message };

  if (unique.length > 0) {
    const rows = unique.map((skill_id) => ({
      journal_entry_id: entryId,
      worker_id: worker.id,
      skill_id,
    }));
    const ins = await linkTable().insert(rows);
    if (ins.error) return { ok: false, code: "link_write_failed", message: ins.error.message };
  }

  revalidatePath("/[locale]/dashboard/journal", "page");
  revalidatePath("/[locale]/dashboard/profile", "page");
  return { ok: true, linked: unique.length };
}
