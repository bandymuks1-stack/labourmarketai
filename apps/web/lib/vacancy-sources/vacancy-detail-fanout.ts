/**
 * TWO-LEVEL FEED EXPANSION — the pure half.
 *
 * A two-level publisher (NAV) lists entries on a page and keeps each live ad at
 * its own URL. This module turns such a page into the page the pure provider
 * parser already understands, so neither the parser nor the importer learns
 * that a detail request existed. The HTTP is INJECTED (`fetchDetail`): this
 * file has no fetch, no env and no clock, so every rule below is unit-tested
 * without a network.
 *
 * Rules, all of them about not losing or inventing an ad:
 *   - the LATEST entry per uuid on a page decides; an earlier ACTIVE entry that
 *     a later INACTIVE one supersedes is never fetched;
 *   - an INACTIVE entry is NEVER fetched: it is handed on as a withdrawal, so
 *     "remove the ad immediately" costs no request and cannot be skipped;
 *   - the entry's URL must be on the SAME host (a relative path, or an absolute
 *     https URL on the descriptor's host) — the entry cannot steer a request
 *     elsewhere;
 *   - a live entry whose ad is GONE (404/410) is a withdrawal, the safe
 *     direction; any other failure fails the WHOLE page closed, so the cursor
 *     can never move past an ad that was not read;
 *   - a page that would cost more detail requests than the descriptor allows
 *     fails closed instead of being silently truncated;
 *   - a SESSION BUDGET may stop the page part-way, but only ever at an entry
 *     BOUNDARY: every entry before the cut is fully resolved, every entry from
 *     the cut on is untouched, and `consumedEntries` says exactly where the cut
 *     is. The caller checkpoints on that number and the next session starts at
 *     it (`skipEntries`), so a budget can delay an ad but never skip one.
 */
import type { VacancyChannelEndpointV1 } from "./vacancy-provider-registry";

export type DetailFetchResult =
  | { readonly ok: true; readonly body: unknown; /** Network time of the request(s), excluding pacing waits. */ readonly elapsedMs?: number }
  | { readonly ok: false; readonly gone: boolean; readonly detail: string; readonly elapsedMs?: number };

/**
 * Per-session evidence about the detail requests, for the accounting. Public
 * identifiers and numbers only (the NAV uuid is a public ad id) — no token, no
 * payload. Reported on success AND failure so a stall can be diagnosed from the
 * accounting alone.
 */
export interface DetailFanOutDiagnostics {
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  /** Network elapsed per resolved request (ms); null when none finished. */
  readonly elapsedMs: { readonly min: number; readonly median: number; readonly max: number } | null;
  /** The first failure of the session (page position counts the skip prefix). */
  readonly firstFailure: {
    readonly uuid: string | null;
    readonly position: number;
    readonly cause: string;
    readonly elapsedMs: number | null;
  } | null;
}

export interface DetailFanOutStats {
  readonly entries: number;
  readonly duplicatesCollapsed: number;
  readonly detailFetched: number;
  readonly withdrawn: number;
  readonly goneAsWithdrawn: number;
}

export type DetailFanOutOutcome =
  | {
      readonly ok: true;
      readonly body: unknown;
      readonly stats: DetailFanOutStats;
      /** Entries of the WHOLE page consumed, counting the `skipEntries` prefix. */
      readonly consumedEntries: number;
      /** False when the budget stopped the page before its last entry. */
      readonly pageComplete: boolean;
      readonly diagnostics: DetailFanOutDiagnostics;
    }
  | { readonly ok: false; readonly detail: string; readonly stats: DetailFanOutStats; readonly diagnostics: DetailFanOutDiagnostics };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function readPath(root: unknown, path: readonly string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    const rec = asRecord(cur);
    if (rec === null) return undefined;
    cur = rec[key];
  }
  return cur;
}

/**
 * A safe request URL for one entry, or null when it is not one. Only a path
 * beginning `/` (same origin by construction) or an https URL on the
 * descriptor's own host, with no credentials and no non-default port.
 */
export function resolveEntryUrl(host: string, raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  if (raw.startsWith("//")) return null;
  try {
    const url = new URL(raw, `https://${host}`);
    if (url.protocol !== "https:" || url.host !== host) return null;
    if (url.username !== "" || url.password !== "") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function expandDetailFanOut(args: {
  readonly endpoint: Pick<VacancyChannelEndpointV1, "host" | "detailFanOut">;
  readonly body: unknown;
  readonly fetchDetail: (url: string) => Promise<DetailFetchResult>;
  /** Most detail requests this call may spend. Absent = unlimited. */
  readonly detailBudget?: number;
  /** Leading entries of the page already consumed by an earlier session. A
   *  value larger than the page is ignored (re-read from the start). */
  readonly skipEntries?: number;
}): Promise<DetailFanOutOutcome> {
  const cfg = args.endpoint.detailFanOut;
  const empty: DetailFanOutStats = { entries: 0, duplicatesCollapsed: 0, detailFetched: 0, withdrawn: 0, goneAsWithdrawn: 0 };
  const noDiag: DetailFanOutDiagnostics = { attempted: 0, succeeded: 0, failed: 0, elapsedMs: null, firstFailure: null };
  if (!cfg) {
    return { ok: true, body: args.body, stats: empty, consumedEntries: 0, pageComplete: true, diagnostics: noDiag };
  }
  const page = asRecord(args.body);
  const allItems = page ? page[cfg.itemsKey] : undefined;
  if (page === null || !Array.isArray(allItems)) {
    return { ok: false, detail: "fan_out_body_not_a_page", stats: empty, diagnostics: noDiag };
  }
  // Resume inside the page. A stored position past the end means the page is
  // not the page it was: re-read it whole (a re-read is safe, a skip is not).
  const skip =
    typeof args.skipEntries === "number" && Number.isInteger(args.skipEntries) && args.skipEntries > 0 && args.skipEntries <= allItems.length
      ? args.skipEntries
      : 0;
  const items = skip > 0 ? allItems.slice(skip) : allItems;

  // Latest entry per uuid wins; first-seen order of the winners is kept.
  const latest = new Map<string, { entry: Record<string, unknown>; index: number; uuid: string | null }>();
  const unkeyed: { entry: Record<string, unknown>; index: number; uuid: string | null }[] = [];
  items.forEach((raw, index) => {
    const entry = asRecord(raw);
    if (entry === null) return;
    const uuid = readPath(entry, ["_feed_entry", "uuid"]) ?? entry.uuid ?? entry.id;
    if (typeof uuid === "string" && uuid.length > 0) latest.set(uuid, { entry, index, uuid });
    else unkeyed.push({ entry, index, uuid: null });
  });
  const winners = [...latest.values(), ...unkeyed].sort((a, b) => a.index - b.index);
  const duplicatesCollapsed = items.length - winners.length;

  const isLive = (w: { entry: Record<string, unknown> }) => readPath(w.entry, cfg.statusPath) === cfg.activeValue;
  if (winners.filter(isLive).length > cfg.maxDetailFetchesPerPage) {
    return {
      ok: false,
      detail: `fan_out_page_over_budget:${winners.filter(isLive).length}`,
      stats: { ...empty, entries: items.length, duplicatesCollapsed },
      diagnostics: noDiag,
    };
  }

  // SESSION BUDGET. Cut at the first live winner the budget cannot pay for.
  // Everything before it (including free withdrawals) is consumed; it and
  // everything after are left for the next session. Index in `items`.
  const budget =
    typeof args.detailBudget === "number" && Number.isFinite(args.detailBudget)
      ? Math.max(0, Math.floor(args.detailBudget))
      : Infinity;
  let cutAt = items.length;
  let affordable = winners;
  {
    let spent = 0;
    for (let i = 0; i < winners.length; i += 1) {
      if (!isLive(winners[i])) continue;
      if (spent >= budget) {
        cutAt = winners[i].index;
        affordable = winners.slice(0, i);
        break;
      }
      spent += 1;
    }
  }
  const live = affordable.filter(isLive);

  const resolved = new Map<number, unknown>();
  let fetched = 0;
  let goneAsWithdrawn = 0;
  let failure: string | null = null;
  const latencies: number[] = [];
  let attempted = 0;
  let failedCount = 0;
  let firstFailure: DetailFanOutDiagnostics["firstFailure"] = null;

  const withdrawal = (entry: Record<string, unknown>): Record<string, unknown> => {
    const meta = asRecord(entry._feed_entry) ?? entry;
    const out: Record<string, unknown> = {};
    for (const key of cfg.withdrawalKeys) if (meta[key] !== undefined) out[key] = meta[key];
    out.status = "INACTIVE";
    return out;
  };

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (failure !== null) return;
      const at = cursor++;
      if (at >= live.length) return;
      const w = live[at];
      const url = resolveEntryUrl(args.endpoint.host, w.entry[cfg.entryUrlKey]);
      if (url === null) {
        failure = "fan_out_entry_url_refused";
        return;
      }
      attempted += 1;
      const res = await args.fetchDetail(url);
      if (typeof res.elapsedMs === "number") latencies.push(res.elapsedMs);
      if (res.ok) {
        fetched += 1;
        resolved.set(w.index, res.body);
      } else if (res.gone) {
        goneAsWithdrawn += 1;
        resolved.set(w.index, withdrawal(w.entry));
      } else {
        failure = `fan_out_detail_failed:${res.detail}`;
        failedCount += 1;
        firstFailure ??= {
          uuid: w.uuid,
          position: skip + w.index,
          cause: res.detail,
          elapsedMs: typeof res.elapsedMs === "number" ? res.elapsedMs : null,
        };
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, live.length || 1)) }, worker));

  const stats: DetailFanOutStats = {
    entries: items.length,
    duplicatesCollapsed,
    detailFetched: fetched,
    withdrawn: affordable.length - live.length + goneAsWithdrawn,
    goneAsWithdrawn,
  };
  const sorted = [...latencies].sort((a, b) => a - b);
  const diagnostics: DetailFanOutDiagnostics = {
    attempted,
    succeeded: fetched + goneAsWithdrawn,
    failed: failedCount,
    elapsedMs: sorted.length
      ? { min: sorted[0], median: sorted[Math.floor((sorted.length - 1) / 2)], max: sorted[sorted.length - 1] }
      : null,
    firstFailure,
  };
  if (failure !== null) return { ok: false, detail: failure, stats, diagnostics };

  const expanded = affordable.map((w) => (resolved.has(w.index) ? resolved.get(w.index) : withdrawal(w.entry)));
  return {
    ok: true,
    body: { ...page, [cfg.itemsKey]: expanded },
    stats,
    consumedEntries: skip + cutAt,
    pageComplete: cutAt === items.length,
    diagnostics,
  };
}
