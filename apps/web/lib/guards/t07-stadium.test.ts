import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TASK 07 slice 3 guard — STADIONAS honesty.
 *
 * The live project visualization may show ONLY real data or honest empty
 * states (handoff T07.3): real assignments on the field, real primary
 * professions as positions, a day pulse counted from RLS-readable journal
 * rows, F5 checklist roll-ups as document signals — and NO fake liveliness,
 * no decorative pulse pretending to be activity.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const lib = read("lib/projects/stadium.ts");
const page = read("app/[locale]/dashboard/projects/[id]/page.tsx");
const mapComp = read("components/app/arena/project-map.tsx");

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl"];

describe("stadium read service is real-data-only", () => {
  it("composes the manager-gated operations read (no second gate system)", () => {
    expect(lib).toMatch(/getProjectOperations/);
    expect(lib).toMatch(/if \(!ops\) return null;/);
  });
  it("positions come from real primary worker_professions rows", () => {
    expect(lib).toMatch(/worker_professions/);
    expect(lib).toMatch(/\.eq\("is_primary", true\)/);
  });
  it("today's pulse counts only live RLS-readable journal rows", () => {
    expect(lib).toMatch(/journal_entries/);
    expect(lib).toMatch(/\.is\("deleted_at", null\)/);
    expect(lib).toMatch(/\.gte\("created_at", dayStartIso\(\)\)/);
  });
  it("degrades to nulls/0 on error — never fabricates", () => {
    expect(lib).toMatch(/catch \{/);
    expect(lib).toMatch(/let entriesToday = 0;/);
  });
});

describe("the stadium page shows real states with honest emptiness", () => {
  it("is manager-gated and surfaces not-authorized honestly", () => {
    expect(page).toMatch(/MANAGER_ROLES/);
    expect(page).toMatch(/managerOnly/);
    expect(page).toMatch(/stadium-not-authorized/);
  });
  it("today pulse renders the count ONLY when entries really exist", () => {
    expect(page).toMatch(/entriesToday > 0 \?/);
    expect(page).toMatch(/todayZero/);
  });
  it("an empty team is an invitation to the draft, not fake players", () => {
    expect(page).toMatch(/stadium-empty-team/);
    expect(page).toMatch(/emptyTeamCta/);
  });
  it("unknown positions say so; the needs model honestly does not exist yet", () => {
    expect(page).toMatch(/positionUnknown/);
    expect(page).toMatch(/positionsEmpty/);
  });
  it("no decorative liveliness — every signal is a real count", () => {
    expect(page).not.toMatch(/live-dot|signal-dot|ticker|map-drift/);
  });
  it("integrates the real confirm pulse and links the management arena", () => {
    expect(page).toMatch(/<ConfirmPulse \/>/);
    expect(page).toMatch(/stadium-open-operations/);
  });
});

describe("the MAP opens the stadium and keeps the arena door", () => {
  it("card body links the stadium; the pinned operations link remains", () => {
    expect(mapComp).toMatch(/project-stadium-link/);
    expect(mapComp).toMatch(/project-operations-link/);
  });
});

describe("stadium copy exists in all 10 locales", () => {
  it("key set present everywhere", () => {
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      const s = j.projectOps?.stadium;
      for (const k of [
        "eyebrow", "fieldCount", "todayCount", "todayZero", "fieldTitle",
        "positionUnknown", "emptyTeam", "emptyTeamCta", "positionsTitle",
        "positionsEmpty", "openOps",
      ]) {
        expect(s?.[k], `${locale} stadium.${k}`).toBeTruthy();
      }
    }
  });
});
