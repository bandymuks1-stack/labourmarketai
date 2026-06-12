import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TASK 07 slice 2 guard — manager MAP → ARENA → DRAFT honesty.
 *
 * The living-arena skin must stay the skin of REAL data (DESIGN_SOUL §1):
 * the confirm pulse counts only the gated reviewable set, the map counts only
 * real active assignments, the draft pick stays a human decision with no
 * ranking, and the manager gates stay exactly where F4 put them.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
/** Source with comments stripped — honesty rules target CODE, not docs. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const mapLib = read("lib/projects/map.ts");
const mapComp = read("components/app/arena/project-map.tsx");
const pulse = read("components/app/arena/confirm-pulse.tsx");
const projectsPage = read("app/[locale]/dashboard/projects/page.tsx");
const opsPage = read("app/[locale]/dashboard/projects/[id]/operations/page.tsx");

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];

describe("MAP counts only real rows", () => {
  it("team size comes from active project_worker_assignments (RLS-scoped)", () => {
    expect(mapLib).toMatch(/project_worker_assignments/);
    expect(mapLib).toMatch(/\.eq\("status", "active"\)/);
  });
  it("degrades to zero counts on error — never fabricates", () => {
    expect(mapLib).toMatch(/catch \{/);
    expect(mapLib).toMatch(/counts\.get\(p\.id\) \?\? 0/);
  });
  it("map cards keep the pinned operations link and add NO score/rank", () => {
    expect(mapComp).toMatch(/project-operations-link/);
    expect(code(mapComp)).not.toMatch(/score|rank|rating|top\s*\d/i);
  });
});

describe("ARENA confirm pulse is the real S3.5 gated queue", () => {
  it("count comes from countReviewablePendingEntries (0034 RPC wrapper)", () => {
    expect(pulse).toMatch(/countReviewablePendingEntries/);
  });
  it("renders an honest zero state and links the real quick-confirm route", () => {
    expect(pulse).toMatch(/pending > 0 \?/);
    expect(pulse).toMatch(/\/dashboard\/inbox\/quick/);
    expect(pulse).toMatch(/t\("zero"\)/);
  });
  it("is mounted on BOTH the map (projects) and the arena (operations)", () => {
    expect(projectsPage).toMatch(/<ConfirmPulse \/>/);
    expect(opsPage).toMatch(/<ConfirmPulse \/>/);
  });
});

describe("DRAFT stays a gated human decision", () => {
  it("the projects page keeps the manager gate + the draft manager mount", () => {
    expect(projectsPage).toMatch(/MANAGER_ROLES/);
    expect(projectsPage).toMatch(/managerOnly/);
    expect(projectsPage).toMatch(/<ProjectAssignmentManager\b/);
  });
  it("the draft component advertises no ranking and no auto-pick", () => {
    const comp = code(read("components/app/project-assignment-manager.tsx"));
    expect(comp).not.toMatch(/auto-?pick|auto-?assign|ranking|best match/i);
  });
});

describe("arena copy exists in all 10 locales and stays honest", () => {
  it("map/pulse/draft keys present everywhere", () => {
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      expect(j.projects?.map?.title, `${locale} map.title`).toBeTruthy();
      expect(j.projects?.pulse?.pendingTitle, `${locale} pulse.pendingTitle`).toBeTruthy();
      expect(j.projects?.pulse?.zero, `${locale} pulse.zero`).toBeTruthy();
      expect(j.projects?.draft?.title, `${locale} draft.title`).toBeTruthy();
    }
  });
  it("LT/EN pulse copy claims confirmation only as the manager's own act", () => {
    const lt = JSON.parse(read("messages/lt.json"));
    const en = JSON.parse(read("messages/en.json"));
    const blob = JSON.stringify(lt.projects.pulse) + JSON.stringify(en.projects.pulse);
    // NOTE: no `\bAI\b` here — JS \b is ASCII-only and LT words like
    // "įrašai" end in a false "ai" boundary after the non-ASCII "š".
    expect(blob).not.toMatch(/automat|dirbtin|artificial intelligence/i);
  });
});
