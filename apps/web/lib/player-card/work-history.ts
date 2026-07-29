import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  deriveWorkHistory,
  type WorkHistoryEntry,
  type WorkHistorySourceRow,
} from "./work-history-model";

/**
 * Work history — the server read (W5 Slice 1).
 *
 * OWN DATA ONLY. `engagement_contexts` is the canonical person↔organization
 * spine (doctrine §5.5); this reads the caller's OWN rows, scoped by
 * `profile_id = auth.uid()` and by that table's existing RLS. It adds no
 * policy, no grant and no second membership truth — the workspace resolver
 * reads the same spine for a different question.
 *
 * The organization name is a LEFT join on purpose: an organization the caller
 * cannot read simply arrives as `null` and the model reports the engagement
 * without a name, rather than the engagement vanishing. (The same defect the
 * W4 review found in the project reads — an `!inner` join for an optional
 * display name silently deletes the row it was decorating.)
 *
 * Degrades to `[]` on any read failure — an unreadable history is an empty
 * one for rendering purposes, and the caller shows its honest empty state. It
 * never invents an engagement.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** How many engagements the profile card carries. Bounded: the card is an
 *  identity summary, not an employment archive. */
export const WORK_HISTORY_LIMIT = 20;

export const getOwnWorkHistory = cache(async (): Promise<WorkHistoryEntry[]> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const res = await asAny(supabase)
      .from("engagement_contexts")
      .select(
        "id, title, relationship_slug, started_at, ended_at, status, country_code, organizations(display_name, legal_name)",
      )
      .eq("profile_id", user.id)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(WORK_HISTORY_LIMIT);
    if (res.error) return [];
    return deriveWorkHistory((res.data ?? []) as WorkHistorySourceRow[]);
  } catch {
    return [];
  }
});

export type { WorkHistoryEntry };
