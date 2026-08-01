import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Production UX Root-Cause Repair v2 — contract guards (F1–F16).
 *
 * The owner's production findings, pinned so they cannot regress:
 *   1. no internal/technical vocabulary in the primary user hierarchy;
 *   2. the public header always carries the theme toggle;
 *   3. planning + network stay in the primary module navigation;
 *   4. project routes stay role-aware (no dead "managers only" page for a
 *      valid assigned worker);
 *   5. the person page stays fail-closed and contact-free;
 *   6. a map click can never directly persist a location (explicit
 *      preview → Save/Cancel only);
 *   7. skill counts come from ONE population (claims ∪ catalogued skills);
 *   8. the notification empty state never carries placeholder/dev copy.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;
const messages = (loc: string): Record<string, unknown> =>
  JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;

/** Every string value in a namespace subtree. */
function stringsOf(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (!node || typeof node !== "object") return [];
  return Object.values(node as Record<string, unknown>).flatMap(stringsOf);
}

describe("F7/F16 — no internal/technical vocabulary in primary UI copy", () => {
  // Banned in the PRIMARY user hierarchy (LT forms; per-locale equivalents
  // are covered by translating from these keys, which no longer exist).
  it("the 'gyvi duomenys' data-provenance badge keys are gone", () => {
    // W3 Package 4 deleted the premium hub with the second dashboard — the
    // whole namespace, badges included, left every active locale.
    for (const loc of ACTIVE) {
      const hub = (messages(loc) as { premiumHub?: Record<string, unknown> })
        .premiumHub;
      expect(hub, `${loc}: premiumHub namespace removed`).toBeUndefined();
    }
  });

  it("readiness copy speaks human words, not 'signals'", () => {
    for (const loc of ["lt"] as const) {
      const pc = (messages(loc) as { playerCard?: Record<string, unknown> })
        .playerCard;
      const blob = stringsOf(pc).join(" ");
      expect(blob, `${loc}: no 'signal' vocabulary in playerCard`).not.toMatch(
        /signal/i,
      );
    }
  });

  it("no LT primary copy says 'tiesioginiai duomenys' or 'vietos rezervavimo'", () => {
    const blob = read("messages/lt.json");
    expect(blob).not.toMatch(/tiesioginiai duomenys/i);
    expect(blob).not.toMatch(/vietos rezervavimo/i);
  });
});

describe("F1 — public header theme toggle", () => {
  it("SiteNav mounts the icon theme toggle at every viewport", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/ThemeToggleIcon/);
    // Not gated behind a breakpoint-hidden class on the toggle itself.
    expect(nav).not.toMatch(/<ThemeToggleIcon[^/]*className="hidden/);
  });
  it("the toggle uses the shared storage contract (localStorage 'theme')", () => {
    const toggle = read("components/ui/theme-toggle-icon.tsx");
    expect(toggle).toMatch(/localStorage\.setItem\("theme"/);
    expect(toggle).toMatch(/dataset\.theme/);
    // The test id became a PROP when UX 2.0 reused this ONE toggle in the
    // conversation header as well (light is now the default, so the way back to
    // dark must be visible inside the app, not only on the public site). The
    // public header's id is the DEFAULT, so that surface is unchanged — assert
    // the default plus the wiring, not a literal attribute that moved.
    expect(toggle).toMatch(/testId\s*=\s*"public-theme-toggle"/);
    expect(toggle).toMatch(/data-testid=\{testId\}/);
  });
});

describe("F14/F15 — planning + network stay primary modules", () => {
  it("primary nav carries planning and network", () => {
    const ids = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id);
    expect(ids).toContain("planning");
    expect(ids).toContain("network");
  });
});

describe("F11 — role-aware project routing", () => {
  it("the worker access resolver exists and reads only RLS-scoped rows", () => {
    const src = read("lib/projects/worker-project-access.ts");
    expect(src).toMatch(/project_worker_assignments/);
    expect(src).toMatch(/getWorkerProjectView/);
    expect(src).toMatch(/listWorkerProjects/);
    // No service-role escape hatch.
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/);
  });
  it("the project detail page branches manager → worker → honest no-access", () => {
    const page = read("app/[locale]/dashboard/projects/[id]/page.tsx");
    expect(page).toMatch(/getWorkerProjectView/);
    expect(page).toMatch(/WorkerProjectPanel/);
    expect(page).toMatch(/stadium-not-authorized/);
  });
  it("the operations page redirects an assigned worker instead of dead-ending", () => {
    const page = read(
      "app/[locale]/dashboard/projects/[id]/operations/page.tsx",
    );
    expect(page).toMatch(/getWorkerProjectView/);
    expect(page).toMatch(/redirect\(`\/\$\{locale\}\/dashboard\/projects\/\$\{id\}`\)/);
  });
});

describe("F2 — person page stays fail-closed and contact-free", () => {
  const page = read("app/[locale]/dashboard/people/[workerId]/page.tsx");
  it("selects only non-contact worker fields", () => {
    // Match CODE, not doc comments (the header comment names the rule).
    const code = page
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
    expect(code).not.toMatch(/phone|email|address/i);
  });
  it("renders the honest restricted state when RLS returns nothing", () => {
    expect(page).toMatch(/person-restricted/);
    expect(page).toMatch(/maybeSingle/);
  });
  it("team rows and stadium cards link to the person page", () => {
    expect(read("components/app/company-workers-section.tsx")).toMatch(
      /\/dashboard\/people\/\$\{w\.workerId\}/,
    );
    expect(read("app/[locale]/dashboard/projects/[id]/page.tsx")).toMatch(
      /dashboard\/people\/\$\{w\.workerId\}/,
    );
  });
});

describe("F12 — map location changes require explicit confirmation", () => {
  const base = read("components/app/market-map-base.tsx");
  it("a map tap never persists directly — it stages a preview", () => {
    // pickFromMap must not call persist(); only savePreview does.
    const pick = base.slice(
      base.indexOf("const pickFromMap"),
      base.indexOf("const savePreview"),
    );
    expect(pick).not.toMatch(/persist\(/);
    expect(pick).toMatch(/setPreviewPoint/);
  });
  it("explicit Save / Cancel controls exist and Cancel keeps the old location", () => {
    expect(base).toMatch(/data-testid="map-preview-save"/);
    expect(base).toMatch(/data-testid="map-preview-cancel"/);
    const cancel = base.slice(
      base.indexOf("const cancelPreview"),
      base.indexOf("const changeRadius"),
    );
    expect(cancel).not.toMatch(/persist\(|writeSelectedLocation|clearSelectedLocation/);
  });
  it("with a saved location, taps are inert until edit mode", () => {
    expect(base).toMatch(/selected && !mapEditMode/);
    expect(base).toMatch(/data-testid="map-edit-mode-toggle"/);
  });
});

describe("RC3 — one skill-count source of truth", () => {
  it("the player card derives declared skills from the claims ∪ worker_skills union", () => {
    const src = read("lib/player-card/player-card.ts");
    expect(src).toMatch(/declaredSkillsUnionCount/);
    expect(src).toMatch(/profile_skill_claims/);
    expect(src).toMatch(/worker_skills/);
  });
  it("the card explains the two numbers in human words", () => {
    // W3 row 1: the hub person block (which carried this legend) is deleted.
    // The claim it protected — the two skill numbers are never shown without
    // saying what they mean — now belongs to the canonical card, which is the
    // only place they appear.
    // The canonical card carries its own plain-language explanation of the
    // evidence ladder: the journal-supported count is LABELLED and carries a
    // hint, so the two numbers are never shown bare.
    const cardSrc = read("components/app/worker-player-card.tsx");
    expect(cardSrc).toMatch(/journalSupportedLabel/);
    expect(cardSrc).toMatch(/journalSupportedHint/);
  });
});

describe("F12 privacy — no exact private worker coordinates in shared surfaces", () => {
  it("the person page selects no latitude/longitude", () => {
    const page = read("app/[locale]/dashboard/people/[workerId]/page.tsx");
    expect(page).not.toMatch(/latitude|longitude|\blat\b|\blng\b/);
  });
  it("company geography coords are company-entered only (migration comment contract)", () => {
    const mig = read("../../supabase/migrations/20260713120000_company_locations_v1.sql");
    // The comment wraps across lines — normalize whitespace before matching.
    expect(mig.replace(/\s*--\s*/g, " ").replace(/\s+/g, " ")).toMatch(
      /never stores private worker coordinates/i,
    );
    expect(mig).toMatch(/HUMAN GATE/);
  });
});

describe("F4 — notification empty state stays honest", () => {
  it("empty inbox renders one compact state, no placeholder chrome", () => {
    const panel = read("components/app/notification-panel.tsx");
    expect(panel).toMatch(/notification-empty-state/);
    expect(panel).not.toMatch(/showPlaceholderMarkers/);
    expect(panel).not.toMatch(/>Placeholder</);
  });
});
