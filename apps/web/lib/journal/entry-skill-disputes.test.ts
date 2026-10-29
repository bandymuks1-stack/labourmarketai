import { describe, expect, it } from "vitest";
import { disputeKey, predecessorsByEntry, readDisputedEntrySkills, withoutDisputedLinks } from "./entry-skill-disputes";

/**
 * The person's disputes are read COMPLETELY: PostgREST caps an unbounded
 * select at max_rows (1000) without a word, so a marker past the first page
 * would let its leftover link resurface as evidence (Codex review on #2885).
 */

type Marker = { entry_id: string; value_text: string; metric_slug?: string };

type ChainRow = { id: string; superseded_by: string | null; correction_of: string | null };
function markerClient(markers: Marker[], opts: { failPage?: number; chain?: ChainRow[] } = {}) {
  const ranges: [number, number][] = [];
  const client = {
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => q,
        in(col: string, vs: unknown[]) {
          filters.push((r) => vs.includes(r[col]));
          return q;
        },
        range: async (from: number, to: number) => {
          if (table === "journal_entries") return { data: (opts.chain ?? []).slice(from, to + 1), error: null };
          ranges.push([from, to]);
          if (opts.failPage !== undefined && from === opts.failPage * 1000) {
            return { data: null, error: { code: "57014" } };
          }
          return { data: markers.slice(from, to + 1), error: null };
        },
        then(resolve: (v: unknown) => void) {
          // skills catalogue
          const rows = table === "skills" ? SKILLS.filter((r) => filters.every((f) => f(r))) : [];
          resolve({ data: rows, error: null });
        },
      };
      return q;
    },
  };
  return { client, ranges };
}

const SKILLS = [
  { id: "s-tiling", slug: "tiling" },
  { id: "s-flooring", slug: "flooring" },
];

function manyMarkers(n: number, last: Marker): Marker[] {
  const out: Marker[] = Array.from({ length: n }, (_, i) => ({
    entry_id: `e-${String(i).padStart(5, "0")}`,
    metric_slug: "skill_rejected",
    value_text: "tiling",
  }));
  out.push(last);
  return out;
}

describe("readDisputedEntrySkills", () => {
  it("a marker beyond the first 1000 rows still excludes its link", async () => {
    const late = { entry_id: "e-late", metric_slug: "skill_rejected", value_text: "flooring" };
    const { client, ranges } = markerClient(manyMarkers(1100, late));
    const disputed = await readDisputedEntrySkills(client, "w1");
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(disputed?.has(disputeKey("e-late", "s-flooring"))).toBe(true);
    expect(disputed?.has(disputeKey("e-00000", "s-tiling"))).toBe(true);
    const kept = withoutDisputedLinks(
      [
        { journal_entry_id: "e-late", skill_id: "s-flooring" },
        { journal_entry_id: "e-late", skill_id: "s-tiling" },
      ],
      disputed,
    );
    expect(kept).toEqual([{ journal_entry_id: "e-late", skill_id: "s-tiling" }]);
  });

  it("a page that fails makes the whole read UNKNOWN (null), never a partial set", async () => {
    const { client } = markerClient(manyMarkers(1100, { entry_id: "e-late", metric_slug: "skill_rejected", value_text: "flooring" }), {
      failPage: 1,
    });
    expect(await readDisputedEntrySkills(client, "w1")).toBeNull();
  });

  it("a later explicit re-link supersedes the dispute (latest decision wins)", async () => {
    const markers = [
      { entry_id: "e1", metric_slug: "skill_rejected", value_text: "flooring", value_numeric: 100 },
      { entry_id: "e1", metric_slug: "skill_reaffirmed", value_text: "flooring", value_numeric: 200 },
      { entry_id: "e2", metric_slug: "skill_rejected", value_text: "flooring", value_numeric: 150 },
    ] as unknown as Marker[];
    const { client } = markerClient(markers);
    const disputed = await readDisputedEntrySkills(client, "w1");
    expect(disputed?.has(disputeKey("e1", "s-flooring"))).toBe(false);
    expect(disputed?.has(disputeKey("e2", "s-flooring"))).toBe(true);
  });

  it("dispute → re-link → text-only edit: the re-link on the predecessor still wins over the carried rejection", async () => {
    // e-old: disputed at 100, re-linked at 200; edited into e-new, onto which
    // the database carried ONLY the rejection (its old decision time, 100).
    const markers = [
      { entry_id: "e-old", metric_slug: "skill_rejected", value_text: "flooring", value_numeric: 100 },
      { entry_id: "e-old", metric_slug: "skill_reaffirmed", value_text: "flooring", value_numeric: 200 },
      { entry_id: "e-new", metric_slug: "skill_rejected", value_text: "flooring", value_numeric: 100 },
    ] as unknown as Marker[];
    const chain = [
      { id: "e-old", superseded_by: "e-new", correction_of: null },
      { id: "e-new", superseded_by: null, correction_of: null },
    ];
    const { client } = markerClient(markers, { chain });
    const disputed = await readDisputedEntrySkills(client, "w1");
    expect(disputed?.has(disputeKey("e-new", "s-flooring")), "the person's re-link stands after the edit").toBe(false);
  });

  it("dispute → text-only edit (no re-link): the dispute stays on the new entry", async () => {
    const markers = [
      { entry_id: "e-old", metric_slug: "skill_rejected", value_text: "flooring", value_numeric: 100 },
      { entry_id: "e-new", metric_slug: "skill_rejected", value_text: "flooring", value_numeric: 100 },
    ] as unknown as Marker[];
    const chain = [
      { id: "e-old", superseded_by: "e-new", correction_of: null },
      { id: "e-new", superseded_by: null, correction_of: null },
    ];
    const { client } = markerClient(markers, { chain });
    expect((await readDisputedEntrySkills(client, "w1"))?.has(disputeKey("e-new", "s-flooring"))).toBe(true);
  });

  it("the edit/correction chain is walked both ways it is stored", () => {
    const preds = predecessorsByEntry([
      { id: "a", superseded_by: "b", correction_of: null },
      { id: "b", superseded_by: null, correction_of: null },
      { id: "c", superseded_by: null, correction_of: "b" },
    ]);
    expect(preds.get("b")).toEqual(["a"]);
    expect(preds.get("c")?.sort()).toEqual(["a", "b"]);
    expect(preds.get("a")).toEqual([]);
  });

  it("no markers → an empty set (nothing disputed)", async () => {
    const { client } = markerClient([]);
    expect(await readDisputedEntrySkills(client, "w1")).toEqual(new Set());
  });
});
