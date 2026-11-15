import { isSyntheticCommercialRequest, type SyntheticIntakeTexts } from "./commercial-requests-feed";

/**
 * REAL-REQUEST COUNTS over `company_need_public_intakes` (owner 2026-11-14).
 *
 * Our own test rows (a production walk, an e2e proof) must never raise a number
 * someone reads as real demand. The rule is the feed's ONE predicate,
 * `isSyntheticCommercialRequest`; this module only reads the columns it needs and
 * counts with it, for launch readiness (lib/admin/launch-readiness.ts) and the
 * Agentai capability readback (app/api/internal/capability-readback/v1/route.ts).
 *
 * WHY READ ROWS AND NOT A SQL COUNT: the marker rule is a set of regexes over four
 * free-text columns. Writing it again in SQL would be a second copy of the rule that
 * drifts; a migration is out of scope. The table is small (a public form behind
 * rate limits and table-level caps), so reading id, status and the four texts in
 * pages is cheap.
 *
 * The caller passes its OWN already-authorized service-role client: this module
 * creates no client and writes nothing. A failed or oversized read is `null`,
 * never a partial list, so a caller can never turn it into a confident number.
 */

export const INTAKE_COUNT_COLUMNS =
  "id, created_at, status, company_name, contact_name, contact_email, description";

export interface IntakeCountRow extends SyntheticIntakeTexts {
  readonly id: string;
  readonly status: string | null;
}

/** PostgREST answers at most 1000 rows per request by default. */
export const INTAKE_COUNT_PAGE = 1000;
/** Fail closed past this many rows instead of reading without end. */
export const INTAKE_COUNT_MAX_PAGES = 100;

interface RangeResult {
  readonly data: unknown;
  readonly error: unknown;
}
interface IntakeQuery {
  order(column: string, options: { ascending: boolean }): IntakeQuery;
  range(from: number, to: number): PromiseLike<RangeResult>;
}
interface IntakeReader {
  from(table: "company_need_public_intakes"): { select(columns: string): IntakeQuery };
}

/** Every intake row's status and texts, oldest first, or null on any failed read. */
export async function readIntakeCountRows(client: unknown): Promise<readonly IntakeCountRow[] | null> {
  const reader = client as IntakeReader;
  const rows: IntakeCountRow[] = [];
  try {
    for (let page = 0; page < INTAKE_COUNT_MAX_PAGES; page += 1) {
      const start = page * INTAKE_COUNT_PAGE;
      const { data, error } = await reader
        .from("company_need_public_intakes")
        .select(INTAKE_COUNT_COLUMNS)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(start, start + INTAKE_COUNT_PAGE - 1);
      if (error || !Array.isArray(data)) return null;
      rows.push(...(data as IntakeCountRow[]));
      if (data.length < INTAKE_COUNT_PAGE) return rows;
    }
    return null;
  } catch {
    return null;
  }
}

/** How many of the rows are our own test rows. */
export function countSyntheticIntakes(rows: readonly IntakeCountRow[]): number {
  return rows.filter((r) => isSyntheticCommercialRequest(r)).length;
}

/** Real (non-test) rows per stored status. A status with no real row is absent. */
export function countRealIntakesByStatus(rows: readonly IntakeCountRow[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (isSyntheticCommercialRequest(r)) continue;
    const status = r.status ?? "";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
