import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Partner-representation consent UX — source-level invariants.
 *
 * Same discipline as `consent-ux-honesty.test.ts`, for the second consent this
 * product asks for. The difference that matters: this screen ALSO carries three
 * permission checkboxes, and a checkbox is exactly the control a future edit
 * would "helpfully" pre-tick. So the ban here is not "no checkboxes" — it is
 * that none of them can start on, that no work-seeking intent is preselected,
 * and that no country is ever answered on the person's behalf from a field that
 * asked a different question.
 */

const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

const component = read("components/app/partner-supply-representation.tsx");

/**
 * Comments stripped.
 *
 * The invariants below are about what the CODE does. Asserting them against the
 * raw file makes the file's own explanation of the rule trip the rule — and the
 * obvious way to make that green again is to delete the explanation, which is
 * the opposite of what a guard should teach.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const componentCode = code(component);
const actions = read("lib/privacy/partner-supply-actions.ts");
const page = read("app/[locale]/dashboard/privacy/page.tsx");
const definitions = read("lib/privacy/consent-definitions.ts");
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

function partnerSupply(locale: string): Record<string, string> {
  const catalog = JSON.parse(read(`messages/${locale}.json`));
  return catalog.privacyConsent.partnerSupply as Record<string, string>;
}

describe("default deny survives the UI", () => {
  it("nothing is pre-ticked — no defaultChecked anywhere", () => {
    expect(componentCode).not.toMatch(/defaultChecked/);
    expect(componentCode).not.toMatch(/checked=\{true\}/);
  });

  it("the three authority checkboxes start false", () => {
    for (const state of [
      "contactAuthority",
      "publicationAuthority",
      "identityDisclosureAuthority",
    ]) {
      // `declaration?.x ?? false` — an existing answer is the person's own; the
      // absence of one is a denial, never an assumption.
      expect(component, state).toMatch(
        new RegExp(`useState\\(\\s*\\n?\\s*declaration\\?\\.${state} \\?\\? false`),
      );
    }
  });

  it("no work-seeking intent is preselected", () => {
    // The initial value is the empty string, not a state. A default here would
    // be the product making a claim about a person's situation for them.
    expect(component).toMatch(/useState<Intent \| "">\(/);
    expect(component).toMatch(/\?\? ""/);
  });

  it("the form refuses to submit without an explicitly chosen intent", () => {
    expect(component).toMatch(/if \(intent === ""\)/);
  });

  it("countries are never prefilled from a different question", () => {
    // `workers.preferred_countries` is a PREFERENCE. This screen asks where the
    // person may LEGALLY work and where they AGREE to be offered. Answering
    // either from the preference would be fabricating consent.
    expect(componentCode).not.toMatch(/preferred_countries|preferredCountries/);
  });

  it("the server action never defaults an authority to true", () => {
    for (const field of [
      "p_contact_authority",
      "p_publication_authority",
      "p_identity_disclosure_authority",
    ]) {
      expect(actions, field).toMatch(new RegExp(`${field}: input\\.\\w+ === true`));
    }
    expect(actions).not.toMatch(/authority.*\?\?\s*true/i);
  });
});

describe("granting and refusing cost the same", () => {
  it("grant and decline are EQUAL buttons (identical class string)", () => {
    expect(component).toMatch(/data-testid="partner-supply-grant"/);
    expect(component).toMatch(/data-testid="partner-supply-decline"/);
    const cls =
      "inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60";
    expect(component.split(cls).length).toBeGreaterThanOrEqual(3);
  });

  it("declining is local-only — it calls no server action", () => {
    const beforeDecline = component
      .split('data-testid="partner-supply-decline"')[0]!
      .split("onClick=");
    const declineHandler = beforeDecline[beforeDecline.length - 1] ?? "";
    expect(declineHandler).toMatch(/setPhase\("declined"\)/);
    expect(declineHandler).not.toMatch(/grant|upsert|withdraw/i);
  });

  it("withdrawal lives on the same screen and takes one click", () => {
    expect(component).toMatch(/data-testid="partner-supply-withdraw-consent"/);
    expect(component).toMatch(/data-testid="partner-supply-withdraw-declaration"/);
    expect(component).toMatch(/onClick=\{onWithdrawConsent\}/);
  });

  it("an ageing or expired answer is offered reconfirmation, not silence", () => {
    expect(component).toMatch(/freshness === "AGEING" \|\| freshness === "EXPIRED"/);
    expect(component).toMatch(/data-testid="partner-supply-reconfirm"/);
  });
});

describe("a match is not a disclosure, and the screen says so", () => {
  it("renders the sentence that keeps matching apart from naming", () => {
    expect(component).toMatch(/data-testid="partner-supply-match-never-reveals"/);
  });

  it("every active locale states that matching alone reveals no identity", () => {
    for (const locale of ACTIVE) {
      const t = partnerSupply(locale);
      expect(t.matchNeverReveals, locale).toBeTruthy();
      // Not a keyword check for its own sake: the promise is only meaningful if
      // it names the things it promises not to reveal.
      expect(t.matchNeverReveals.length, locale).toBeGreaterThan(60);
      expect(t.authorityIdentityBody, locale).toBeTruthy();
      expect(t.authorityContactBody, locale).toBeTruthy();
    }
  });

  it("the four authorities are four separate labels in every active locale", () => {
    for (const locale of ACTIVE) {
      const t = partnerSupply(locale);
      const names = [
        t.authorityMatch,
        t.authorityContact,
        t.authorityPresentation,
        t.authorityIdentity,
      ];
      expect(new Set(names).size, locale).toBe(4);
      for (const n of names) expect(n.trim(), locale).not.toBe("");
    }
  });

  it("the projection the consent describes still carries no identity field", () => {
    // The copy promises absence; this asserts the promise is structural.
    const contract = read("lib/supply-bridge/first-party-signal-contract.ts");
    for (const forbidden of ["name", "email", "phone", "address"]) {
      expect(contract).toMatch(new RegExp(`"${forbidden}"`));
    }
    expect(contract).toMatch(/FORBIDDEN_IDENTITY_KEYS/);
  });
});

describe("the consent says what it actually permits", () => {
  it("names representation OUTSIDE this product in every active locale", () => {
    const outside: Record<string, RegExp> = {
      lt: /už (šios platformos|LabourMarket\.ai) rib/i,
      en: /outside this platform/i,
      ru: /за пределами этой платформы/i,
      nl: /buiten dit platform/i,
      de: /außerhalb dieser Plattform/i,
    };
    for (const locale of ACTIVE) {
      expect(partnerSupply(locale).sectionIntro, locale).toMatch(outside[locale]!);
    }
  });

  it("the versioned legal text does not claim who OPERATES the partner side", () => {
    // A controller statement about another system is exactly the sentence that
    // must not be guessed (Art. 13(1)(a)). The registry states the processor
    // relationship instead: it acts only on the controller's instructions.
    const block = definitions.slice(
      definitions.indexOf("PARTNER_SUPPLY_REPRESENTATION_V1"),
      definitions.indexOf("export const CONSENT_DEFINITIONS"),
    );
    expect(block).not.toMatch(/operated by the same (data )?controller/i);
    expect(block).toMatch(/instructions/i);
  });

  it("no coercive or scare copy in the new keys", () => {
    for (const locale of ACTIVE) {
      const blob = JSON.stringify(partnerSupply(locale)).toLowerCase();
      for (const banned of [
        "privalom",
        "you will lose access",
        "must accept",
        "negalėsite naudotis",
        "required to continue",
      ]) {
        expect(blob, `${locale}: ${banned}`).not.toContain(banned);
      }
    }
  });

  it("says plainly that refusing costs nothing", () => {
    for (const locale of ACTIVE) {
      const t = partnerSupply(locale);
      expect(t.statusNotRepresentedBody, locale).toBeTruthy();
      expect(t.declinedNote, locale).toBeTruthy();
    }
  });
});

describe("honest degradation and canonical placement", () => {
  it("an unapplied migration renders plain text, never a fake success", () => {
    expect(component).toMatch(/data-testid="partner-supply-unavailable"/);
    expect(component).toMatch(/needs-migration/);
    expect(actions).toMatch(/needs-migration/);
  });

  it("a profile with no worker row is TOLD it would not be represented", () => {
    // The feed joins `workers`; rendering the form without saying this would be
    // a privacy control that quietly does nothing.
    expect(component).toMatch(/data-testid="partner-supply-no-worker"/);
    expect(actions).toMatch(/hasWorkerProfile/);
  });

  it("lives on the canonical privacy screen, not a new product area", () => {
    expect(page).toMatch(/data-testid="privacy-partner-supply"/);
    expect(page).toMatch(/PartnerSupplyRepresentation/);
    // Rendered from the versioned registry — the exact hashed wording.
    expect(page).toMatch(/PARTNER_SUPPLY_REPRESENTATION_V1\.texts\[consentLocale\]/);
  });

  it("the client component never touches the service-role client", () => {
    expect(component).not.toMatch(/createAdminClient|SERVICE_ROLE/);
    expect(actions).not.toMatch(/createAdminClient|SERVICE_ROLE/);
  });
});
