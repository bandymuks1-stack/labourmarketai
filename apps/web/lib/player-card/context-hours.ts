import type { ContextWorkTime } from "@/lib/journal/work-intelligence";
import type { WorkHistoryEntry } from "@/lib/player-card/work-history-model";

/**
 * HOURS PER ENGAGEMENT on the identity card — the JOIN, and nothing else.
 *
 * The journal's ONE hour ledger already answers "how many hours did I record
 * in each engagement, and how many of them did someone confirm"
 * (`WorkIntelligence.contexts`, keyed by `engagementContextId`). The card's
 * history rows are the same `engagement_contexts` ids. This module joins the
 * two by id so the card can say "recorded h / confirmed h" beside each
 * engagement; it computes no hour of its own, sums nothing across
 * engagements, and never folds organization-reported minutes into the
 * journal's figures (those stay beside, on the journal's own checks).
 *
 * Pure: no IO, no `Date`, no locale. Formatting belongs to the caller.
 */
export interface ContextHours {
  readonly hours: number;
  readonly confirmedHours: number;
  readonly entries: number;
}

/**
 * The journal's figures for every history row that HAS journal entries. A
 * row with no entries is simply absent — the card then shows no hours line
 * for it (not "0 h": nothing was recorded there, and that is not the same
 * sentence). A `null` ledger (not loaded on this surface, or unreadable)
 * yields an empty map for the same reason.
 */
export function contextHoursById(
  history: readonly Pick<WorkHistoryEntry, "id">[],
  contexts: readonly ContextWorkTime[] | null | undefined,
): ReadonlyMap<string, ContextHours> {
  const out = new Map<string, ContextHours>();
  if (!contexts || contexts.length === 0 || history.length === 0) return out;
  const byId = new Map<string, ContextWorkTime>();
  for (const c of contexts) {
    if (c.engagementContextId) byId.set(c.engagementContextId, c);
  }
  for (const h of history) {
    const c = byId.get(h.id);
    if (!c || c.entries === 0) continue;
    out.set(h.id, { hours: c.hours, confirmedHours: c.confirmedHours, entries: c.entries });
  }
  return out;
}
