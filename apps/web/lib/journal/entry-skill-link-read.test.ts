import { describe, expect, it } from "vitest";

import { readWorkerEntrySkillLinks } from "./entry-skill-link-read";

/**
 * THE LINK READ PAGES, AND SAYS WHEN IT STOPPED (issue #1689, lane B).
 *
 * NEGATIVE CONTROL. On the pre-change tree the read was one unbounded
 * select: against the 1 200-row client below it returned the first 1 000
 * links (PostgREST `max_rows`) and no `truncated` field — the 200 oldest
 * entries then read as "linked to no skill" and their hours as
 * unattributed, silently. Both tests below fail on that tree: the second
 * `.range()` never happens and `truncated` is undefined.
 */

type LinkRow = { journal_entry_id: string; skill_id: string; provenance: string | null };

function links(n: number): LinkRow[] {
  return Array.from({ length: n }, (_, i) => ({
    journal_entry_id: `e-${String(i).padStart(5, "0")}`,
    skill_id: i % 2 === 0 ? "s-tiling" : "s-plaster",
    provenance: i % 3 === 0 ? "recognized" : i % 3 === 1 ? "manual" : null,
  }));
}

function pagedClient(data: LinkRow[], opts: { extendedSelectFails?: boolean } = {}) {
  const ranges: [number, number][] = [];
  const selects: string[] = [];
  const client = {
    from: () => {
      let select = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      b.select = (s: string) => {
        select = s;
        selects.push(s);
        return b;
      };
      for (const m of ["eq", "order"]) b[m] = () => b;
      b.range = async (from: number, to: number) => {
        ranges.push([from, to]);
        if (opts.extendedSelectFails && select.includes("provenance")) {
          return { data: null, error: { message: "undefined_column" } };
        }
        const page = data.slice(from, to + 1);
        return {
          data: select.includes("provenance")
            ? page
            : page.map(({ journal_entry_id, skill_id }) => ({ journal_entry_id, skill_id })),
          error: null,
        };
      };
      return b;
    },
  };
  return { client, ranges, selects };
}

describe("readWorkerEntrySkillLinks — every link row, in 1000-row pages", () => {
  it("1 200 links arrive as two pages with their provenance, not truncated (pre-change: 1 000, silently)", async () => {
    const { client, ranges } = pagedClient(links(1200));
    const r = await readWorkerEntrySkillLinks(client, "w-1");
    expect(r.ok).toBe(true);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(r.rows).toHaveLength(1200);
    expect(r.truncated).toBe(false);
    // the rows are the link shape only; provenance travels in the map
    expect(r.rows[0]).toEqual({ journal_entry_id: "e-00000", skill_id: "s-tiling" });
    expect(r.provenanceByEntry.get("e-01199")?.get("s-plaster")).toBe(null);
    expect(r.provenanceByEntry.get("e-01198")?.get("s-tiling")).toBe("manual");
    expect(r.provenanceByEntry.get("e-01197")?.get("s-plaster")).toBe("recognized");
    expect(r.provenanceByEntry.size).toBe(1200);
  });

  it("the pre-migration fallback pages the legacy projection too, with an empty provenance map", async () => {
    const { client, ranges, selects } = pagedClient(links(1500), { extendedSelectFails: true });
    const r = await readWorkerEntrySkillLinks(client, "w-1");
    expect(r.ok).toBe(true);
    // one extended select (its first page fails), then one legacy select per page
    expect(selects).toEqual([
      "journal_entry_id, skill_id, provenance",
      "journal_entry_id, skill_id",
      "journal_entry_id, skill_id",
    ]);
    // one failed extended page, then two legacy pages
    expect(ranges).toEqual([[0, 999], [0, 999], [1000, 1999]]);
    expect(r.rows).toHaveLength(1500);
    expect(r.provenanceByEntry.size).toBe(0);
    expect(r.truncated).toBe(false);
  });

  it("a read that fails on both projections is `ok: false` with `truncated: false` — UNKNOWN, not a capped list", async () => {
    const client = {
      from: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {};
        for (const m of ["select", "eq", "order"]) b[m] = () => b;
        b.range = async () => ({ data: null, error: { message: "boom" } });
        return b;
      },
    };
    const r = await readWorkerEntrySkillLinks(client, "w-1");
    expect(r).toEqual({ ok: false, rows: [], provenanceByEntry: new Map(), truncated: false });
  });
});
