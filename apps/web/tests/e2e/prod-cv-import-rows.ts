import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * THE CV IMPORT WALK'S ROWS, read and removed through the synthetic worker's own
 * token: its own rows only, under its own row-level security.
 *
 * Not through the profile page. Its remove button is the same delete plus a
 * `revalidatePath("/", "layout")`, and removing rows one at a time through it did
 * not finish in its hook on production (run 42098444964). Here a
 * sweep is 1 read + 1 delete + 1 read per table, whatever the row count.
 *
 * Only this walk writes the prefix `QA-SYNTHETIC R`. Other walks write
 * `QA-SYNTHETIC <run id>` or a word.
 */
const PREFIX = "QA-SYNTHETIC R";

export type CvRowKind = "education" | "certificate";
const TABLES: Record<CvRowKind, { table: string; column: string }> = {
  education: { table: "worker_education", column: "institution_name" },
  certificate: { table: "worker_achievements", column: "title" },
};

/** The synthetic worker's token and id. `bearerOf` refuses anything but an allowlisted identity. */
function worker(): { token: string; id: string } {
  const token = bearerOf("worker2");
  const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: string };
  if (!claims.sub) throw new Error("the synthetic worker's token names nobody");
  return { token, id: claims.sub };
}

function filter(kind: CvRowKind, id: string): `/${string}` {
  const { table, column } = TABLES[kind];
  return `/rest/v1/${table}?profile_id=eq.${id}&${column}=like.${encodeURIComponent(PREFIX)}*`;
}

/** Every title with this walk's prefix, one entry per stored row. */
export async function cvRowTitles(kind: CvRowKind): Promise<string[]> {
  const { token, id } = worker();
  const { column } = TABLES[kind];
  const res = await qaApi(`${filter(kind, id)}&select=${column}&limit=1000`, token);
  if (!res.ok) throw new Error(`reading ${kind} rows answered ${res.status}`);
  return ((await res.json()) as Record<string, string>[]).map((row) => row[column]);
}

/** Removes every row with the prefix, from any run, and says what was there and what stayed. */
export async function sweepCvRows(
  kind: CvRowKind,
  thisRunTag: string,
): Promise<{ removed: number; earlier: number; left: number; titles: string[] }> {
  const titles = await cvRowTitles(kind);
  if (titles.length > 0) {
    const { token, id } = worker();
    const res = await qaApi(filter(kind, id), token, { method: "DELETE" });
    if (!res.ok) throw new Error(`removing ${kind} rows answered ${res.status}`);
  }
  const left = (await cvRowTitles(kind)).length;
  return {
    removed: titles.length - left,
    earlier: titles.filter((t) => !t.startsWith(`${thisRunTag} `)).length,
    left,
    titles,
  };
}
