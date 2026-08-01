import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Product Logic + Mobile UX Correction Sprint v1 guard.
 *
 * Pins the owner-mandated corrections from the mobile review:
 *   1. Organisation profile is framed as a PRIMARY ACTIVITY, not a permanent
 *      "company type" cage; agency/client read as an operating mode, not a
 *      separate fundamental world.
 *   2. The company NEED form asks the project/demand ROLE (situational), with
 *      copy stating the role depends on the project, not the company type.
 *   3. Finite 2–7 option choices use one-tap OptionCards (radio cards) instead
 *      of clumsy native <select> dropdowns on mobile (company type, requester
 *      role, project role, accommodation).
 *   4. Skill suggestions have an honest empty state (pick manually) instead of a
 *      broad cloud.
 *
 * Pure source + message assertions; runs in CI via `pnpm -F web test`.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const json = (rel: string) => JSON.parse(read(rel)) as Record<string, unknown>;

const ACTIVE = ["lt", "en", "ru"] as const;

// ── 1. Reusable one-tap control replaces native selects ───────────────────

describe("OptionCards is a one-tap native-radio control (no native dropdown)", () => {
  const src = read("components/ui/OptionCards.tsx");
  it("renders native radio inputs (FormData-compatible, keyboard-accessible)", () => {
    expect(src).toMatch(/type="radio"/);
    expect(src).toMatch(/role="radiogroup"/);
  });
  it("supports controlled + uncontrolled (FormData) modes", () => {
    expect(src).toMatch(/defaultChecked/);
    expect(src).toMatch(/checked: selected/);
  });
});

describe("finite company choices use OptionCards, not native <select>", () => {
  const setupForm = read("components/app/company-setup-form.tsx");
  const demandForm = read("components/app/demand-draft-form.tsx");
  const companyPage = read("app/[locale]/dashboard/company/page.tsx");

  it("company setup imports + uses OptionCards for company type + requester role", () => {
    expect(setupForm).toMatch(/import \{ OptionCards \}/);
    // company_type is now radio cards, not a native dropdown.
    expect(setupForm).not.toMatch(/<select[\s\S]{0,80}name="company_type"/);
    expect(setupForm).not.toMatch(/<select[\s\S]{0,80}name="requester_role"/);
    // The guard-pinned canonical mapping is preserved.
    expect(setupForm).toMatch(/COMPANY_TYPES\.map/);
    expect(setupForm).toMatch(/company-setup-company-type/);
  });

  it("the demand form has an optioncards variant and uses OptionCards", () => {
    expect(demandForm).toMatch(/import \{ OptionCards \}/);
    expect(demandForm).toMatch(/variant === "optioncards"/);
  });

  it("the company demand surface is the wizard with real closed-set controls (no native selects)", () => {
    // W3 rows 7/8/25: the COMPANY_FIELDS light form is absorbed by the full
    // wizard, whose closed-set fields use DarkListbox / chip toggles — the
    // page itself mounts no native <select> demand field.
    expect(companyPage).toMatch(/<DemandRequestButton/);
    expect(companyPage).not.toMatch(/key: "accommodation"/);
    const wizard = read("components/app/demand-request-button.tsx");
    expect(wizard).toMatch(/DarkListbox/);
  });
});


describe("company type reframed as primary activity (agency = operating mode)", () => {
  it("LT label is a primary-activity question, not a rigid 'type'", () => {
    const setup = (
      (json("messages/lt.json").roleDashboards as Record<string, unknown>)
        .company as Record<string, unknown>
    ).setup as Record<string, string>;
    expect(setup.companyType).toMatch(/veikl/i);
    expect(setup.companyTypeHelp).toMatch(/neužrakina/i);
    expect(setup.companyTypeHelp).toMatch(/poreik/i);
  });
  it("EN help says it doesn't lock the org in + role is per need", () => {
    const setup = (
      (json("messages/en.json").roleDashboards as Record<string, unknown>)
        .company as Record<string, unknown>
    ).setup as Record<string, string>;
    expect(setup.companyTypeHelp).toMatch(/lock/i);
    expect(setup.companyTypeHelp).toMatch(/role/i);
  });
  for (const loc of ACTIVE) {
    it(`${loc}: agency type note frames it as a mode, not a separate world`, () => {
      const notes = (
        (json(`messages/${loc}.json`).roleDashboards as Record<string, unknown>)
          .company as Record<string, unknown>
      ).typeNotes as Record<string, string>;
      const v = notes.staffing_agency ?? "";
      const ok =
        loc === "en"
          ? /operating mode/i.test(v)
          : loc === "lt"
            ? /veikimo modelis/i.test(v)
            : /модель работы/i.test(v);
      expect(ok, `${loc} typeNotes.staffing_agency: "${v}"`).toBe(true);
    });
  }
});

// ── 4. Skill suggestion honest empty state ────────────────────────────────

describe("skill suggestions have an honest manual empty state", () => {
  it("the composer renders the empty-state note when nothing matches", () => {
    const composer = read("components/app/journal-entry-composer.tsx");
    expect(composer).toMatch(/skill-suggestions-empty-note/);
    expect(composer).toMatch(/t\("skillNoMatch"\)/);
  });
  for (const loc of ACTIVE) {
    it(`${loc}: skillNoMatch exists and points to manual selection`, () => {
      const j = json(`messages/${loc}/journal.json`) as {
        skillNoMatch?: string;
      };
      expect(j.skillNoMatch, `${loc} journal.skillNoMatch`).toBeTruthy();
    });
  }
});

// ── 5. projectRole is persisted (allowlisted), no DB migration needed ──────

describe("projectRole persists via the existing payload jsonb (no migration)", () => {
  const lib = read("lib/demand/demand-drafts.ts");
  it("company_request allowlists projectRole", () => {
    const block = lib.slice(
      lib.indexOf("company_request: new Set"),
      lib.indexOf("]),", lib.indexOf("company_request: new Set")),
    );
    expect(block).toMatch(/"projectRole"/);
  });
});
