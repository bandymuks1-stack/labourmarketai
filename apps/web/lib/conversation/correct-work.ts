"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listJournalEntries } from "@/lib/journal/journal-list-core";
import type { CorrectableEntry } from "@/lib/conversation/correct-work-model";

/**
 * The entry a spoken correction is about: the person's NEWEST live entry,
 * read through the ONE journal list core (RLS: their own rows only; the
 * superseded and deleted ones already dropped, counted once). Nothing is
 * written — the chat hands the person to the canonical supersede editor.
 */
export async function loadLatestOwnEntryForCorrection(): Promise<CorrectableEntry> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "error" };
    const list = await listJournalEntries({ supabase, userId: user.id }, { limit: 10 });
    if (!list.ok) return list.code === "no_worker" ? { kind: "no-worker" } : { kind: "error" };
    const newest = [...list.entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (!newest) return { kind: "none" };
    const workDate =
      (newest.journal_entry_metrics ?? []).find((m) => m.metric_slug === "work_date")?.value_text ??
      newest.created_at.slice(0, 10);
    return {
      kind: "entry",
      id: newest.id,
      workDate,
      text: newest.original_text,
      confirmed: (newest.journal_entry_confirmations ?? []).length > 0,
    };
  } catch {
    return { kind: "error" };
  }
}
