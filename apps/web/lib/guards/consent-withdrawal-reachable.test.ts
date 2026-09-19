import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A PERMISSION THAT CANNOT BE TAKEN BACK IS NOT A PERMISSION.
 *
 * Two consents on the person's side promised withdrawal in their wording and
 * had it in the database, but not in the product (found 2026-09-19):
 *
 *  1. The contact-detail disclosure grant. `withdraw_employer_data_disclosure`
 *     has been in the consent ledger since 2026-07-11, granted to
 *     `authenticated`, and NOTHING called it — the worker screen offered
 *     accept / decline / allow and no way back.
 *  2. The roster link. `organization_people_subject_decides` let the linked
 *     person return the row to `unlinked` since 2026-09-07; the profile
 *     offered only the two answers to an OFFER.
 *
 * This guard pins both withdrawals to a real server action AND a real control
 * in the component the privacy / profile page renders. Source-shape checks by
 * design: the behaviour itself is exercised by the ledger RPC (latest-wins in
 * `has_employer_data_disclosure`) and the RLS policy.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("contact-detail disclosure can be withdrawn by the worker", () => {
  const actions = read("lib/privacy/contact-disclosure-actions.ts");
  const component = read("components/app/contact-disclosure-requests.tsx");
  const page = read("app/[locale]/dashboard/privacy/page.tsx");

  it("a server action calls the ledger's withdrawal RPC", () => {
    expect(actions).toMatch(/export async function withdrawContactDisclosureGrantAction/);
    expect(actions).toMatch(/"withdraw_employer_data_disclosure"/);
    // Same context the grant wrote, so the ledger's latest-wins read flips.
    const fn = actions.split("withdrawContactDisclosureGrantAction")[1] ?? "";
    expect(fn).toMatch(/p_context_type: "company_need"/);
    expect(fn).toMatch(/p_recipient_organization_id: row\.organization_id/);
    // The caller must BE the subject worker — never trusted from the form.
    expect(fn).toMatch(/\.eq\("profile_id", user\.id\)/);
  });

  it("the worker's card renders the withdrawal beside the granted state", () => {
    expect(component).toMatch(/withdrawContactDisclosureGrantAction/);
    expect(component).toMatch(/data-testid=\{`contact-request-withdraw-\$\{r\.id\}`\}/);
    expect(component).toMatch(/labels\.withdrawGrant\b/);
    expect(page).toMatch(/withdrawGrant: tc\("contactRequests\.withdrawGrant"\)/);
  });

  it("the five active locales carry the withdrawal wording", () => {
    for (const locale of ["en", "lt", "ru", "nl", "de"]) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        privacyConsent?: { contactRequests?: Record<string, string> };
      };
      const block = messages.privacyConsent?.contactRequests ?? {};
      for (const key of ["withdrawGrant", "withdrawGrantNote", "withdrawnNote"]) {
        expect(block[key], `${locale}: privacyConsent.contactRequests.${key}`).toBeTruthy();
      }
    }
  });
});

describe("a confirmed roster link can be withdrawn by the subject", () => {
  const core = read("lib/organization-evidence/import-core.ts");
  const action = read("lib/organization-evidence/roster-link-actions.ts");
  const component = read("components/app/organization-evidence-section.tsx");
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("the domain function accepts `withdraw` and scopes it to CONFIRMED links only", () => {
    const fn = core.split("export async function respondToRosterLink(")[1] ?? "";
    expect(fn).toMatch(/"accept" \| "refuse" \| "withdraw"/);
    expect(fn).toMatch(/input\.decision === "withdraw"\s*\?\s*query\.eq\("link_state", "linked"\)/);
    // And the answer to an offer stays an answer to an offer.
    expect(fn).toMatch(/query\.eq\("link_state", "link_proposed"\)/);
    // The row must already name the caller — RLS says so too, this is belt.
    expect(fn).toMatch(/\.eq\("linked_profile_id", caller\.userId\)/);
  });

  it("the server action admits the third decision and nothing else", () => {
    expect(action).toMatch(/raw !== "accept" && raw !== "refuse" && raw !== "withdraw"/);
  });

  it("the profile renders a two-step withdrawal for every confirmed link", () => {
    expect(component).toMatch(/export function RosterLinkWithdrawals/);
    expect(component).toMatch(/data-testid="roster-link-withdraw-open"/);
    expect(component).toMatch(/data-testid="roster-link-withdraw-confirm"/);
    expect(component).toMatch(/value="withdraw"/);
    expect(page).toMatch(/<RosterLinkWithdrawals links=\{myOrgEvidence\.links\} \/>/);
  });

  it("the five active locales carry the withdrawal wording", () => {
    for (const locale of ["en", "lt", "ru", "nl", "de"]) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        evidenceImport?: { mine?: Record<string, string> };
      };
      const block = messages.evidenceImport?.mine ?? {};
      for (const key of [
        "linksTitle",
        "linksHint",
        "withdrawLink",
        "withdrawConfirm",
        "withdrawCancel",
        "withdrawDone",
      ]) {
        expect(block[key], `${locale}: evidenceImport.mine.${key}`).toBeTruthy();
      }
    }
  });
});
