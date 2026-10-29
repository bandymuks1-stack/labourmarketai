/**
 * GROWTH DAILY — the wire body of `GET /api/internal/growth-daily/v1` (pure; no I/O).
 *
 * Owner directive 2026-10-29: Agentai OS is measured DAILY by REAL registrations and ACTIVE Living CVs that its
 * invitations produce, not by invitations sent. This module turns the database aggregate
 * (`agentai_daily_growth_aggregate_v1`, counts only) into the agreed body and applies the SMALL-CELL RULE before anything
 * leaves this product. Contract: docs/contracts/AGENTAI_GROWTH_DAILY_V1.md.
 *
 * SMALL-CELL RULE. No attribution group with fewer than `MIN_CELL` registrations is published. A small group is rolled
 * up one level at a time — content, then campaign, then medium, then source — and a level that is still small rolls on.
 * What is left after the source level is one bucket with every key "(suppressed)". Agentai's `utm_content` is a
 * per-recipient tag, so a single invitee's tag is always a cell of one and is always rolled up: the export can say "a
 * campaign produced 4 registrations", never "this invitee registered".
 *
 * UNTRUSTED LABELS. utm values are whatever a visitor's URL carried (the signup sanitizer only strips control characters
 * and caps length). A value outside the slug charset becomes "(unrecognised)" so free text — an e-mail address typed into
 * a link, say — can never be echoed back, even in a large cell.
 *
 * FAIL CLOSED. Anything malformed, or groups that do not sum to the total, is null → 503. A missing count is an outage,
 * never a zero.
 */

export const GROWTH_DAILY_DEFINITION_VERSION = "lm-growth-daily/v1" as const;

/** Groups below this many registrations are never published as their own row. */
export const MIN_CELL = 3;

/** How far back a day may be asked for. Older days are not served: erasures make them drift, and nobody needs them. */
export const GROWTH_DAILY_MAX_LOOKBACK_DAYS = 92;

export const SUPPRESSED = "(suppressed)" as const;
export const UNRECOGNISED = "(unrecognised)" as const;

type UtmKey = "utmSource" | "utmMedium" | "utmCampaign" | "utmContent";

/** One attribution group. `null` = the registration carried no such tag (organic / untagged). */
export type AttributionGroup = Readonly<Record<UtmKey, string | null>> & { readonly count: number };

export interface GrowthDailyBody {
  readonly day: string;
  readonly registrations: { readonly total: number; readonly byAttribution: readonly AttributionGroup[] };
  readonly activeLivingCv: number;
  readonly definitionVersion: typeof GROWTH_DAILY_DEFINITION_VERSION;
  readonly generatedAt: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_LABEL = /^[A-Za-z0-9._-]{1,120}$/;
const DAY_MS = 86_400_000;

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The day to report: `?day=YYYY-MM-DD` (UTC), default yesterday. Only COMPLETE days — today is refused, because a
 * partial day read as a daily number would be a wrong number — and no further back than the lookback.
 */
export function resolveGrowthDay(param: string | null, nowMs: number): { ok: true; day: string } | { ok: false } {
  const yesterday = utcDay(nowMs - DAY_MS);
  if (param === null || param === "") return { ok: true, day: yesterday };
  if (!DAY_RE.test(param)) return { ok: false };
  const ms = Date.parse(`${param}T00:00:00Z`);
  if (!Number.isFinite(ms) || utcDay(ms) !== param) return { ok: false };
  const earliest = utcDay(nowMs - GROWTH_DAILY_MAX_LOOKBACK_DAYS * DAY_MS);
  if (param > yesterday || param < earliest) return { ok: false };
  return { ok: true, day: param };
}

function isCount(v: unknown, min = 0): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min;
}

function label(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return undefined;
  return SAFE_LABEL.test(raw) ? raw : UNRECOGNISED;
}

type Key = [string | null, string | null, string | null, string | null];

function merge(into: Map<string, { key: Key; count: number }>, key: Key, count: number): void {
  const id = JSON.stringify(key);
  const row = into.get(id);
  if (row) row.count += count;
  else into.set(id, { key, count });
}

/**
 * The small-cell roll-up. Level 4 is the full (source, medium, campaign, content) tuple; each pass replaces the
 * right-most still-visible key of every small group with SUPPRESSED and re-merges. After level 1 every key is
 * SUPPRESSED: that residual bucket names no attribution at all, so it is published whatever its size (the total is
 * public anyway, and total minus the visible rows would reveal it regardless).
 */
export function suppressSmallCells(groups: ReadonlyArray<{ key: Key; count: number }>): AttributionGroup[] {
  let pending = new Map<string, { key: Key; count: number }>();
  for (const g of groups) merge(pending, g.key, g.count);
  const kept: { key: Key; count: number }[] = [];
  for (let level = 3; level >= 0; level -= 1) {
    const next = new Map<string, { key: Key; count: number }>();
    for (const row of pending.values()) {
      if (row.count >= MIN_CELL) kept.push(row);
      else {
        const key = [...row.key] as Key;
        key[level] = SUPPRESSED;
        merge(next, key, row.count);
      }
    }
    pending = next;
  }
  // Everything still pending is the all-SUPPRESSED residual (at most one row).
  for (const row of pending.values()) if (row.count > 0) kept.push(row);
  // Count desc, the residual always last, ties by key so the order is deterministic.
  const residual = (k: Key) => k.every((v) => v === SUPPRESSED);
  return kept
    .sort((a, b) =>
      Number(residual(a.key)) - Number(residual(b.key)) ||
      b.count - a.count ||
      JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)),
    )
    .map(({ key, count }) => ({ utmSource: key[0], utmMedium: key[1], utmCampaign: key[2], utmContent: key[3], count }));
}

/** The body from the database function's jsonb, or null when anything is missing, malformed or inconsistent. */
export function buildGrowthDaily(raw: unknown, day: string, generatedAt: string): GrowthDailyBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (src.day !== day) return null;
  const total = src.registrations_total;
  const active = src.active_living_cv;
  const list = src.registrations_by_attribution;
  if (!isCount(total) || !isCount(active) || !Array.isArray(list)) return null;

  const groups: { key: Key; count: number }[] = [];
  let sum = 0;
  for (const item of list) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const g = item as Record<string, unknown>;
    if (!isCount(g.n, 1)) return null;
    const key = [label(g.utm_source), label(g.utm_medium), label(g.utm_campaign), label(g.utm_content)];
    if (key.some((k) => k === undefined)) return null;
    groups.push({ key: key as Key, count: g.n });
    sum += g.n;
  }
  if (sum !== total) return null;

  return {
    day,
    registrations: { total, byAttribution: suppressSmallCells(groups) },
    activeLivingCv: active,
    definitionVersion: GROWTH_DAILY_DEFINITION_VERSION,
    generatedAt,
  };
}
