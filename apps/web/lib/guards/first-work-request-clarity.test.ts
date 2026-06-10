import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the company "first work / team request" draft flow is clear + honest.
 * An active_unverified company can create a PRIVATE draft; the surface never
 * implies the draft was submitted / sent / matched / reviewed, never claims
 * available workers, auto-send, or paid features.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const PAGE = "app/[locale]/dashboard/company/page.tsx";
const FORM = "components/app/demand-draft-form.tsx";
const NEXT = "components/app/company-next-actions.tsx";
const DRAFTS_LIB = "lib/demand/demand-drafts.ts";
const LOCALES = ["lt", "en"] as const;

// Fake-claim / wrong-state tokens that must NOT appear in the request copy.
const FORBIDDEN =
  /\bmatch(?:ed|ing)?\b|available worker|\bauto-?send\b|\bsubmitted\b|\bpaid\b|\bbilling\b|atitik|i[sš]si[uų]st|pateikt|automati[sš]kai|apmokam/i;

describe("Guard: the company dashboard exposes the private request draft", () => {
  const page = read(PAGE);

  it("renders the request section + DemandDraftForm(company_request)", () => {
    expect(page).toContain('id="company-requests"');
    expect(page).toContain('data-testid="company-dashboard-first-action"');
    expect(page).toMatch(/<DemandDraftForm[\s\S]{0,120}draftType="company_request"/);
  });

  it("shows a reload-safe empty OR saved-private state", () => {
    expect(page).toContain("company-request-empty-state");
    expect(page).toContain("company-request-saved-state");
    expect(page).toMatch(/existingDraft\s*\?\s*\(/);
    expect(page).toMatch(/firstAction\.savedState/);
    expect(page).toMatch(/firstAction\.emptyState/);
  });

  it("does NOT gate the request flow on a verified status", () => {
    // active_unverified must be enough — the page is role-gated only.
    expect(page).toMatch(/requireRoleOrRedirect\(\s*locale\s*,\s*["']company["']\)/);
    expect(page).not.toMatch(/===\s*["']verified["']/);
    expect(page).not.toMatch(/!==\s*["']verified["']/);
  });

  it("keeps the PR #254 next-action card pointing at the request section", () => {
    const next = read(NEXT);
    expect(next).toContain('href: "#company-requests"');
  });
});

describe("Guard: the draft is private + the form is honest", () => {
  it("company_request drafts are closed/private visibility", () => {
    const lib = read(DRAFTS_LIB);
    expect(lib).toMatch(/visibility:\s*"closed"/);
  });

  it("the form makes no matching / sent / verified claim", () => {
    const src = read(FORM).replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/\bmatch(?:ed|ing)?\b|\bverified\b|\bsent to\b/i);
    // The honest private-save signal exists.
    expect(read(FORM)).toContain("savedPrivate");
  });
});

describe("Guard: request copy is honest in LT + EN", () => {
  for (const loc of LOCALES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fa = ((loadJson(`messages/${loc}.json`).roleDashboards as any)?.company?.firstAction) as any;

    it(`${loc}: firstAction has title/body/emptyState/savedState`, () => {
      expect(fa?.title && fa?.body && fa?.emptyState && fa?.savedState).toBeTruthy();
    });

    it(`${loc}: no fake matching / available-worker / auto-send / submitted / paid`, () => {
      const blob = `${fa.title} ${fa.body} ${fa.emptyState} ${fa.savedState}`;
      expect(blob).not.toMatch(FORBIDDEN);
    });

    it(`${loc}: empty + saved states state the draft is PRIVATE`, () => {
      const priv = loc === "lt" ? /privat|tik j[uū]s/i : /private|only you/i;
      expect(String(fa.emptyState)).toMatch(priv);
      expect(String(fa.savedState)).toMatch(priv);
    });
  }
});
