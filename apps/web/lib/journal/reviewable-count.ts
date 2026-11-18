import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { countInScope, reviewScopeOf } from "@/lib/journal/review-scope";
import { liveJournalEntriesOnly } from "@/lib/journal/journal-list-core";

/** Postgres / PostgREST codes for "this function is not installed here". */
const RPC_ABSENT_CODES = new Set(["42883", "PGRST202", "PGRST205"]);

export type ReviewableIdsRead = { data: unknown; error: { code?: string } | null };

/**
 * THE gated reviewable set — the SECURITY DEFINER `reviewable_journal_entry_ids`
 * RPC (migration 0034), read ONCE per server render (perf 2026-10-22).
 *
 * One `/dashboard/company` render used to call it once for the decisions
 * strip's count, once for the opening brief's review queue and once more per
 * project inside the worker-readiness pulse — the same caller, the same
 * argument-less RPC, the same answer. Every consumer still reads the ONE RPC
 * and parses the raw `{ data, error }` exactly as before; only the round trip
 * is shared. React `cache()` is request-scoped: every navigation reads again,
 * and a server action (no render) reads itself, so a confirm is never answered
 * by the set read before it.
 *
 * The set spans EVERY organization the caller reviews (it has no organization filter).
 * A surface about one organization scopes it through `lib/journal/review-scope.ts`.
 */
export const readReviewableJournalEntryIds = cache(
  async function readReviewableJournalEntryIds(): Promise<ReviewableIdsRead> {
    const supabase = await createClient();
    return (
      supabase as unknown as {
        rpc: (name: string) => PromiseLike<ReviewableIdsRead>;
      }
    ).rpc("reviewable_journal_entry_ids");
  },
);

/** The set's entry ids. `[]`: none, or the RPC is not installed here. Null: the read failed. */
export function reviewableIdsOf({ data, error }: ReviewableIdsRead): string[] | null {
  if (error) return error.code && RPC_ABSENT_CODES.has(error.code) ? [] : null;
  if (!Array.isArray(data)) return null;
  return (
    data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => (typeof r === "string" ? r : (r?.reviewable_journal_entry_ids ?? r?.id ?? null)))
      .filter((v: unknown): v is string => typeof v === "string")
  );
}

/**
 * Each reviewable entry's organization, read once per render under the caller's RLS.
 * Null in the map: that entry's organization cannot be read. Null overall: the read failed.
 */
const readReviewableEntryOrganizations = cache(
  async function readReviewableEntryOrganizations(): Promise<Map<string, string | null> | null> {
    const ids = reviewableIdsOf(await readReviewableJournalEntryIds());
    if (ids === null) return null;
    if (ids.length === 0) return new Map();
    const supabase = await createClient();
    // The live-entry rule: a deleted or superseded row is never counted for anyone.
    const { data, error } = await liveJournalEntriesOnly(
      supabase.from("journal_entries").select("id, engagement_contexts(organization_id)").in("id", ids),
    );
    if (error) return null;
    const byId = new Map<string, string | null>(ids.map((id) => [id, null]));
    for (const row of data ?? []) {
      const org = (row.engagement_contexts as unknown as { organization_id: string | null } | null)?.organization_id;
      byId.set(row.id, org ?? null);
    }
    return byId;
  },
);

/**
 * Count of journal entries the caller can review right now IN THE ACTIVE ORGANIZATION
 * (the server-resolved workspace), the same set the quick queue shows there. With no
 * organization active, every reviewable entry. Read-only; never widens access.
 *
 * UNKNOWN IS NOT ZERO (SEP-7). A failed read returns `null` so a surface can
 * say "could not be read" instead of "nothing is waiting for you" - the one
 * sentence a reviewer must never be told wrongly. `0` means the RPC answered
 * (or is not installed, so no review queue exists here at all) and nothing
 * waits.
 */
export async function countReviewablePendingEntries(): Promise<number | null> {
  try {
    const ids = reviewableIdsOf(await readReviewableJournalEntryIds());
    if (ids === null) return null;
    if (ids.length === 0) return 0;
    const scope = reviewScopeOf((await getActiveOrganizationContext()).activeOrganizationId);
    if (scope.kind === "all") return ids.length;
    const organizations = await readReviewableEntryOrganizations();
    return organizations === null ? null : countInScope(organizations, scope);
  } catch {
    return null;
  }
}

/** The whole set's size across every organization the caller reviews. Null: unreadable. */
export async function countReviewableEntriesEverywhere(): Promise<number | null> {
  try {
    return reviewableIdsOf(await readReviewableJournalEntryIds())?.length ?? null;
  } catch {
    return null;
  }
}
