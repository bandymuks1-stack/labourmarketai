import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * COMPANY HISTORY → THE PERSON (#3354 d). The company side links a historical
 * roster row to the person's own page only when the PERSON confirmed the link
 * (integrity doors v1), on every surface, and never links to a card that does
 * not belong to this organization.
 */
const web = process.cwd();
const read = (p: string) => readFileSync(join(web, p), "utf8");

describe("one rule for opening the person's own page", () => {
  it("the company history uses the person's own confirmation", () => {
    expect(read("lib/organization-evidence/company-work-history-read.ts")).toMatch(
      /p\.link_state === "linked" && p\.link_method === "worker_confirmed" && p\.linked_worker_id/,
    );
  });

  it("the person card uses the same rule (a manager's link or an invitation alone is not enough)", () => {
    const src = read("lib/organization-evidence/company-person-read.ts");
    expect(src).toContain('.select("id, display_name, relationship_kind, link_state, link_method, linked_worker_id")');
    expect(src).toMatch(/linkState === "linked" && row\.data\.link_method === "worker_confirmed"/);
  });
});

describe("no link to a card this organization does not hold", () => {
  const ui = read("components/app/organization/company-work-history.tsx");

  it("the history load names this organization's own roster rows", () => {
    expect(read("lib/organization-evidence/company-work-history-read.ts")).toMatch(/ownPeople\[p\.id\] = true;/);
  });

  it("a person from another organization's roster is shown by name, not linked", () => {
    const block = ui.slice(ui.indexOf('data-testid="company-place-people"'), ui.indexOf("company-place-timeline"));
    expect(block).toContain('"company-place-person-other-roster"');
    expect(block).toMatch(/load\.ownPeople\[pp\.id\] && cardsOpen \? \(/);
  });

  it("a chip opens the company's own card, never a person's page directly (the card carries that link, on the person's own confirmation)", () => {
    const block = ui.slice(ui.indexOf('data-testid="company-place-people"'), ui.indexOf("company-place-timeline"));
    // The card of THIS organization; `?org=` keeps the organization the history was read for.
    expect(block).toContain("href={`/dashboard/company/people/${pp.id}${organizationId ? `?org=${encodeURIComponent(organizationId)}` : \"\"}`");
    expect(block).not.toContain("/dashboard/people/");
  });

  it("the card is offered only when the history shown is the active organization's (the card reads the active one)", () => {
    expect(ui).toMatch(/const cardsOpen = activeId !== null && activeId === load\.organizationId;/);
    const block = ui.slice(ui.indexOf('data-testid="company-place-people"'), ui.indexOf("company-place-timeline"));
    expect(block).toContain('"company-place-person-other-workspace"');
  });
});

describe("the company card says 'linked' only on the person's own confirmation", () => {
  const card = read("app/[locale]/dashboard/company/people/[personId]/page.tsx");

  it("the claim line follows the confirmed link, not the raw link state", () => {
    expect(card).toMatch(/const claimState = person\.linkedWorkerId\s*\?\s*"linked"\s*:\s*person\.linkState === "linked"\s*\?\s*"link_proposed"/);
    expect(card).toContain("t(`claim.${claimState}` as never)");
  });
});

describe("the place detail is reachable from the history page", () => {
  const page = read("app/[locale]/dashboard/company/history/page.tsx");
  const ui = read("components/app/organization/company-work-history.tsx");

  it("the page renders one place's detail at the anchor every place tile links to", () => {
    expect(ui).toContain("#company-place-detail");
    expect(page).toMatch(/<section id="company-place-detail"[^>]*>\s*<CompanyPlaceHistory locale=\{locale\} placeKey=\{place\} organizationId=\{org\} \/>/);
  });

  it("a named organization (?org=) is kept from the tile to the detail", () => {
    expect(ui).toMatch(/href=\{placeHref\(p\.key, organizationId\)/);
    const detail = ui.slice(ui.indexOf("export async function CompanyPlaceHistory"), ui.indexOf("async function WorkspaceNotice"));
    expect(detail).toContain("loadHistory(locale, organizationId)");
  });

  it("the overview and the detail read the history once per request", () => {
    expect(ui).toContain("const loadHistory = cache(loadCompanyWorkHistory);");
    expect(ui).not.toMatch(/await loadCompanyWorkHistory\(/);
  });

  it("one top-level heading; the detail's sections sit under the place's own heading", () => {
    const detail = ui.slice(ui.indexOf("export async function CompanyPlaceHistory"), ui.indexOf("async function WorkspaceNotice"));
    expect(detail).not.toContain("<h1");
    expect(detail).toMatch(/<h2[^>]*>\s*\{place\.name/);
    expect(detail).toMatch(/<h3[^>]*>\{t\("whoWorked"\)\}<\/h3>/);
    expect(detail).toMatch(/<h3[^>]*>\{t\("timeline"\)\}<\/h3>/);
    expect(detail).not.toMatch(/<h2[^>]*>\{t\("(whoWorked|timeline)"\)\}/);
  });
});
