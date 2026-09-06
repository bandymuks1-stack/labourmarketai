import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

/**
 * REAL PERSON JOIN (window 6, lane A — walked on production 2026-09-06 as a
 * person who had never seen the product, build ca96605b).
 *
 * What was measured and what each pin keeps fixed:
 *  1. The landing sentence was LOST between the login form and onboarding
 *     (login → `location.assign(next)` → dashboard layout bounce → bare
 *     `/onboarding`). The password login must route a not-yet-onboarded
 *     person to `/onboarding?next=…` (the callback route already did).
 *  2. Onboarding asked "Ko atėjote?" with nothing ticked and "Kokį darbą
 *     dirbi?" with an empty select — the two facts the person had just typed.
 *     The page must read the sentence into the wizard's defaults and the
 *     wizard must show the sentence back.
 *  3. The signup form asked a job-seeker for a "Darbo el. paštas" / "Work
 *     email" with a company placeholder. A private person has no work e-mail.
 *  4. The check-your-e-mail screen said nothing about what to do when no mail
 *     arrives (real-inbox delivery is owner gate G-1) — the body must name the
 *     spam folder; the resend stays.
 * All served locales must carry the new keys (next-intl has no fallback).
 */
const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8").replace(/\r/g, "");
const messages = (locale: string) =>
  JSON.parse(readFileSync(join(web, "messages", `${locale}.json`), "utf8")) as {
    auth: {
      signup: Record<string, string>;
      onboarding: { rolePicker: Record<string, string> };
    };
  };

describe("1. the landing sentence survives a password login into onboarding", () => {
  const login = read("components/app/login-form.tsx");
  it("the login form decides the destination through the pure helper", () => {
    expect(login).toMatch(/postLoginDestination\(\{\s*locale,\s*nextParam,\s*nextPath,\s*onboardedAt\s*\}\)/);
    expect(login).toMatch(/needsOnboardingCheck\(nextParam\)/);
    expect(login).toMatch(/\.from\("profiles"\)\s*\.select\("onboarded_at"\)/);
  });
  it("never navigates to the raw destination straight after sign-in any more", () => {
    expect(login).not.toMatch(/window\.location\.assign\(nextPath\)/);
  });
});

describe("2. onboarding starts from what the person already said", () => {
  const page = read("app/[locale]/onboarding/page.tsx");
  const wizard = read("components/app/onboarding-wizard.tsx");
  it("the page reads the hand-off on the server and passes defaults down", () => {
    expect(page).toMatch(/readLandingHandoff\(safeNext\)/);
    expect(page).toMatch(/saidSentence=\{handoff\.sentence \|\| null\}/);
    expect(page).toMatch(/defaultIntents=\{handoff\.intents\}/);
    expect(page).toMatch(/defaultProfessionSlug=\{handoff\.professionSlug\}/);
  });
  it("the wizard pre-ticks from the defaults and shows the sentence back", () => {
    expect(wizard).toMatch(/useState<Set<FirstRunIntent>>\(\s*\(\) => new Set\(defaultIntents\),?\s*\)/);
    expect(wizard).toMatch(/data-testid="onboarding-said"/);
    expect(wizard).toMatch(/PROFESSION_SLUGS\.includes\(defaultProfessionSlug\)/);
  });
  it("a defaulted profession is still a registry value the person submits, never a silent write", () => {
    // the default only seeds the select; the submit path is unchanged
    expect(wizard).toMatch(/form\.set\("profession_slug", professionSlug\)/);
  });
});

describe("3./4. signup copy for a private person, in every served locale", () => {
  for (const locale of activeLocales) {
    const m = messages(locale);
    it(`${locale}: e-mail is not a "work" e-mail and the placeholder is not a company`, () => {
      expect(m.auth.signup.email_label).not.toMatch(/darbo|work|рабоч|zakelijk|geschäftlich/i);
      expect(m.auth.signup.email_placeholder).not.toMatch(/imone|company|kompaniya|bedrijf/i);
    });
    it(`${locale}: the check-your-e-mail body says what to do when nothing arrives`, () => {
      expect(m.auth.signup.check_email_body).toMatch(/šlamšt|spam|спам/i);
      expect(m.auth.signup.resend_label).toBeTruthy();
    });
    it(`${locale}: the onboarding "you wrote" keys exist`, () => {
      expect(m.auth.onboarding.rolePicker.saidLabel).toBeTruthy();
      expect(m.auth.onboarding.rolePicker.saidHint).toBeTruthy();
      expect(m.auth.onboarding.rolePicker.saidLabel).not.toMatch(/^\[EN\]/);
      expect(m.auth.onboarding.rolePicker.saidHint).not.toMatch(/^\[EN\]/);
    });
  }
});

/**
 * Orchestrator decisions on the walk's open questions (window 6, 2026-09-06):
 *  5. A just-onboarded WORKER lands in the conversation (`/dashboard`), not on
 *     the profile wall — the chat's first turn already greets, names what the
 *     profile lacks and offers the profile as a chip (owner contract
 *     2026-09-04 §3/§4A/§7). Company/agency/customer destinations untouched.
 *  6. The signup form renders the legal notice ONCE and the pilot-feedback
 *     line as one quiet sentence BELOW the submit; its subcopy no longer
 *     promises a "role" step — the next step confirms what the person came
 *     for (the sentence may already have ticked it).
 *  7. The onboarding country field writes `profiles.country` and
 *     `workers.current_location_country` (complete_onboarding RPC) — it is
 *     where the person LIVES, and the label must say so.
 */
describe("5. a fresh worker lands in the conversation; other identities keep their first screen", () => {
  const actions = read("lib/auth/actions.ts");
  it("worker → /dashboard (the chat), never the profile wall", () => {
    expect(actions).toMatch(/worker:\s*`\/\$\{locale\}\/dashboard`,/);
    expect(actions).not.toMatch(/worker:\s*`[^`]*profile#setup-journey`/);
  });
  it("company/agency → /dashboard/company, customer → /dashboard/buyer", () => {
    expect(actions).toMatch(/company:\s*`\/\$\{locale\}\/dashboard\/company`/);
    expect(actions).toMatch(/agency:\s*`\/\$\{locale\}\/dashboard\/company`/);
    expect(actions).toMatch(/customer:\s*`\/\$\{locale\}\/dashboard\/buyer`/);
  });
  it("a safe ?next= still wins over the role destination (invitation continuity)", () => {
    expect(actions).toMatch(/isSafeReturnPath\(nextRaw\)[\s\S]*?redirect\(getSafeReturnPath\(nextRaw, locale\)\)/);
  });
});

describe("6. signup: one legal notice, the pilot line under the action", () => {
  const signup = read("components/app/signup-form.tsx");
  it("the legal notice renders exactly once", () => {
    expect(signup.match(/<AuthLegalNotice variant="signup"/g)).toHaveLength(1);
  });
  it("the pilot-feedback line sits after the submit row, as one quiet line", () => {
    const submit = signup.indexOf('type="submit"');
    const pilot = signup.indexOf('data-testid="signup-pilot-line"');
    expect(submit).toBeGreaterThan(-1);
    expect(pilot).toBeGreaterThan(submit);
    expect(signup).not.toMatch(/border-state-warning[^\n]*\n\s*\{t\("disclaimer"\)\}/);
  });
  for (const locale of activeLocales) {
    it(`${locale}: the subcopy no longer promises a "role" step`, () => {
      const sub = messages(locale).auth.signup.subcopy;
      expect(sub).not.toMatch(/vaidmen|your role|роль|je rol|Ihre Rolle/i);
      expect(sub).toMatch(/kitame žingsnyje|next step|следующем шаге|volgende stap|nächsten Schritt/i);
    });
  }
});

describe("7. the onboarding country field is labelled by what it writes (residence)", () => {
  it("the RPC writes the field to profiles.country and workers.current_location_country", () => {
    const rpc = readFileSync(
      join(web, "..", "..", "supabase", "migrations", "20260805090000_worker_display_name_write_path_v1.sql"),
      "utf8",
    );
    expect(rpc).toMatch(/country\s*=\s*nullif\(trim\(coalesce\(p_country, ''\)\), ''\)/);
    expect(rpc).toMatch(/current_location_country/);
  });
  const RESIDENCE: Record<string, RegExp> = {
    lt: /gyveni/i,
    en: /live/i,
    ru: /живёте|живете/i,
    nl: /woon/i,
    de: /wohnen|leben/i,
  };
  for (const locale of activeLocales) {
    it(`${locale}: the label asks where the person lives, not a bare "Country"`, () => {
      const label = (messages(locale).auth as unknown as { onboarding: Record<string, string> })
        .onboarding.country_label;
      expect(label).toMatch(RESIDENCE[locale]);
      expect(label).not.toMatch(/^(Šalis|Country|Страна|Land)$/);
    });
  }
});
