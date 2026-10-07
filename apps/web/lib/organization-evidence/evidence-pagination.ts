import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import {
  listEvidenceRecords,
  type EvidenceImportResult,
  type EvidenceRecordView,
} from "./import-core";

/**
 * EVERY RECORD, NOT THE FIRST THOUSAND.
 *
 * The server answers at most 1000 rows per request, and `listEvidenceRecords`
 * clamps `limit` to the same number. Two company surfaces asked for 1000 and
 * rendered what came back as the organization's whole history — production
 * holds 2,944 records, so every total on them was silently short, and nothing
 * on the page said so.
 *
 * This pages with `offset` (the list is totally ordered, so pages neither
 * repeat nor skip) until a page comes back short. A SAFETY CEILING bounds the
 * work; when it is reached the result says `truncated: true` and the caller
 * MUST disclose it — a cap that is hit is a statement, not a silent drop.
 * A failed page is the failure itself (never a shorter "ok"): unknown is not
 * "that is all there is".
 */

export const EVIDENCE_PAGE_SIZE = 1000;
/** Upper bound on records read in one request. Far above any organization's
 *  history today; hitting it is disclosed, never hidden. */
export const EVIDENCE_READ_CEILING = 20000;

type Filter = Parameters<typeof listEvidenceRecords>[1];
type ListFn = typeof listEvidenceRecords;

export async function listAllEvidenceRecords(
  caller: DomainCaller,
  filter: Omit<NonNullable<Filter>, "limit" | "offset"> = {},
  opts: { readonly ceiling?: number; readonly list?: ListFn } = {},
): Promise<
  EvidenceImportResult<{
    records: readonly EvidenceRecordView[];
    /** The ceiling was reached and more records exist than were read. */
    truncated: boolean;
  }>
> {
  const list = opts.list ?? listEvidenceRecords;
  const ceiling = Math.max(opts.ceiling ?? EVIDENCE_READ_CEILING, EVIDENCE_PAGE_SIZE);
  const all: EvidenceRecordView[] = [];
  let offset = 0;
  for (;;) {
    const page = await list(caller, { ...filter, limit: EVIDENCE_PAGE_SIZE, offset });
    if (page.kind !== "ok") return page;
    all.push(...page.records);
    if (page.records.length < EVIDENCE_PAGE_SIZE) return { kind: "ok", records: all, truncated: false };
    offset += EVIDENCE_PAGE_SIZE;
    if (all.length >= ceiling) {
      // Exactly at the ceiling is not truncation: peek for one more row.
      const peek = await list(caller, { ...filter, limit: 1, offset });
      if (peek.kind !== "ok") return peek;
      return { kind: "ok", records: all, truncated: peek.records.length > 0 };
    }
  }
}

/**
 * Pages any `.range(from, to)` read to the end (small tables the company
 * history reads beside the records — work objects, roster rows — used a bare
 * `.limit(500)` that was just as silent). Returns the rows, or `null` for a
 * failed page.
 */
export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opts: { readonly pageSize?: number; readonly ceiling?: number } = {},
): Promise<{ rows: T[]; truncated: boolean } | null> {
  const size = opts.pageSize ?? EVIDENCE_PAGE_SIZE;
  const ceiling = opts.ceiling ?? EVIDENCE_READ_CEILING;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const res = await page(from, from + size - 1);
    if (res.error) return null;
    const got = res.data ?? [];
    rows.push(...got);
    if (got.length < size) return { rows, truncated: false };
    if (rows.length >= ceiling) return { rows, truncated: true };
  }
}
