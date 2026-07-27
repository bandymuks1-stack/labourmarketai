"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyWorkerSkillSourceReconcile } from "@/lib/journal/skill-source-apply";
import { writeEntrySkillLinks } from "@/lib/journal/entry-skill-link-write";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";

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
    // provenance 'manual': the worker explicitly picked which of THEIR OWN
    // declared skills this entry supports (degrades unstamped pre-migration).
    const ins = await writeEntrySkillLinks(supabase, rows, "manual", "insert");
    if (ins.error) {
      return {
        ok: false,
        code: "link_write_failed",
        message: ins.error.message ?? "link_write_failed",
      };
    }
  }

  // Journal Evidence Auto-Recompute v1 (worker side, GREEN): derive the
  // worker's OWN evidence tier from real journal support — a skill with ≥1
  // journal_entry_skills row rises to the journal-supported tier; one with
  // none falls back to self-declared. This is evidence-support, NOT
  // verification: it never sets `verified` and never writes the confirmed
  // tier (that is the separate owner-gated path). The write lives in a
  // dedicated module so this link layer stays insert/delete-only. Best-effort.
  await applyWorkerSkillSourceReconcile(supabase, worker.id);

  revalidatePath("/[locale]/dashboard/journal", "page");
  revalidatePath("/[locale]/dashboard/profile", "page");
  return { ok: true, linked: unique.length };
}

/**
 * systemic-ux-skills-v1 — Recognition → evidence, on save.
 *
 * Runs the deterministic skill recognition over a saved entry's notes and
 * links the recognised skills that the worker ALREADY declared. This is what
 * makes "a new journal entry creates skill evidence" true: before this, the
 * `journal_entry_skills` link table had no caller, so no entry ever produced
 * journal-supported evidence.
 *
 * Strictly honest + additive:
 *   • only links skills the worker has already declared (`worker_skills`) — it
 *     never invents a skill or links one the worker has not claimed;
 *   • evidence-support only — never sets `verified` / manager-confirmed;
 *   • additive upsert (ignore duplicates) — never wipes manual links;
 *   • best-effort — a failure never blocks or fails the journal save.
 *
 * No DB migration: `journal_entry_skills` already exists (20260602120000).
 */
export async function autoLinkRecognizedJournalSkills(
  entryId: string,
  notes: string,
  // Wagon 5: slugs the worker explicitly REJECTED in the review step. A
  // rejected suggestion must leave no trace — not even an internal evidence
  // link. Additive, optional — every existing caller keeps its behaviour.
  excludeSlugs?: readonly string[],
): Promise<{ ok: true; linked: number } | { ok: false }> {
  try {
    const excluded = new Set(excludeSlugs ?? []);
    const recognized = recognizeSkills(notes, 8).filter(
      (r) => !excluded.has(r.slug),
    );
    if (recognized.length === 0) return { ok: true, linked: 0 };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!worker?.id) return { ok: false };

    // Entry must be the caller's own (RLS re-enforces this on write anyway).
    const { data: entry } = await supabase
      .from("journal_entries")
      .select("id, worker_id")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.worker_id !== worker.id) return { ok: false };

    // Resolve recognised slugs → skill ids.
    const slugs = [...new Set(recognized.map((r) => r.slug))];
    const { data: skillRows } = await supabase
      .from("skills")
      .select("id, slug")
      .in("slug", slugs);
    const skillIds = (skillRows ?? []).map((r) => r.id);
    if (skillIds.length === 0) return { ok: true, linked: 0 };

    // Keep only skills the worker has actually declared — never invent one.
    const { data: owned } = await supabase
      .from("worker_skills")
      .select("skill_id")
      .eq("worker_id", worker.id)
      .in("skill_id", skillIds);
    const ownedIds = (owned ?? [])
      .map((r) => r.skill_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ownedIds.length === 0) return { ok: true, linked: 0 };

    // Additive upsert; the (journal_entry_id, skill_id) unique constraint makes
    // re-saves idempotent. ignoreDuplicates keeps any manual links intact.
    // provenance 'recognized': these links come from the deterministic
    // recognition over the entry's own notes (degrades unstamped pre-migration).
    const rows = ownedIds.map((skill_id) => ({
      journal_entry_id: entryId,
      worker_id: worker.id,
      skill_id,
    }));
    const ins = await writeEntrySkillLinks(supabase, rows, "recognized", "upsert");
    if (ins.error) return { ok: false };

    await applyWorkerSkillSourceReconcile(supabase, worker.id);
    revalidatePath("/[locale]/dashboard/journal", "page");
    revalidatePath("/[locale]/dashboard/profile", "page");
    return { ok: true, linked: ownedIds.length };
  } catch {
    return { ok: false };
  }
}
