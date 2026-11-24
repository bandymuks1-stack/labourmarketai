import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The company-side HISTORICAL PERSON CARD (2026-10-07).
 *
 * Owner invariant: organization-provided history exists BEFORE account claim
 * and must be readable for an UNLINKED roster person, with no gate of any kind
 * on it. These pins keep the route, its authority, the pagination and the
 * entry points from drifting back to "linked workers only" / "first 1000".
 */
const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const page = read("app/[locale]/dashboard/company/people/[personId]/page.tsx");
const reader = read("lib/organization-evidence/company-person-read.ts");
const roster = read("components/app/organization-roster-section.tsx");
const placeHistory = read("components/app/organization/company-work-history.tsx");
const historyRead = read("lib/organization-evidence/company-work-history-read.ts");
const performing = read("components/app/organization/performing-company-panel.tsx");
const importedHistory = read("components/app/people/person-imported-history.tsx");
const pagination = read("lib/organization-evidence/evidence-pagination.ts");

describe("route and authority", () => {
  it("is keyed on the roster row (organization_people.id), not on a worker", () => {
    expect(page).toMatch(/params: Promise<\{ locale: string; personId: string \}>/);
    expect(page).toMatch(/loadCompanyPerson\(locale, personId\)/);
  });

  it("another organization's manager gets notFound, never data", () => {
    expect(page).toMatch(/load\.kind === "hidden" \|\| load\.kind === "not-found"\) notFound\(\)/);
    // the roster row is bound to the caller's ACTIVE governed organization AND to RLS
    expect(reader).toMatch(/\.eq\("id", personId\)\s*\.eq\("organization_id", organizationId\)/);
    expect(reader).toMatch(/resolveEvidenceOrganization\(caller, null\)/);
    expect(reader).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE/i);
  });

  it("a failed read is 'unavailable', never an empty history", () => {
    expect(reader).toMatch(/if \(recs\.kind !== "ok"\) return \{ kind: "unavailable" \}/);
    expect(page).toContain('data-testid="company-person-unavailable"');
  });

  it("reads EVERY record (paged), with no linked-only filter", () => {
    expect(reader).toMatch(/listAllEvidenceRecords\(caller, \{\s*organizationPersonId: personId,/);
    expect(reader).not.toMatch(/link_state", "linked"/);
  });

  it("adds NO gate on organization-provided history (no payment / confirmation step)", () => {
    for (const src of [page, reader]) {
      expect(src).not.toMatch(/payment|stripe|checkout|counterparty|confirmOwner|requireConfirmation/i);
    }
  });
});

describe("one renderer, no 50 cap, no silent 1000", () => {
  it("the page reuses PersonImportedHistory (no second record renderer)", () => {
    expect(page).toMatch(/<PersonImportedHistory[\s\S]{0,200}organizationPersonIds=\{\[person\.id\]\}/);
    expect(importedHistory).toMatch(/organizationPersonIds\?: readonly string\[\]/);
  });

  it("the server row ceiling is paged, and a reached ceiling is disclosed", () => {
    expect(pagination).toMatch(/\.range|offset/);
    expect(pagination).toMatch(/truncated/);
    expect(historyRead).not.toMatch(/LIMIT = 1000|limit: LIMIT/);
    expect(performing).not.toMatch(/limit: 1000/);
    expect(historyRead).toMatch(/listAllEvidenceRecords/);
    expect(performing).toMatch(/performing-company-truncated/);
    expect(placeHistory).toMatch(/company-work-history-truncated/);
  });
});

describe("entry points", () => {
  it("roster rows and UNLINKED history chips open the card", () => {
    expect(roster).toMatch(/\/dashboard\/company\/people\/\$\{p\.id\}/);
    expect(placeHistory).toMatch(/\/dashboard\/company\/people\/\$\{pp\.id\}/);
  });
});

describe("i18n for the new copy (all locale files, no banned words)", () => {
  const dir = join(root, "messages");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const keys = (o: unknown, p = ""): string[] =>
    o && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k))
      : [p];
  const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8")).companyPerson;

  it("every locale file carries companyPerson with the English key set", () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const f of files) {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(keys(j.companyPerson).sort(), f).toEqual(keys(en).sort());
      expect(typeof j.companyWorkHistory.truncated, f).toBe("string");
      expect(JSON.stringify(j.companyPerson), f).not.toMatch(/\bdemo\b/i);
    }
  });
});
