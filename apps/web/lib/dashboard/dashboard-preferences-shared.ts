/**
 * Shared dashboard-card preference shape + bounds (Company Architecture
 * Completion, Sprint v2 §5). Pure and client-safe — the grid component, the
 * server reader and the server action all consume THIS module so the
 * "what is a valid preference payload" decision has exactly one
 * implementation.
 *
 * Contract (matches the PR #751 localStorage shape, now server-backed):
 *   - ids only (module ids like "journal" / "market_map") — never query
 *     text, never PII;
 *   - hard bounds: ≤ 48 ids per list, ≤ 64 chars per id, closed id charset;
 *   - total payload ≤ 8 KB (mirrors the DB pg_column_size CHECK in
 *     migration 20260714211000 — the action refuses BEFORE the DB would).
 *
 * Guard: lib/dashboard/dashboard-preferences-shared.test.ts +
 * lib/guards/company-architecture-v1.test.ts.
 */

/** Person and company workspaces keep SEPARATE layouts (§20 symmetry). */
export type DashboardPreferencesContext = "person" | "company";

export const DASHBOARD_PREFERENCES_CONTEXTS: readonly DashboardPreferencesContext[] =
  ["person", "company"];

export function isDashboardPreferencesContext(
  v: string,
): v is DashboardPreferencesContext {
  return v === "person" || v === "company";
}

export interface DashboardCardPrefs {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
}

export const EMPTY_CARD_PREFS: DashboardCardPrefs = { order: [], hidden: [] };

/** Mirrors the DB CHECK (pg_column_size(preferences) <= 8192). */
export const DASHBOARD_PREFERENCES_MAX_BYTES = 8192;
/** More ids than the registry could ever hold — anything above is garbage.
 *  48 ids x 64 chars x 2 lists serializes to ~6.5 KB, so a SANITIZED payload
 *  always fits the 8 KB DB budget by construction. */
export const DASHBOARD_PREFERENCES_MAX_IDS = 48;
const MAX_ID_LENGTH = 64;
const ID_PATTERN = /^[a-z0-9_-]+$/;

function sanitizeIdList(v: unknown): readonly string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    if (item.length === 0 || item.length > MAX_ID_LENGTH) continue;
    if (!ID_PATTERN.test(item)) continue;
    if (out.includes(item)) continue; // ids are unique by definition
    out.push(item);
    if (out.length >= DASHBOARD_PREFERENCES_MAX_IDS) break;
  }
  return out;
}

/**
 * Defensive parse: ANY unknown input (stored jsonb, localStorage JSON,
 * action argument) → a valid, bounded DashboardCardPrefs. Never throws.
 */
export function sanitizeCardPrefs(input: unknown): DashboardCardPrefs {
  if (typeof input !== "object" || input === null) return EMPTY_CARD_PREFS;
  const p = input as { order?: unknown; hidden?: unknown };
  return { order: sanitizeIdList(p.order), hidden: sanitizeIdList(p.hidden) };
}

/** True when the serialized payload fits the DB byte budget. A sanitized
 *  payload always fits (48×2 bounded ids ≈ 6.5 KB worst case), but the
 *  action still checks so the DB CHECK is never the first line of defense. */
export function fitsPreferencesByteBudget(prefs: DashboardCardPrefs): boolean {
  return (
    JSON.stringify(prefs).length <= DASHBOARD_PREFERENCES_MAX_BYTES
  );
}
