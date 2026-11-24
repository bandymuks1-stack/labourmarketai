import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Social-auth provider surface guard (social-auth-linkedin-facebook-v1).
 *
 * Extends the architecture locked by google-same-tab-redirect.test.ts to the
 * multi-provider surface. What it freezes:
 *
 *   1. NO popup / GIS machinery anywhere on the auth surface — the same-tab
 *      ruling (owner, 2026-07-29) covers EVERY provider, not just Google;
 *   2. exactly ONE OAuth flow: every provider button is a config over the
 *      single `signInWithOAuth` core in google-button.tsx — a second flow
 *      (a provider fork, an SDK, a popup) is an architecture regression;
 *   3. HONESTY GATE (§18): LinkedIn/Facebook render ONLY behind the
 *      enabled-providers flags the SERVER fetched from the auth server's own
 *      `/auth/v1/settings` — never unconditionally, never as a disabled
 *      decoration. Fail-closed defaults are literal `= false` in the forms.
 *      (The fail-closed fetch/parse behaviour itself is unit-proven in
 *      lib/auth/enabled-providers.test.ts.)
 *   4. the correct Supabase provider ids: `linkedin_oidc` (the OIDC provider,
 *      NOT the deprecated `linkedin`) and `facebook`.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

/** Comment-stripped source — prose may document the rejected popup flow. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BUTTON = "components/app/google-button.tsx";
const LOGIN_FORM = "components/app/login-form.tsx";
const SIGNUP_FORM = "components/app/signup-form.tsx";
const LOGIN_PAGE = "app/[locale]/auth/login/page.tsx";
const SIGNUP_PAGE = "app/[locale]/auth/signup/page.tsx";
const PROVIDERS_LIB = "lib/auth/enabled-providers.ts";
const PROVIDERS_CORE = "lib/auth/enabled-providers-core.ts";

describe("social auth — no popup/GIS machinery on ANY provider surface", () => {
  for (const rel of [BUTTON, LOGIN_FORM, SIGNUP_FORM, LOGIN_PAGE, SIGNUP_PAGE]) {
    it(`${rel} has no GIS script, ux_mode, or window.open`, () => {
      const code = stripComments(read(rel));
      expect(code).not.toContain("accounts.google.com/gsi");
      expect(code).not.toMatch(/ux_mode/);
      expect(code).not.toMatch(/window\.open\(/);
      expect(code).not.toMatch(/renderButton/);
    });
  }
});

describe("social auth — ONE shared same-tab flow for every provider", () => {
  const button = read(BUTTON);

  it("the signInWithOAuth CALL SITE appears exactly once, in the shared core", () => {
    // Count call sites (`.signInWithOAuth(`) on comment-stripped source —
    // prose and the provider-named failure-log strings may mention the API
    // name, but only ONE place may actually invoke it.
    const count = (stripComments(button).match(/\.signInWithOAuth\(/g) ?? [])
      .length;
    expect(count).toBe(1);
    // And nowhere in the forms — they only compose the exported buttons.
    expect(read(LOGIN_FORM)).not.toMatch(/signInWithOAuth/);
    expect(read(SIGNUP_FORM)).not.toMatch(/signInWithOAuth/);
  });

  it("LinkedIn/Facebook are provider CONFIGS over the shared core, not forks", () => {
    expect(button).toMatch(/const LINKEDIN_PROVIDER: OAuthProviderConfig/);
    expect(button).toMatch(/const FACEBOOK_PROVIDER: OAuthProviderConfig/);
    expect(button).toMatch(
      /LinkedInButton\(props: OAuthButtonProps\) \{\s*return <OAuthProviderButton provider=\{LINKEDIN_PROVIDER\}/,
    );
    expect(button).toMatch(
      /FacebookButton\(props: OAuthButtonProps\) \{\s*return <OAuthProviderButton provider=\{FACEBOOK_PROVIDER\}/,
    );
  });

  it("uses the OIDC LinkedIn provider id, never the deprecated one", () => {
    expect(button).toMatch(/id: "linkedin_oidc"/);
    expect(button).toMatch(/id: "facebook"/);
    // The deprecated `linkedin` provider id must never be passed to
    // signInWithOAuth — the union type + configs are the only id sources.
    expect(button).not.toMatch(/["']linkedin["']/);
  });

  it("each provider keeps the bounded signup-surface marker", () => {
    expect(button).toMatch(/markSignupPending\("linkedin_oidc"\)/);
    expect(button).toMatch(/markSignupPending\("facebook"\)/);
  });

  it("forms import every provider button from the ONE shared module", () => {
    for (const rel of [LOGIN_FORM, SIGNUP_FORM]) {
      const src = read(rel);
      expect(src).toMatch(
        /import \{\s*FacebookButton,\s*GoogleButton,\s*LinkedInButton,\s*\} from "@\/components\/app\/google-button"/,
      );
    }
  });
});

describe("social auth — §18 honesty gate: render ONLY what the auth server confirms", () => {
  for (const rel of [LOGIN_FORM, SIGNUP_FORM]) {
    const src = read(rel);

    it(`${rel}: LinkedIn/Facebook are gated on the enabled flags`, () => {
      expect(src).toMatch(/\{linkedinEnabled && \(\s*<LinkedInButton/);
      expect(src).toMatch(/\{facebookEnabled && \(\s*<FacebookButton/);
      // No unconditional render anywhere: every occurrence of the component
      // tag must be preceded by its flag guard.
      const linkedinTags = src.match(/<LinkedInButton/g) ?? [];
      const linkedinGuarded = src.match(/\{linkedinEnabled && \(\s*<LinkedInButton/g) ?? [];
      expect(linkedinTags.length).toBe(linkedinGuarded.length);
      const facebookTags = src.match(/<FacebookButton/g) ?? [];
      const facebookGuarded = src.match(/\{facebookEnabled && \(\s*<FacebookButton/g) ?? [];
      expect(facebookTags.length).toBe(facebookGuarded.length);
    });

    it(`${rel}: the flags default to FALSE (fail-closed props)`, () => {
      expect(src).toMatch(/linkedinEnabled = false/);
      expect(src).toMatch(/facebookEnabled = false/);
    });

    it(`${rel}: Google stays unconditional — the known-good provider`, () => {
      expect(src).toMatch(/<GoogleButton/);
      expect(src).not.toMatch(/googleEnabled &&/);
    });
  }

  for (const rel of [LOGIN_PAGE, SIGNUP_PAGE]) {
    it(`${rel}: the SERVER page fetches the flags and passes them down`, () => {
      const src = read(rel);
      expect(src).toMatch(/getEnabledProviders/);
      expect(src).toMatch(/linkedinEnabled=\{providers\.linkedin_oidc\}/);
      expect(src).toMatch(/facebookEnabled=\{providers\.facebook\}/);
    });
  }
});

describe("social auth — the enabled-providers module wiring", () => {
  it("the server module is server-only, cached 300 s, keyed on the project url", () => {
    const src = read(PROVIDERS_LIB);
    expect(src).toMatch(/import "server-only"/);
    expect(src).toMatch(/unstable_cache/);
    expect(src).toMatch(/revalidate: 300/);
    expect(src).toMatch(/env\.NEXT_PUBLIC_SUPABASE_URL\]/);
  });

  it("the core reads the auth server's own settings endpoint with the anon apikey", () => {
    const src = read(PROVIDERS_CORE);
    expect(src).toMatch(/\/auth\/v1\/settings/);
    expect(src).toMatch(/apikey: anonKey/);
    // Fail-closed constant: Google-only. A NEW provider hardcoded true here
    // would advertise a flow the auth server never confirmed.
    expect(src).toMatch(
      /FAIL_CLOSED_PROVIDERS: EnabledProviders = \{\s*google: true,\s*linkedin_oidc: false,\s*facebook: false,\s*\}/,
    );
  });
});
