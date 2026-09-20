import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildRosterCommitmentsView } from "./roster-commitments-model";
import { activeLocales } from "@/lib/i18n/config";

const WEB = join(__dirname, "..", "..");

describe("buildRosterCommitmentsView — per person, per date, nothing inferred", () => {
  const people = [
    { workerId: "w1", name: "Petras" },
    { workerId: "w2", name: null },
    { workerId: "w3", name: "Ona" },
  ];

  it("groups dated commitments per person, earliest first; open-ended sorts by start", () => {
    const v = buildRosterCommitmentsView(people, {
      status: "ok",
      commitments: [
        { workerId: "w1", kind: "booking", sourceId: "b1", label: null, startDate: "2026-10-05", endDate: "2026-10-09" },
        { workerId: "w1", kind: "project", sourceId: "p1", label: "Kaunas site", startDate: "2026-09-22", endDate: null },
        { workerId: "w3", kind: "trip", sourceId: "t1", label: "Oslo", startDate: "2026-09-20", endDate: "2026-09-21" },
      ],
      undatedProjects: [],
    });
    expect(v.status).toBe("ok");
    if (v.status !== "ok") return;
    expect(v.rows.map((r) => r.workerId)).toEqual(["w3", "w1"]);
    expect(v.rows[1].commitments.map((c) => c.sourceId)).toEqual(["p1", "b1"]);
    expect(v.rows[1].commitments[0].endDate).toBeNull(); // open-ended stays null, never invented
    expect(v.withoutCommitment).toBe(1); // w2 — nothing on record, NOT "free"
  });

  it("an undated assignment keeps the person on the list, named as undated, sorted last", () => {
    const v = buildRosterCommitmentsView(people, {
      status: "ok",
      commitments: [
        { workerId: "w3", kind: "project", sourceId: "p2", label: null, startDate: "2026-11-01", endDate: "2026-11-30" },
      ],
      undatedProjects: [{ workerId: "w2", projectId: "p9", label: "Vilnius" }],
    });
    if (v.status !== "ok") throw new Error("expected ok");
    expect(v.rows.map((r) => r.workerId)).toEqual(["w3", "w2"]);
    expect(v.rows[1].commitments).toEqual([]);
    expect(v.rows[1].undatedProjects).toEqual([{ projectId: "p9", label: "Vilnius" }]);
    expect(v.withoutCommitment).toBe(1);
  });

  it("a failed or unprovisioned read is passed through — never an empty roster that looks free", () => {
    expect(buildRosterCommitmentsView(people, { status: "unavailable" })).toEqual({ status: "unavailable" });
    expect(buildRosterCommitmentsView(people, { status: "needs-migration" })).toEqual({ status: "needs-migration" });
  });

  it("an empty roster is ok with nothing to say", () => {
    expect(buildRosterCommitmentsView([], { status: "ok", commitments: [], undatedProjects: [] })).toEqual({
      status: "ok",
      rows: [],
      withoutCommitment: 0,
    });
  });
});

describe("the surface: rendered on company planning, labelled in every routed locale", () => {
  it("company planning renders the section in both layouts, after the utilisation ratio", () => {
    const page = readFileSync(join(WEB, "app", "[locale]", "dashboard", "company", "planning", "page.tsx"), "utf8");
    expect(page).toContain('data-testid="roster-commitments"');
    expect(page).toContain('data-testid="roster-commitments-unavailable"');
    expect((page.match(/\{utilisationSection\}\s*\n\s*\{commitmentsSection\}/g) ?? []).length).toBe(2);
    // The read is the existing authorized commitment read — no new table.
    const read = readFileSync(join(WEB, "lib", "planning", "roster-commitments.ts"), "utf8");
    expect(read).toContain("getEmployerWorkerCommitments(ids, { supabase })");
    expect(read).not.toMatch(/\.from\("(?!workers")/);
  });

  for (const loc of activeLocales) {
    it(`${loc}: workforcePlanning.committedWhere carries every key`, () => {
      const m = JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")) as {
        workforcePlanning: { committedWhere: Record<string, unknown> & { kind: Record<string, string> } };
      };
      const c = m.workforcePlanning.committedWhere;
      for (const k of ["title", "intro", "untitled", "openEnded", "noDates", "undated", "withoutCommitment", "unavailable"]) {
        expect(typeof c[k], `${loc}.${k}`).toBe("string");
      }
      for (const k of ["project", "booking", "trip"]) expect(typeof c.kind[k], `${loc}.kind.${k}`).toBe("string");
      // The "nothing on record" line must never say "free" as a fact.
      expect(String(c.withoutCommitment).toLowerCase()).toMatch(/not the same as free|nereiškia, kad laisvas|не значит «свободен»|niet hetzelfde als vrij|nicht dasselbe wie frei/);
    });
  }
});

describe("agency bridge: the client's accept / decline are 44 px targets", () => {
  it("no 32 px control remains on the pending-invite row", () => {
    const src = readFileSync(join(WEB, "components", "app", "client-agency-bridge-section.tsx"), "utf8");
    expect(src).not.toMatch(/inline-flex h-8 /);
    expect(src).toMatch(/data-testid=\{`client-bridge-accept-\$\{c\.id\}`\}[\s\S]{0,200}min-h-11/);
    expect(src).toMatch(/min-h-11 min-w-11 items-center justify-center/);
  });
});
