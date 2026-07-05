import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the visible identity / action workspace (v1) exists and renders the
 * real model — TWO legal identities (person + company), each with concrete
 * actions, and an honest "create a company" path when none exists. Copy must
 * be present in every active locale. No silo identities.
 */
const APP_ROOT = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}
function str(root: Record<string, unknown>, path: string): string {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

describe("identity/action workspace component", () => {
  const comp = read("components/app/identity-actions.tsx");
  const account = read("app/[locale]/dashboard/account/page.tsx");

  it("renders both identities (person + the one company channel)", () => {
    expect(comp).toMatch(/data-testid="identity-person"/);
    expect(comp).toMatch(/data-testid="identity-company"/);
  });
  it("offers an honest create-company path when none exists", () => {
    expect(comp).toMatch(/data-testid="identity-company-create"/);
    expect(comp).toMatch(/\/dashboard\/start\/company/);
  });
  it("is NOT mounted on the account page (account = settings only)", () => {
    // Marketplace IA: account is settings-only; the identity/action workspace
    // lives on the dashboard overview, not on account.
    expect(account).not.toMatch(/<IdentityActions/);
  });

  it("is surfaced on the main dashboard (compact, focused entry)", () => {
    const dashboard = read("app/[locale]/dashboard/page.tsx");
    // Owner smoke #3 (2026-07-05): the entry now also carries the ACTIVE
    // company name so the card is never a generic "Jūsų įmonė".
    expect(dashboard).toMatch(
      /<IdentityActions\s+hasCompany=\{hasCompany\}\s+companyName=\{companyName\}\s+compact/,
    );
    expect(dashboard).toMatch(/getOwnCompany\(\)/);
  });
});

describe("identity/action copy present in every active locale", () => {
  const PERSON_ACTIONS = ["profile", "findWork", "readiness"];
  const COMPANY_ACTIONS = ["need", "hire", "buy", "offer", "projects"];
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: person + company identity titles`, () => {
      expect(str(m, "identityActions.person.title"), `${locale} person.title`).toBeTruthy();
      expect(str(m, "identityActions.company.title"), `${locale} company.title`).toBeTruthy();
    });
    it(`${locale}: all person action cards have title + desc`, () => {
      for (const a of PERSON_ACTIONS) {
        expect(str(m, `identityActions.person.actions.${a}.title`), `${locale} ${a}.title`).toBeTruthy();
        expect(str(m, `identityActions.person.actions.${a}.desc`), `${locale} ${a}.desc`).toBeTruthy();
      }
    });
    it(`${locale}: all company action cards have title + desc`, () => {
      for (const a of COMPANY_ACTIONS) {
        expect(str(m, `identityActions.company.actions.${a}.title`), `${locale} ${a}.title`).toBeTruthy();
        expect(str(m, `identityActions.company.actions.${a}.desc`), `${locale} ${a}.desc`).toBeTruthy();
      }
    });
    it(`${locale}: honest create-company CTA copy`, () => {
      expect(str(m, "identityActions.company.empty.cta"), `${locale} empty.cta`).toBeTruthy();
      expect(str(m, "identityActions.company.empty.desc"), `${locale} empty.desc`).toBeTruthy();
    });
  }
});
