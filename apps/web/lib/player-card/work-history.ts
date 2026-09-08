import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  deriveWorkHistory,
  PROFESSIONAL_HISTORY_RELATIONSHIPS,
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
      // The SAME relationship filter the CV and profile use — without it the
      // card timeline showed `manager` rows the other two surfaces omit (W4
      // audit A15: the same person had two histories). Placements
      // (student/volunteer) ARE in this list on all three surfaces; each
      // renders them under their own heading, never as employment.
      .in("relationship_slug", [...PROFESSIONAL_HISTORY_RELATIONSHIPS])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(WORK_HISTORY_LIMIT);
    if (res.error) return [];
    return deriveWorkHistory((res.data ?? []) as WorkHistorySourceRow[]);
  } catch {
    return [];
  }
});

/**
 * ANOTHER PERSON'S RECORDED WORK — the same spine, read for someone else.
 *
 * The person page (`/dashboard/people/[workerId]`) could show WHO someone is
 * and WHAT THEY CLAIM, and nothing at all about what they had actually done.
 * The data was there the whole time: `engagement_contexts` is the canonical
 * person↔organization spine, and it already answers this question for the
 * caller's own card.
 *
 * PERMISSION IS THE DATABASE'S, NOT THIS MODULE'S. `engagement_contexts`
 * select RLS is
 *   `profile_id = auth.uid() OR manages_organization(organization_id) OR is_admin()`
 * so a viewer sees the subject's engagements ONLY with organizations they
 * themselves manage. Nothing here loosens that: it adds no policy, no grant
 * and no service-role client, and a viewer with no standing simply receives
 * zero rows. That is why the surface says what it is showing rather than
 * claiming to show a complete history — it is the part the viewer is entitled
 * to, which is not the same thing.
 *
 * A FAILED READ IS NOT AN EMPTY HISTORY. `getOwnWorkHistory` above degrades to
 * `[]` because the owner's card has other signals around it; here the section
 * IS the signal, so a broken read must never render as "this person has done
 * nothing". The three outcomes stay three.
 */
export type WorkHistoryRead =
  | { readonly status: "ok"; readonly entries: readonly WorkHistoryEntry[] }
  | { readonly status: "unavailable" };

export async function readRecordedWorkFor(
  profileId: string,
): Promise<WorkHistoryRead> {
  if (!profileId) return { status: "ok", entries: [] };
  const supabase = await createClient();
  try {
    const res = await asAny(supabase)
      .from("engagement_contexts")
      .select(
        "id, title, relationship_slug, started_at, ended_at, status, country_code, organizations(display_name, legal_name)",
      )
      .eq("profile_id", profileId)
      // The SAME relationship filter the card, the CV and the profile use —
      // one history, not a fourth variant of it.
      .in("relationship_slug", [...PROFESSIONAL_HISTORY_RELATIONSHIPS])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(WORK_HISTORY_LIMIT);
    if (res.error) return { status: "unavailable" };
    return {
      status: "ok",
      entries: deriveWorkHistory((res.data ?? []) as WorkHistorySourceRow[]),
    };
  } catch {
    return { status: "unavailable" };
  }
}

export type { WorkHistoryEntry };
