import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildModel as buildUntypedModel,
  deriveState,
  expandIds,
  generate,
  parseFunctions,
  parseJourneys,
  parseMapTable,
  parseOpenItems,
} from "../../../../.github/scripts/function-map.mjs";

/**
 * The function map (owner order 2026-11-05) is an OUTPUT of FUNCTION_REGISTER.md, not
 * a second source of truth: same register, same page, every status from the rows.
 */
type MapFunction = { id: string; status: string; state: string | null; browser: string; browserLt: string };
type MapNeed = { slug: string; done: number; total: number; pct: number };
type MapModel = Omit<ReturnType<typeof buildUntypedModel>, "groups" | "needs"> & {
  groups: { functions: MapFunction[] }[];
  needs: MapNeed[];
};
const buildModel = (md: string, coordination?: string) => buildUntypedModel(md, coordination) as unknown as MapModel;

const REGISTER = readFileSync(join(process.cwd(), "..", "..", "docs", "program", "FUNCTION_REGISTER.md"), "utf8");

describe("the map is reproducible from the register", () => {
  it("the same register gives the same bytes, also with Windows line ends", () => {
    const page = generate(REGISTER);
    expect(generate(REGISTER)).toBe(page);
    expect(generate(REGISTER.replace(/\r?\n/g, "\r\n"))).toBe(page);
  });

  it("a changed status changes the page", () => {
    const row = parseFunctions(REGISTER.replace(/\r\n/g, "\n"))[0].functions[0];
    const line = new RegExp(`(\\|\\s*${row.id.replace(".", "\\.")}\\s*\\|[^|]*\\|\\s*)${row.status}`);
    const changed = REGISTER.replace(line, "$1FAIL");
    expect(changed).not.toBe(REGISTER);
    const before = buildModel(REGISTER).groups[0].functions[0].status;
    const after = buildModel(changed).groups[0].functions[0].status;
    expect(before).toBe(row.status);
    expect(after).toBe("FAIL");
  });

  it("every function of the register is on the page, once", () => {
    const model = buildModel(REGISTER);
    const ids = model.groups.flatMap((g) => g.functions.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    const inRegister = [...REGISTER.matchAll(/^\|\s*(\d+\.\d+)\s*\|[^|]*\|\s*(?:LIVE_VERIFIED|PASS_CI_ONLY|NOT_VERIFIED|BLOCKED|FAIL|NOT_IMPLEMENTED|OPTIONAL_TEST|DUPLICATE)\s*\|/gm)].map((m) => m[1]);
    expect(new Set(ids)).toEqual(new Set(inRegister));
  });

  it("the three measures follow the stated rule, from the rows alone", () => {
    const { counts, journeyTotals, journeys } = buildModel(REGISTER);
    const b = counts.by;
    expect(counts.total).toBe(b.LIVE_VERIFIED + b.PASS_CI_ONLY + b.NOT_VERIFIED + b.BLOCKED + b.FAIL + b.NOT_IMPLEMENTED);
    expect(counts.built).toBe(counts.total - b.NOT_IMPLEMENTED);
    expect(counts.verified).toBe(b.LIVE_VERIFIED);
    expect(journeyTotals.complete).toBe(journeys.filter((j) => j.state === "complete").length);
  });

  it("every journey step is a real function, and every journey has steps", () => {
    const model = buildModel(REGISTER);
    expect(model.unknownIds).toEqual([]);
    expect(model.journeys.length).toBeGreaterThan(0);
    for (const j of model.journeys) expect(j.steps.length, j.id).toBeGreaterThan(0);
  });

  it("carries no e-mail address and stays self-contained", () => {
    const page = generate(REGISTER);
    expect(page).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(page).not.toMatch(/<(?:script|link|img)[^>]+(?:src|href)=/i);
    expect(page).not.toMatch(/https?:\/\/[^"'\s]*\.(?:js|css)\b/);
    // The embedded data cannot close its own script tag.
    const data = page.slice(page.indexOf('id="data">'), page.indexOf("</script>"));
    expect(data).not.toContain("<");
  });
});

describe("what a partial catalogue shows", () => {
  it("today's map says what is derived instead of pretending", () => {
    const empty = buildModel("## A\n\n| ID | Function | Status | Last checked | Evidence | In production | Issue |\n|---|\n| 1.1 | Sign-up | FAIL | 2026-11-01 | run | no | broken |\n");
    expect(empty.partial).toEqual({ links: true, data: true, blockers: true, stages: true, groups: true, catalogue: true });
    expect(empty.stages[0].ids).toEqual(["1.1"]);
  });

  it("a filled `Map: links` table replaces the derived order", () => {
    const md = [
      "## A",
      "| ID | Function | Status | Last checked | Evidence | In production | Issue |",
      "|---|",
      "| 1.1 | Sign-up | LIVE_VERIFIED | 2026-11-01 | run | yes | |",
      "| 1.2 | Profile | LIVE_VERIFIED | 2026-11-01 | run | yes | |",
      "## Function map data",
      "### Map: links",
      "| From | To | Kind | Data |",
      "|---|---|---|---|",
      "| 1.1 | 1.2 | data | paskyra |",
    ].join("\n");
    const model = buildModel(md);
    expect(model.partial.links).toBe(false);
    expect(model.partial.data).toBe(false);
    expect(model.links).toEqual([{ from: "1.1", to: "1.2", kind: "data", data: "paskyra", journey: "" }]);
    expect(parseMapTable(md, "links")[0].Kind).toBe("data");
  });

  it("an id the register does not have is reported", () => {
    const md = [
      "## A",
      "| ID | Function | Status | Last checked | Evidence | In production | Issue |",
      "|---|",
      "| 1.1 | Sign-up | LIVE_VERIFIED | 2026-11-01 | run | yes | |",
      "### Map: links",
      "| From | To | Kind | Data |",
      "|---|---|---|---|",
      "| 1.1 | 9.9 | depends | |",
    ].join("\n");
    expect(buildModel(md).unknownIds).toEqual(["9.9"]);
  });
});

describe("the catalogue agreed with J-15", () => {
  const HEAD = "| ID | Function | Status | Last checked | Evidence | In production | Issue |\n|---|";
  const CAT = "### Map: functions\n| ID | Pavadinimas | Ką leidžia | Kam | Kur rasti | Poreikiai | Naršyklė | Kaina | Vykdytojas |\n|---|---|---|---|---|---|---|---|---|";

  it("state is derived from the row's status, never stored", () => {
    expect(deriveState("LIVE_VERIFIED")).toBe("veikianti");
    expect(deriveState("PASS_CI_ONLY")).toBe("testuojama");
    expect(deriveState("NOT_VERIFIED")).toBe("testuojama");
    expect(deriveState("BLOCKED")).toBe("užblokuota");
    expect(deriveState("FAIL")).toBe("užblokuota");
    expect(deriveState("NOT_IMPLEMENTED")).toBe("planuojama");
    expect(deriveState("NOT_IMPLEMENTED", true)).toBe("kuriama");
    expect(deriveState("DUPLICATE")).toBeNull();
    expect(deriveState("OPTIONAL_TEST")).toBeNull();
  });

  it("a need counts works AND seen in a browser; a missing value is not done", () => {
    const md = [
      "## A", HEAD,
      "| 1.1 | A | LIVE_VERIFIED | 2026-11-01 | r | yes | |",
      "| 1.2 | B | LIVE_VERIFIED | 2026-11-01 | r | yes | |",
      "| 1.3 | C | LIVE_VERIFIED | 2026-11-01 | r | yes | |",
      "| 1.4 | D | FAIL | 2026-11-01 | r | no | |",
      "| 1.5 | E | DUPLICATE | 2026-11-01 | r | no | |",
      "| 1.6 | F | LIVE_VERIFIED | 2026-11-01 | r | yes | |",
      CAT,
      "| 1.1 | A lt | | | | samdymas | eisena | | |",
      "| 1.2 | B lt | | | | samdymas, projektai | api | | |",
      "| 1.3 | C lt | | | | samdymas | | | |",
      "| 1.4 | D lt | | | | samdymas | eisena | | |",
      "| 1.5 | E lt | | | | samdymas | eisena | | |",
      "| 1.6 | F lt | | | | samdymas | savininkas | | |",
    ].join("\n");
    const need = buildModel(md).needs.find((n) => n.slug === "samdymas") as MapNeed;
    expect([need.done, need.total]).toEqual([2, 5]);
    expect(need.pct).toBe(40);
  });

  it("an empty browser value reads NOT VERIFIED, and `eisena` is not called a person", () => {
    const md = ["## A", HEAD, "| 1.1 | A | LIVE_VERIFIED | 2026-11-01 | r | yes | |", "| 1.2 | B | LIVE_VERIFIED | 2026-11-01 | r | yes | |", CAT, "| 1.1 | A | | | | | eisena | | |"].join("\n");
    const [a, b] = buildModel(md).groups[0].functions;
    expect(a.browserLt).toMatch(/Playwright Chromium, ne žmogus/);
    expect(b.browser).toBe("");
    expect(b.browserLt).toMatch(/NOT VERIFIED/);
  });

  it("`kuriama` needs a pull request named on an open item about the row", () => {
    const md = ["## A", HEAD, "| 1.1 | A | NOT_IMPLEMENTED | 2026-11-01 | r | no | |"].join("\n");
    expect(buildModel(md).groups[0].functions[0].state).toBe("planuojama");
    const coord = "### Open items\n| ID | Item | Rows |\n|---|---|---|\n| OI-1 | built in #3001 | 1.1 |";
    expect(parseOpenItems(coord)[0].ID).toBe("OI-1");
    expect(buildModel(md, coord).groups[0].functions[0].state).toBe("kuriama");
  });

  it("a catalogue id or need the register does not know is reported", () => {
    const md = ["## A", HEAD, "| 1.1 | A | FAIL | 2026-11-01 | r | no | |", CAT, "| 7.7 | X | | | | | | | |", "| 1.1 | A | | | | nera-tokio | | | |"].join("\n");
    const model = buildModel(md);
    expect(model.unknownIds).toEqual(["7.7"]);
    expect(model.unknownNeeds).toEqual(["nera-tokio"]);
  });
});

describe("reading the register's own tables", () => {
  it("expands a range and keeps a list", () => {
    expect(expandIds("6.1–6.3")).toEqual(["6.1", "6.2", "6.3"]);
    expect(expandIds("4.9, 5.7, 5.9")).toEqual(["4.9", "5.7", "5.9"]);
    expect(expandIds("11.1–11.7")).toHaveLength(7);
  });

  it("a triage table repeating a row id is not a second function", () => {
    const md = [
      "## A",
      "| ID | Function | Status | Last checked | Evidence | In production | Issue |",
      "|---|",
      "| 1.8 | Org | BLOCKED | 2026-11-01 | run | no | |",
      "### Every row",
      "| ID | Function / check | Status | Class | Reason | Evidence | Executor |",
      "|---|",
      "| 1.8 | Org | BLOCKED | `OWNER_GATED` | decision | row | owner |",
    ].join("\n");
    expect(parseFunctions(md).flatMap((g: { functions: unknown[] }) => g.functions)).toHaveLength(1);
  });

  it("takes a journey's functions from its last brackets", () => {
    const [j] = parseJourneys("| J-11 | Goods (or a service) listed → found (6.1–6.3) | complete | walk |");
    expect(j.functions).toEqual(["6.1", "6.2", "6.3"]);
  });
});
