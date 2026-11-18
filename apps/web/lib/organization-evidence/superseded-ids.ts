/**
 * The ids of an organization's records that a correction SUPERSEDED — every
 * record carrying a `corrected` event (the same rule deriveEvidenceStanding
 * applies: superseded = a `corrected` event exists, never inferred from
 * `correction_of`). Readers that select records raw (no standing) drop these
 * ids so an original and its correction never both count.
 *
 * Paged to the end; `null` on a failed page (unknown is not "none").
 */
type Untyped = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          order: (c: string, o: { ascending: boolean }) => {
            range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
};

export async function readSupersededRecordIds(client: unknown, organizationId: string): Promise<Set<string> | null> {
  const db = client as Untyped;
  const ids = new Set<string>();
  for (let from = 0; from < 200_000; from += 1000) {
    const res = await db
      .from("organization_evidence_events")
      .select("id, record_id")
      .eq("organization_id", organizationId)
      .eq("event_type", "corrected")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (res.error) return null;
    const rows = (res.data ?? []) as { record_id: string }[];
    for (const r of rows) ids.add(r.record_id);
    if (rows.length < 1000) return ids;
  }
  return ids;
}
