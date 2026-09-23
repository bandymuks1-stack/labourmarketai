import { describe, expect, it } from "vitest";

import { MemoryEvidenceDb } from "../../testing/memory-store";
import { ALL_FIXTURE_IDS, CUSTOMER, FIXTURE_UUID_PREFIX, ORG, ROSTER } from "./actors";
import { ALL_FILES, S4_AGENT_ROW } from "./sources";

/**
 * FIXTURE v3 §6 — HYGIENE, and the Layer X seat.
 *
 * The repository is PUBLIC. Everything the synthetic fixture names must be
 * synthetic by construction, and this file proves it on every run:
 *
 *   · every id is an RFC-4122 v4 UUID under the fixture prefix — including
 *     the ids the in-memory store mints, which travel into `z.uuid()`
 *     schemas exactly as production ids do (see
 *     lib/guards/fixture-uuid-validity.test.ts for why that matters);
 *   · organizations, people, customers and places carry only the synthetic
 *     tokens the spec allows, plus the NATO alphabet;
 *   · registration codes sit in the reserved 9990000xx range;
 *   · no e-mail address and no production identifier appears in any source.
 *
 * Layer X (the per-viewer counts over `contracts.seed.sql`) lands with the
 * Layer D contracts in PR-3; it is a `todo` here so the seat is visible.
 *
 * Spec: docs/design/historical-timesheet-fixture-v3.md §6.
 */

/** RFC-4122 v4: version nibble 4, variant nibble 8/9/a/b. */
const RFC_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SYNTHETIC_TOKENS = /\b(Fixture|Fixtura|Fixturos|Fixtuur|Gama|FIXTURA)\b/;
const NATO =
  /\b(Alpha|Bravo|Charlie|Delta|Echo|Foxtrot|Golf|Hotel|India|Juliett|Kilo|Lima|Mike|November|Oscar|Papa|Quebec|Romeo|Sierra|Tango|Uniform|Victor|Whiskey|Xray|Yankee|Zulu)\b/;

describe("every fixture id is an RFC-4122 v4 UUID under the fixture prefix", () => {
  it("the declared actors, roster and foreign entities", () => {
    expect(ALL_FIXTURE_IDS.length).toBeGreaterThan(10);
    for (const id of ALL_FIXTURE_IDS) {
      expect(id, id).toMatch(RFC_V4);
      expect(id.startsWith(FIXTURE_UUID_PREFIX), id).toBe(true);
    }
    expect(new Set(ALL_FIXTURE_IDS).size).toBe(ALL_FIXTURE_IDS.length);
  });

  it("the ids the in-memory store mints — they cross the same z.uuid() boundaries as production ids", () => {
    const db = new MemoryEvidenceDb();
    const minted = Array.from({ length: 300 }, () => db.nextId());
    for (const id of minted) {
      expect(id, id).toMatch(RFC_V4);
      expect(id.startsWith(FIXTURE_UUID_PREFIX), id).toBe(true);
    }
    expect(new Set(minted).size).toBe(minted.length);
    // The minted range never collides with a declared id.
    for (const id of ALL_FIXTURE_IDS) expect(minted).not.toContain(id);
  });
});

describe("every name is synthetic by construction (the repository is public)", () => {
  it("organizations and customers carry a synthetic token", () => {
    for (const org of Object.values(ORG)) expect(org.name, org.name).toMatch(SYNTHETIC_TOKENS);
    for (const c of Object.values(CUSTOMER)) expect(c.name, c.name).toMatch(SYNTHETIC_TOKENS);
  });

  it("people are NATO-alphabet names", () => {
    for (const p of Object.values(ROSTER)) expect(p.display_name, p.display_name).toMatch(NATO);
    expect(S4_AGENT_ROW.personLabel).toMatch(NATO);
  });

  it("every source line names only synthetic customers, NATO people, reserved codes and no e-mail", () => {
    for (const file of ALL_FILES) {
      expect(file.filename).toMatch(/^fx-/);
      const lines = file.text.split("\n").filter((l) => l.trim() !== "");
      const [header, ...rows] = lines;
      expect(header).toMatch(/;/);
      for (const row of rows) {
        expect(row, `${file.filename}: ${row}`).not.toContain("@");
        // The person cell is the first NATO word of the line; the customer,
        // when stated, carries a synthetic token.
        expect(row, `${file.filename}: ${row}`).toMatch(NATO);
        for (const code of row.match(/\b\d{9}\b/g) ?? []) {
          expect(code, `${file.filename}: ${code}`).toMatch(/^9990000\d\d$/);
        }
        const customerCells = row.split(";").filter((c) => /UAB|B\.V\.|BV\b/.test(c));
        for (const c of customerCells) expect(c, `${file.filename}: ${c}`).toMatch(SYNTHETIC_TOKENS);
      }
    }
  });

  it("no source carries a production identifier: every UUID-shaped string is a fixture id", () => {
    for (const file of ALL_FILES) {
      for (const m of file.text.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)) {
        expect(m[0].toLowerCase().startsWith(FIXTURE_UUID_PREFIX)).toBe(true);
      }
    }
  });
});

describe("Layer X — per-viewer counts over the generated seed", () => {
  it.todo("[PR-3] contracts.seed.sql is generated from the Layer P end state and contracts.sql asserts expected.viewerCounts per actor");
  it.todo("[PR-3] contracts.sql ends in RAISE and leaves zero rows (count before = count after)");
});
