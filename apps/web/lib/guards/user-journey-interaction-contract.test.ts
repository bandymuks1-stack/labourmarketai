import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Interaction-contract guard (user-journey root-cause repair v1).
 *
 * Root causes pinned:
 *   RC1 — stat/operation cards that LOOK tappable must BE tappable
 *         (full-surface control, keyboard, focus ring, pressed state) and a
 *         zero value must land on an explained empty state, never a dead tile;
 *   RC2 — a warning ("Jūsų informacija dar nepilna") may only look actionable
 *         if it IS actionable: exact missing items, each deep-linking to the
 *         precise section that fixes it;
 *   RC3 — presentational cards must NOT advertise interactivity (no hover
 *         elevation without a link/handler).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const board = read("components/app/project-operations-board.tsx");
const opsPage = read("app/[locale]/dashboard/projects/[id]/operations/page.tsx");
const myZone = read("components/app/my-zone.tsx");
const dashboard = read("app/[locale]/dashboard/page.tsx");
const profilePage = read("app/[locale]/dashboard/profile/page.tsx");
const journalPage = read("app/[locale]/dashboard/journal/page.tsx");

describe("RC1 — operation counter cards are real controls", () => {
  it("Counter renders as a button (filter) or link (navigation), never a bare div", () => {
    const counter = board.slice(board.indexOf("function Counter"), board.indexOf("function StatusEditor"));
    expect(counter).toMatch(/<button[\s\S]*?type="button"/);
    expect(counter).toMatch(/<Link href=\{href\}/);
    expect(counter).toMatch(/aria-pressed=\{active === true\}/);
    expect(counter).toMatch(/focus-visible:ring-2/);
    expect(counter).toMatch(/aria-label=\{accessibleName\}/);
  });
  it("every counter card activates its matching worker filter (or navigates)", () => {
    for (const key of ["all", "ready", "needsSkillInfo", "needsEvidence", "followUp", "missingDocs", "docsChecked"]) {
      expect(board, `counter → ${key}`).toContain(`applyCounterFilter("${key}")`);
    }
    // Instructions counter navigates to the instructions page.
    expect(board).toMatch(/href=\{`\/\$\{locale\}\/dashboard\/instructions`\}/);
  });
  it("activation scrolls the worker list into view (mobile: result must be visible)", () => {
    expect(board).toMatch(/getElementById\("ops-workers-section"\)/);
    expect(board).toMatch(/id="ops-workers-section"/);
  });
  it("zero-result filters land on an explained empty state with a show-all recovery", () => {
    expect(board).toMatch(/ops-filter-none-hint/);
    expect(board).toMatch(/ops-filter-show-all/);
    expect(board).toMatch(/labels\.filters\.empty\[filter\]/);
  });
  it("the no-workers empty state offers the real next step (assign)", () => {
    expect(board).toMatch(/ops-no-workers-assign/);
  });
  it("the filter model covers the evidence and docs-checked cards", () => {
    expect(board).toMatch(/"needsEvidence"/);
    expect(board).toMatch(/w\.missing\.includes\("work_evidence"\)/);
    expect(board).toMatch(/w\.docsChecked > 0/);
  });
  it("the page wires the new filter labels + per-filter empty copy", () => {
    for (const k of ["needsEvidence", "docsChecked", "showAll"]) {
      expect(opsPage, `filters.${k}`).toContain(`filters.${k}`);
    }
    expect(opsPage).toMatch(/filters\.empty\.missingDocs/);
    expect(opsPage).toMatch(/counters\.openHint/);
  });
});

describe("RC2 — incomplete-profile warning is an actionable checklist", () => {
  it("MyZone renders the exact missing items as real links (when incomplete)", () => {
    expect(myZone).toMatch(/my-zone-missing/);
    expect(myZone).toMatch(/my-zone-missing-\$\{m\.key\}/);
    expect(myZone).toMatch(/missing\.\$\{m\.key\}\.title/);
    // Full-surface, mobile-safe, focusable link.
    expect(myZone).toMatch(/min-h-11[\s\S]{0,200}focus-visible:ring-2/);
  });
  it("the dashboard passes precise deep links for each real missing item", () => {
    expect(dashboard).toMatch(/missingItems=\{\[/);
    expect(dashboard).toContain("/dashboard/profile#profile-edit");
    expect(dashboard).toContain("/dashboard/journal#journal-composer");
    // Item presence is driven by REAL data, never hard-coded.
    expect(dashboard).toMatch(/!professionName\s*\?/);
    expect(dashboard).toMatch(/entriesCount === 0\s*\?/);
  });
  it("both deep-link anchors exist on their target pages", () => {
    expect(profilePage).toMatch(/id="profile-edit"/);
    expect(journalPage).toMatch(/id="journal-composer"/);
  });
  it("the ready state stays a plain informational chip (no fake action)", () => {
    expect(myZone).toMatch(/variant="success"/);
  });
});

describe("RC3 — presentational cards do not impersonate buttons", () => {
  for (const rel of ["components/visual/worker-card.tsx", "components/visual/job-demand-card.tsx"]) {
    it(`${rel} has no hover elevation without an action`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/hover:shadow/);
      expect(src).not.toMatch(/cursor-pointer/);
    });
  }
});

describe("locale copy for the new interaction states (LT/EN)", () => {
  for (const loc of ["lt", "en"] as const) {
    it(`${loc}: projectOps filter/empty + myZone missing keys exist`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        projectOps: {
          counters: Record<string, string>;
          filters: { needsEvidence: string; docsChecked: string; showAll: string; empty: Record<string, string> };
        };
        auth: { dashboard: { myZone: { missing: { progress: string; profession: Record<string, string>; firstEntry: Record<string, string> } } } };
      };
      expect(msgs.projectOps.counters.openHint?.trim().length).toBeGreaterThan(0);
      for (const k of ["needsEvidence", "docsChecked", "showAll"] as const) {
        expect(msgs.projectOps.filters[k]?.trim().length, `filters.${k}`).toBeGreaterThan(0);
      }
      for (const k of ["missingDocs", "ready", "needsSkillInfo", "needsEvidence", "docsChecked", "followUp"]) {
        expect(msgs.projectOps.filters.empty[k]?.trim().length, `filters.empty.${k}`).toBeGreaterThan(0);
      }
      const missing = msgs.auth.dashboard.myZone.missing;
      expect(missing.progress?.trim().length).toBeGreaterThan(0);
      for (const item of [missing.profession, missing.firstEntry]) {
        expect(item.title?.trim().length).toBeGreaterThan(0);
        expect(item.hint?.trim().length).toBeGreaterThan(0);
      }
    });
  }
});
