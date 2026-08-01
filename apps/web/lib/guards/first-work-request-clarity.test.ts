import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the company "first work / team request" flow is clear + honest
 * (rewritten for W3 rows 7/8/25 — the light DemandDraftForm mount was
 * absorbed by the FULL demand wizard on /dashboard/company).
 *
 * An active_unverified company can still create a PRIVATE draft (the
 * wizard's save-draft leg, same canonical save_demand_draft action); the
 * surface never implies the draft was submitted / sent / matched /
 * reviewed, never claims available workers, auto-send, or paid features.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const PAGE = "app/[locale]/dashboard/company/page.tsx";
const WIZARD = "components/app/demand-request-button.tsx";
const DRAFTS_LIB = "lib/demand/demand-drafts.ts";
const NEXT = "components/app/company-next-actions.tsx";
const LOCALES = ["lt", "en"] as const;

describe("Guard: the company dashboard exposes the canonical demand intake", () => {
  const page = read(PAGE);

  it("renders the request section hosting the FULL wizard (one form, no light duplicate)", () => {
    expect(page).toContain('id="company-requests"');
    expect(page).toContain('data-testid="company-dashboard-first-action"');
    expect(page).toContain('id="demand-intake"');
    expect(page).toMatch(/<DemandRequestButton/);
    expect(page).not.toMatch(/DemandDraftForm/);
  });

  it("does NOT gate the request flow on a verified status", () => {
    // active_unverified must be enough — the page is role-gated only.
    expect(page).toMatch(/requireRoleOrRedirect\(\s*locale\s*,\s*["']company["']\)/);
    expect(page).not.toMatch(/===\s*["']verified["']/);
    expect(page).not.toMatch(/!==\s*["']verified["']/);
  });

  it("keeps the PR #254 demand CTA pointing at the request section", () => {
    const next = read(NEXT);
    expect(next).toContain('href={"#company-requests"');
  });
});

describe("Guard: the private draft capability survived inside the wizard", () => {
  const wizard = read(WIZARD);

  it("the wizard has a save-draft leg on the canonical action", () => {
    expect(wizard).toMatch(/saveDemandDraftAction\("company_request"/);
    expect(wizard).toContain('data-testid="demand-save-draft"');
    expect(wizard).toContain('data-testid="demand-draft-saved"');
  });

  it("the wizard auto-continues from the saved draft and closes it after submit", () => {
    expect(wizard).toMatch(/source !== "draft"/);
    expect(wizard).toMatch(/deleteDemandDraftAction\(/);
  });

  it("company_request drafts are closed/private visibility", () => {
    const lib = read(DRAFTS_LIB);
    expect(lib).toMatch(/visibility:\s*"closed"/);
  });
});

describe("Guard: draft-save copy is honest in LT + EN", () => {
  for (const loc of LOCALES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd = (loadJson(`messages/${loc}.json`) as any).structuredDemand;

    it(`${loc}: draft keys exist`, () => {
      expect(
        sd?.draftSaveButton && sd?.draftSaving && sd?.draftSavedPrivate && sd?.draftSaveError,
      ).toBeTruthy();
    });

    it(`${loc}: the saved state says PRIVATE and never claims submission`, () => {
      const priv = loc === "lt" ? /priva[čc]/i : /privat/i;
      expect(String(sd.draftSavedPrivate)).toMatch(priv);
      const fake =
        loc === "lt" ? /pateikt[ao]s\b|i[sš]si[uų]sta/i : /\bsubmitted\b|\bsent to\b/i;
      expect(String(sd.draftSavedPrivate)).not.toMatch(fake);
    });
  }
});
