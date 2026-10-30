/**
 * GROWTH DAILY — the wire body of `GET /api/internal/growth-daily/v1` (pure; no I/O).
 *
 * Owner directive 2026-10-29: Agentai OS is measured DAILY by REAL registrations and Living CVs that its invitations
 * produce, not by invitations sent. This module turns the database aggregate (`agentai_daily_growth_aggregate_v1`,
 * counts only) into the agreed body and applies the SMALL-CELL RULE before anything leaves this product.
 * Contract: docs/contracts/AGENTAI_GROWTH_DAILY_V1.md.
 *
 * SMALL-CELL RULE (owner 2026-10-29: no exact 1 or 2 in the external export until the re-identification risk is
 * assessed). Every published number below `MIN_CELL` is withheld:
 *  - the three headline counts (registrations total, active and completed Living CVs) are `{ count, suppressed }`; a
 *    value of 1 or 2 is `{ count: null, suppressed: true }`. Zero is published: it describes nobody.
 *  - an attribution group below `MIN_CELL` is rolled up one level at a time — content, then campaign, then medium, then
 *    source — and a level that is still small rolls on. What is left after the source level is one residual row with
 *    every key "(suppressed)". Agentai's `utm_content` is a per-recipient tag, so a single invitee's tag is always a cell
 *    of one and is always rolled up: the export can say "a campaign produced 4 registrations", never "this invitee
 *    registered".
 *  - COMPLEMENTARY: when the total is published, the residual row could be worked out as total minus the visible rows.
 *    So a residual of 1 or 2 absorbs the smallest visible row until it reaches `MIN_CELL`; when the total itself is
 *    withheld, no attribution row is published at all.
 *
 * UNTRUSTED LABELS. utm values are whatever a visitor's URL carried (the signup sanitizer only strips control characters
 * and caps length). A value outside the slug charset becomes "(unrecognised)" so free text — an e-mail address typed into
 * a link, say — can never be echoed back, even in a large cell.
 *
 * FAIL CLOSED. Anything malformed, or groups that do not sum to the total, is null → 503. A missing count is an outage,
 * never a zero.
 */

export const GROWTH_DAILY_DEFINITION_VERSION = "lm-growth-daily/v1" as const;

/** No published number is below this, other than zero. */
export const MIN_CELL = 3;

/** How far back a day may be asked for. Older days are not served: erasures make them drift, and nobody needs them. */
export const GROWTH_DAILY_MAX_LOOKBACK_DAYS = 92;

export const SUPPRESSED = "(suppressed)" as const;
export const UNRECOGNISED = "(unrecognised)" as const;

type UtmKey = "utmSource" | "utmMedium" | "utmCampaign" | "utmContent";

/** A headline count: exact when 0 or at least `MIN_CELL`, otherwise withheld. */
export type SuppressibleCount =
  | { readonly count: number; readonly suppressed: false }
  | { readonly count: null; readonly suppressed: true };

/** One attribution group, always at least `MIN_CELL`. `null` = the registration carried no such tag (organic). */
export type AttributionGroup = Readonly<Record<UtmKey, string | null>> & { readonly count: number };

export interface GrowthDailyBody {
  readonly day: string;
  readonly registrations: { readonly total: SuppressibleCount; readonly byAttribution: readonly AttributionGroup[] };
  readonly activeLivingCv: SuppressibleCount;
  readonly completedLivingCv: SuppressibleCount;
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

/** Zero and anything at or above `MIN_CELL` are published; 1 and 2 are withheld. */
export function suppressCount(n: number): SuppressibleCount {
  return n === 0 || n >= MIN_CELL ? { count: n, suppressed: false } : { count: null, suppressed: true };
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
type Row = { key: Key; count: number };

const RESIDUAL: Key = [SUPPRESSED, SUPPRESSED, SUPPRESSED, SUPPRESSED];
const isResidual = (k: Key) => k.every((v) => v === SUPPRESSED);

function merge(into: Map<string, Row>, key: Key, count: number): void {
  const id = JSON.stringify(key);
  const row = into.get(id);
  if (row) row.count += count;
  else into.set(id, { key, count });
}

/**
 * The attribution roll-up for a PUBLISHED total (at least `MIN_CELL`). Level 4 is the full (source, medium, campaign,
 * content) tuple; each pass replaces the right-most still-visible key of every small group with SUPPRESSED and
 * re-merges. After level 1 every key is SUPPRESSED; a residual of 1 or 2 then absorbs the smallest visible rows until it
 * is not, so it cannot be recovered as total minus the visible rows. Every returned row is at least `MIN_CELL`.
 */
export function suppressSmallCells(groups: ReadonlyArray<Row>): AttributionGroup[] {
  let pending = new Map<string, Row>();
  for (const g of groups) merge(pending, g.key, g.count);
  const kept: Row[] = [];
  for (let level = 3; level >= 0; level -= 1) {
    const next = new Map<string, Row>();
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
  let residual = [...pending.values()].reduce((s, r) => s + r.count, 0);
  const visible = kept.filter((r) => !isResidual(r.key));
  residual += kept.filter((r) => isResidual(r.key)).reduce((s, r) => s + r.count, 0);
  visible.sort((a, b) => a.count - b.count || JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)));
  while (residual > 0 && residual < MIN_CELL && visible.length > 0) residual += visible.shift()!.count;

  const rows = visible
    .sort((a, b) => b.count - a.count || JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)))
    .concat(residual > 0 ? [{ key: RESIDUAL, count: residual }] : []);
  return rows.map(({ key, count }) => ({ utmSource: key[0], utmMedium: key[1], utmCampaign: key[2], utmContent: key[3], count }));
}

/** The body from the database function's jsonb, or null when anything is missing, malformed or inconsistent. */
export function buildGrowthDaily(raw: unknown, day: string, generatedAt: string): GrowthDailyBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (src.day !== day) return null;
  const total = src.registrations_total;
  const active = src.active_living_cv;
  const completed = src.completed_living_cv;
  const list = src.registrations_by_attribution;
  if (!isCount(total) || !isCount(active) || !isCount(completed) || !Array.isArray(list)) return null;

  const groups: Row[] = [];
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

  const totalOut = suppressCount(total);
  return {
    day,
    registrations: { total: totalOut, byAttribution: totalOut.suppressed ? [] : suppressSmallCells(groups) },
    activeLivingCv: suppressCount(active),
    completedLivingCv: suppressCount(completed),
    definitionVersion: GROWTH_DAILY_DEFINITION_VERSION,
    generatedAt,
  };
}
