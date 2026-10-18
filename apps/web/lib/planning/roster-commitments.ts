import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getEmployerWorkerCommitments } from "@/lib/planning/employer-committed-work";
import {
  buildRosterCommitmentsView,
  type RosterCommitmentsView,
  type RosterPerson,
} from "@/lib/planning/roster-commitments-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Bounded like every planning read. */
const READ_LIMIT = 500;

/**
 * The per-person commitment list for the roster the caller manages. ONE
 * existing authorized read (`getEmployerWorkerCommitments` — RLS decides what
 * comes back) plus the display names the employer already sees on every
 * roster surface (`workers.display_name`, `can_view_worker`). A name that
 * cannot be read stays null and renders as the i18n noun; it never blocks the
 * dates.
 */
export async function getRosterCommitments(
  workerIds: readonly string[],
): Promise<RosterCommitmentsView> {
  if (workerIds.length === 0) return { status: "ok", rows: [], withoutCommitment: 0 };
  const supabase = await createClient();
  const ids = workerIds.slice(0, READ_LIMIT);
  const [committed, namesRes] = await Promise.all([
    getEmployerWorkerCommitments(ids, { supabase }),
    asAny(supabase).from("workers").select("id, display_name").in("id", ids).limit(READ_LIMIT),
  ]);
  const names = new Map<string, string | null>();
  if (!namesRes.error && Array.isArray(namesRes.data)) {
    for (const r of namesRes.data as { id: string; display_name: string | null }[]) {
      names.set(r.id, r.display_name?.trim() ? r.display_name : null);
    }
  }
  const people: RosterPerson[] = ids.map((id) => ({ workerId: id, name: names.get(id) ?? null }));
  return buildRosterCommitmentsView(people, committed);
}
