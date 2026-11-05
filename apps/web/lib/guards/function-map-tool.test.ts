import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildModel,
  expandIds,
  generate,
  parseFunctions,
  parseJourneys,
  parseMapTable,
} from "../../../../.github/scripts/function-map.mjs";

/**
 * The function map (owner order 2026-11-05) is an OUTPUT of FUNCTION_REGISTER.md, not
 * a second source of truth: same register, same page, every status from the rows.
 */
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
    expect(empty.partial).toEqual({ links: true, data: true, blockers: true, stages: true, groups: true });
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
