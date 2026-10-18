import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isDemandKind } from "@/lib/demand/market-direction";
import { buildNeedFromRequestRow } from "@/lib/market/need-from-request";
import { compareMatches, type MatchStatus } from "@/lib/market/match-v1";
import { matchRosterPersonToNeed } from "@/lib/market/roster-person-match";
import { readSignalsForRosterPeople } from "@/lib/organization-evidence/history-signals-read";

/**
 * HOW ONE HISTORICAL PERSON FITS THE ORGANIZATION'S OWN OPEN NEEDS
 * (decision 0020, owner 2026-10-07 B) - the company-side, manager-authorized,
 * ORGANIZATION-INTERNAL matching of a roster person with no account.
 *
 * Reads, all under the CALLER's RLS and pinned to the organization the caller
 * governs: the roster person's history signals, and the organization's own
 * demands (own rows or rows stamped with the organization - the same filter
 * scouting uses). Nothing is written and nothing leaves the organization: the
 * result is a status and counts per need, never a record, never a name, and it
 * is not offered to any other organization. No consent gate is added for this
 * internal use; the cross-organization disclosure boundary stays separate.
 *
 * Honest degradation: unreadable signals or needs are `unavailable`, never an
 * empty list that reads as "fits nothing".
 */

export interface RosterPersonFitRow {
  readonly requestId: string;
  readonly title: string;
  readonly status: MatchStatus;
  readonly matched: number;
  readonly total: number;
  /** Of the matched skills, how many are held ONLY through organization
   *  history (class ORGANIZATION_REPORTED). */
  readonly organizationReported: number;
}

export type RosterPersonFitRead =
  | { readonly kind: "ok"; readonly rows: readonly RosterPersonFitRow[]; readonly needsConsidered: number }
  | { readonly kind: "no-signals" }
  | { readonly kind: "unavailable" };

const CLOSED_NEED_STATUSES = new Set(["closed", "expired", "cancelled", "fulfilled"]);
const MAX_NEEDS = 20;
const MAX_ROWS = 8;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

export async function readRosterPersonFit(
  supabase: SupabaseClient,
  input: { readonly userId: string; readonly organizationId: string; readonly personId: string },
): Promise<RosterPersonFitRead> {
  const signalsRead = await readSignalsForRosterPeople(supabase, [input.personId]);
  if (signalsRead.kind !== "ok") return { kind: "unavailable" };
  const signals = signalsRead.byPerson.get(input.personId);
  // A person whose history names no canonical skill is UNKNOWN to matching,
  // not a zero-fit: say that instead of ranking them against anything.
  if (!signals || signals.length === 0) return { kind: "no-signals" };

  const res = await db(supabase)
    .from("customer_requests")
    .select(
      "id, title, status, need_summary, role_or_work_type, notes, country, location, language_requirement, payload, kind, created_at",
    )
    .or(`profile_id.eq.${input.userId},organization_id.eq.${input.organizationId}`)
    .order("created_at", { ascending: false })
    .limit(MAX_NEEDS);
  if (res.error) return { kind: "unavailable" };

  const escoUriToSlug = new Map<string, string>();
  const bridge = await db(supabase).from("skills").select("slug, esco_uri").not("esco_uri", "is", null);
  if (!bridge.error) {
    for (const b of (bridge.data ?? []) as { slug: string | null; esco_uri: string | null }[]) {
      if (b.slug && b.esco_uri) escoUriToSlug.set(b.esco_uri, b.slug);
    }
  }

  const rows: (RosterPersonFitRow & { readonly result: ReturnType<typeof matchRosterPersonToNeed> })[] = [];
  let considered = 0;
  for (const r of (res.data ?? []) as Record<string, unknown>[]) {
    if (!isDemandKind((r.kind as string | null) ?? null)) continue;
    if (CLOSED_NEED_STATUSES.has(String(r.status ?? "").trim().toLowerCase())) continue;
    const built = buildNeedFromRequestRow(
      {
        title: (r.title as string | null) ?? null,
        need_summary: (r.need_summary as string | null) ?? null,
        role_or_work_type: (r.role_or_work_type as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        country: (r.country as string | null) ?? null,
        location: (r.location as string | null) ?? null,
        language_requirement: (r.language_requirement as string | null) ?? null,
        payload: r.payload,
      },
      escoUriToSlug,
    );
    // A need nothing could be derived from is not matched - never guessed.
    if (built.source === null) continue;
    considered += 1;
    const result = matchRosterPersonToNeed(built.need, signals);
    rows.push({
      requestId: r.id as string,
      title: ((r.title as string | null) ?? "").trim(),
      status: result.status,
      matched: result.skillFit?.matchedTotal ?? 0,
      total: result.skillFit?.needTotal ?? 0,
      organizationReported: result.evidence.matchedOrganizationReported ?? 0,
      result,
    });
  }
  rows.sort((a, b) => compareMatches(a.result, b.result) || a.requestId.localeCompare(b.requestId));
  return {
    kind: "ok",
    needsConsidered: considered,
    rows: rows
      // Only needs the history actually speaks to; the rest are not listed as
      // "no fit" - history naming nothing relevant is not a verdict.
      .filter((r) => r.matched > 0)
      .slice(0, MAX_ROWS)
      .map((r) => ({
        requestId: r.requestId,
        title: r.title,
        status: r.status,
        matched: r.matched,
        total: r.total,
        organizationReported: r.organizationReported,
      })),
  };
}
