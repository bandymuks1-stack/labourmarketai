/**
 * KEYSET PAGING over a live, append-mostly table (telemetry), newest first.
 *
 * Offset paging (`.range(from, to)`) shifts when a row is inserted, deleted
 * (privacy erasure) or committed late between page requests: a boundary row
 * is then counted twice or skipped. A keyset cursor does not shift — each
 * page asks for rows strictly OLDER than the last one read, by the total
 * order (created_at desc, id desc). The server answers at most 1000 rows per
 * request, so pages are 1000.
 *
 * `build` returns the filtered query WITHOUT order/limit; this adds them.
 * Rows must carry `created_at` and `id`. `truncated` = the cap was reached
 * (more rows MAY exist); `error` = a page failed (callers report unknown).
 */
export async function readKeysetPagesDesc<T extends { created_at: string; id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
  opts: { readonly maxRows: number; readonly pageSize?: number },
): Promise<{ rows: T[]; truncated: boolean; error: unknown | null }> {
  const size = opts.pageSize ?? 1000;
  const rows: T[] = [];
  let cursor: { createdAt: string; id: string } | null = null;
  while (rows.length < opts.maxRows) {
    const want = Math.min(size, opts.maxRows - rows.length);
    let q = build();
    if (cursor) {
      // Quoted values: a timestamp carries ':' '.' '+' — reserved in the filter grammar.
      q = q.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt."${cursor.id}")`,
      );
    }
    const res = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(want);
    if (res.error) return { rows: [], truncated: false, error: res.error };
    const batch = (res.data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < want) return { rows, truncated: false, error: null };
    const last = batch[batch.length - 1]!;
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return { rows, truncated: true, error: null };
}
