import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Consent UX honesty guard (required tests 3, 4, 5, 7, 8, 20, 23, 26 +
 * Phase 6 dark-pattern bans). Source-level invariants over the consent UI,
 * actions and i18n catalogs.
 */

const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

const consentComponent = read("components/app/discoverability-consent.tsx");
const privacyPage = read("app/[locale]/dashboard/privacy/page.tsx");
const signupForm = read("components/app/signup-form.tsx");
const actions = read("lib/privacy/discoverability-actions.ts");
const preview = read("lib/privacy/discoverability-preview.ts");
const pool = read("lib/staffing/candidate-pool.ts");
const readiness = read("lib/admin/launch-readiness.ts");

describe("no dark patterns (test 3 + Phase 6)", () => {
  it("no checkbox exists — nothing can be pre-ticked", () => {
    expect(consentComponent).not.toMatch(/type="checkbox"/);
    expect(consentComponent).not.toMatch(/defaultChecked|checked=\{true\}/);
  });

  it("grant and decline are EQUAL buttons (same classes, adjacent)", () => {
    const grant = consentComponent.match(
      /data-testid="discoverability-grant"/,
    );
    const decline = consentComponent.match(
      /data-testid="discoverability-decline"/,
    );
    expect(grant && decline).toBeTruthy();
    // Both buttons carry the identical neutral class string.
    const cls =
      "inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60";
    expect(consentComponent.split(cls).length).toBeGreaterThanOrEqual(3);
  });

  it("no coercive or scare copy in any active locale (Phase 6 bans)", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const catalog = JSON.parse(read(`messages/${locale}.json`));
      const pc = JSON.stringify(catalog.privacyConsent);
      expect(pc, locale).toBeTruthy();
      for (const banned of [
        "privalom", // LT "mandatory"
        "negalėsite naudotis sistema",
        "you will lose access",
        "must accept",
      ]) {
        expect(pc.toLowerCase(), `${locale}: ${banned}`).not.toContain(banned);
      }
    }
  });

  it("declining is local-only: no server call, nothing deleted (test 5)", () => {
    const declineHandler = consentComponent
      .split('data-testid="discoverability-decline"')[0]
      .split("onClick=")
      .pop();
    expect(declineHandler).toContain('setPhase("declined")');
    expect(declineHandler).not.toContain("withdraw");
    expect(declineHandler).not.toContain("grant");
  });
});

describe("consent is separate from Terms and signup (test 4)", () => {
  it("signup form contains no discoverability consent and no bundled accept-all control", () => {
    expect(signupForm).not.toMatch(/discoverab/i);
    expect(signupForm).not.toMatch(/privacyConsent/);
  });

  it("the grant action grants ONLY the discoverability purpose", () => {
    expect(actions).toMatch(/grant_profile_discoverability_consent/);
    expect(actions).not.toMatch(/terms/i);
  });
});

// "Private profile stays usable without consent" was pinned through the
// PrivacyStatusCard on the second dashboard; W3 Package 4 deleted both. The
// consent surfaces below (privacy page + consent component) are the
// remaining canonical homes of that promise.

describe("canonical privacy screen (Phase 6)", () => {
  it("has the four required sections", () => {
    for (const id of ["privacy-visibility", "privacy-disclosures", "privacy-history", "privacy-export"]) {
      expect(privacyPage).toContain(`data-testid="${id}"`);
    }
  });

  it("renders the legal text from the versioned registry (hash-exact wording)", () => {
    expect(privacyPage).toMatch(/PROFILE_DISCOVERABILITY_V1\.texts\[consentLocale\]/);
  });

  it("withdrawal lives on the same screen as granting (Phase 9: no email/support needed)", () => {
    expect(consentComponent).toContain('data-testid="discoverability-withdraw"');
    expect(consentComponent).toContain('data-testid="discoverability-grant"');
  });
});

describe("server-side sourcing (tests 7, 8, 21, 26)", () => {
  it("consent actions and preview never use the service-role client", () => {
    expect(actions).not.toMatch(/createAdminClient/);
    expect(preview).not.toMatch(/createAdminClient/);
    expect(pool).not.toMatch(/createAdminClient/);
  });

  it("preview exposes ONLY the limited professional summary — no contacts", () => {
    for (const banned of ["email", "phone", "full_name", "address"]) {
      expect(preview.toLowerCase()).not.toMatch(
        new RegExp(`select\\([^)]*${banned}`),
      );
    }
    expect(preview).toMatch(/display_name, experience_years, preferred_countries, availability_status, salary_min_eur, salary_max_eur/);
  });

  it("no fixture PII or secrets in the new modules (test 26)", () => {
    for (const src of [consentComponent, actions, preview, pool]) {
      expect(src).not.toMatch(/@gmail\.com|\+370\d|bot[0-9]{6,}/);
    }
  });
});

describe("operator surfaces (tests 20 + Phase 8/13)", () => {
  it("candidate pool exposes the Awaiting-worker-permission state", () => {
    expect(pool).toMatch(/admin_list_worker_privacy_states/);
    expect(pool).toMatch(/workerPermission/);
    const board = read("components/app/candidate-pool-board.tsx");
    expect(board).toMatch(/permissionAwaiting/);
  });

  it("launch-readiness consented = real consent-ledger counts, legacy boolean retired", () => {
    expect(readiness).toMatch(/admin_privacy_readiness_counts/);
    expect(readiness).not.toMatch(/eq\("consent_data_processing", true\)/);
  });

  it("no admin UI grants consent on behalf of a user (test 20)", () => {
    const lrPage = read("app/[locale]/dashboard/admin/launch-readiness/page.tsx");
    const cpPage = read("app/[locale]/dashboard/admin/candidate-pool/page.tsx");
    for (const src of [lrPage, cpPage]) {
      expect(src).not.toMatch(/grant_profile_discoverability|grant_employer_data_disclosure/);
    }
  });
});

describe("i18n completeness for the consent UI (test 23)", () => {
  const REQUIRED_LEAVES = [
    "sections.visibility",
    "sections.disclosures",
    "sections.history",
    "sections.rights",
    "status.hidden",
    "status.hiddenBody",
    "status.visible",
    "status.withdrawn",
    "actions.grant",
    "actions.decline",
    "actions.manage",
    "actions.review",
    "preview.title",
    "labels.declinedNote",
    "history.action.granted",
    "history.action.withdrawn",
  ];

  it.each(["lt", "en", "ru", "nl", "de"])("%s has every consent UI key, none [EN]-marked", (locale) => {
    const catalog = JSON.parse(read(`messages/${locale}.json`));
    for (const path of REQUIRED_LEAVES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let node: any = catalog.privacyConsent;
      for (const seg of path.split(".")) node = node?.[seg];
      expect(typeof node, `${locale}:privacyConsent.${path}`).toBe("string");
      expect(node, `${locale}:privacyConsent.${path}`).toMatch(/\S/);
      expect(node, `${locale}:privacyConsent.${path}`).not.toMatch(/^\[EN\]/);
    }
    // Admin + pool keys too.
    expect(typeof catalog.adminLaunchReadiness?.privacy?.title).toBe("string");
    expect(typeof catalog.candidatePool?.permissionAwaiting).toBe("string");
  });

  it("LT dashboard states match the owner-specified wording", () => {
    const lt = JSON.parse(read("messages/lt.json")).privacyConsent;
    expect(lt.status.hidden).toBe("Profilis darbdaviams nematomas");
    expect(lt.status.visible).toBe("Profesinis profilis matomas įmonėms");
    expect(lt.status.withdrawn).toBe("Matomumas išjungtas");
    expect(lt.actions.grant).toBe("Sutinku ir įjungiu matomumą");
    expect(lt.actions.decline).toBe("Dabar neįjungti");
    expect(lt.actions.review).toBe("Peržiūrėti matomumo nustatymus");
    expect(lt.preview.title).toBe("Taip jūsų profilį matys įmonės");
  });
});
