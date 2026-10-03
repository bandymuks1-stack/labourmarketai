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
 *     fails closed instead of being silently truncated.
 */
import type { VacancyChannelEndpointV1 } from "./vacancy-provider-registry";

export type DetailFetchResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly gone: boolean; readonly detail: string };

export interface DetailFanOutStats {
  readonly entries: number;
  readonly duplicatesCollapsed: number;
  readonly detailFetched: number;
  readonly withdrawn: number;
  readonly goneAsWithdrawn: number;
}

export type DetailFanOutOutcome =
  | { readonly ok: true; readonly body: unknown; readonly stats: DetailFanOutStats }
  | { readonly ok: false; readonly detail: string; readonly stats: DetailFanOutStats };

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
}): Promise<DetailFanOutOutcome> {
  const cfg = args.endpoint.detailFanOut;
  const empty: DetailFanOutStats = { entries: 0, duplicatesCollapsed: 0, detailFetched: 0, withdrawn: 0, goneAsWithdrawn: 0 };
  if (!cfg) return { ok: true, body: args.body, stats: empty };
  const page = asRecord(args.body);
  const items = page ? page[cfg.itemsKey] : undefined;
  if (page === null || !Array.isArray(items)) {
    return { ok: false, detail: "fan_out_body_not_a_page", stats: empty };
  }

  // Latest entry per uuid wins; first-seen order of the winners is kept.
  const latest = new Map<string, { entry: Record<string, unknown>; index: number }>();
  const unkeyed: { entry: Record<string, unknown>; index: number }[] = [];
  items.forEach((raw, index) => {
    const entry = asRecord(raw);
    if (entry === null) return;
    const uuid = readPath(entry, ["_feed_entry", "uuid"]) ?? entry.uuid ?? entry.id;
    if (typeof uuid === "string" && uuid.length > 0) latest.set(uuid, { entry, index });
    else unkeyed.push({ entry, index });
  });
  const winners = [...latest.values(), ...unkeyed].sort((a, b) => a.index - b.index);
  const duplicatesCollapsed = items.length - winners.length;

  const live = winners.filter((w) => readPath(w.entry, cfg.statusPath) === cfg.activeValue);
  if (live.length > cfg.maxDetailFetchesPerPage) {
    return {
      ok: false,
      detail: `fan_out_page_over_budget:${live.length}`,
      stats: { ...empty, entries: items.length, duplicatesCollapsed },
    };
  }

  const resolved = new Map<number, unknown>();
  let fetched = 0;
  let goneAsWithdrawn = 0;
  let failure: string | null = null;

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
      const res = await args.fetchDetail(url);
      if (res.ok) {
        fetched += 1;
        resolved.set(w.index, res.body);
      } else if (res.gone) {
        goneAsWithdrawn += 1;
        resolved.set(w.index, withdrawal(w.entry));
      } else {
        failure = `fan_out_detail_failed:${res.detail}`;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, live.length || 1)) }, worker));

  const stats: DetailFanOutStats = {
    entries: items.length,
    duplicatesCollapsed,
    detailFetched: fetched,
    withdrawn: winners.length - live.length + goneAsWithdrawn,
    goneAsWithdrawn,
  };
  if (failure !== null) return { ok: false, detail: failure, stats };

  const expanded = winners.map((w) => (resolved.has(w.index) ? resolved.get(w.index) : withdrawal(w.entry)));
  return { ok: true, body: { ...page, [cfg.itemsKey]: expanded }, stats };
}
