import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * WORKER ACTIVATION FLOW (inbound-worker campaign) - invariants that must
 * survive every refactor.
 *
 * The flow is  /for-workers?utm_*=nonstop  ->  /auth/signup  ->  onboarding  ->
 * /dashboard/privacy  (consents + supply declaration)  ->  feed. It adds NO page
 * and NO second consent / declaration / referral model. What these assertions
 * pin is the part that is easiest to break "helpfully": a consent that starts
 * ticked, a country answered on the worker's behalf, registration treated as
 * agreement, or the observation RPC growing into an acceptance.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const tsCode = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const sqlCode = (src: string) => src.replace(/--[^\n]*/g, "");

describe("the campaign travels in the URL, not only in localStorage", () => {
  const signup = tsCode(read("components/app/signup-form.tsx"));

  it("signup reads the campaign from its own query and lets it beat a stale first touch", () => {
    expect(signup).toMatch(/parseInboundReferral\(searchParams\)/);
    // spread AFTER getFirstTouchAttribution() in the signUp metadata
    expect(signup).toMatch(
      /\.\.\.getFirstTouchAttribution\(\),\s*\.\.\.\(inbound \? inboundAttributionMetadata\(inbound\) : \{\}\)/,
    );
  });

  it("an explicit ?next= always wins; the campaign default is only a fallback", () => {
    expect(signup).toMatch(
      /searchParams\.get\("next"\) \?\? \(inbound \? buildActivationNext\(inbound\) : null\)/,
    );
  });

  it("both signup CTAs of /for-workers carry the campaign (hero TrackedCta + closing band)", () => {
    expect(read("components/app/tracked-cta.tsx")).toMatch(/useActivationSignupHref\(href\)/);
    expect(read("components/marketing/cta-band.tsx")).toMatch(/<ActivationSignupLink/);
    const hook = read("components/app/use-activation-signup-href.ts");
    // server render + first client render stay on the plain href (no hydration mismatch)
    expect(hook).toMatch(/useState<string \| null>\(null\)/);
    expect(hook).toMatch(/href !== "\/auth\/signup"/);
  });
});

describe("registration is not consent - nothing is granted, ticked or prefilled", () => {
  const files = [
    "lib/auth/worker-activation.ts",
    "lib/privacy/worker-activation-steps.ts",
    "components/app/worker-activation-steps.tsx",
    "components/app/use-activation-signup-href.ts",
    "components/app/activation-signup-link.tsx",
    "lib/invitations/external-referral-signup.ts",
  ];

  it("none of the new modules calls a consent / declaration writer", () => {
    for (const f of files) {
      const src = tsCode(read(f));
      expect(src, f).not.toMatch(
        /grantProfileDiscoverability|grantPartnerSupplyRepresentation|upsertMySupplyDeclaration|reconfirmMySupplyDeclaration|grant_partner_supply|grant_profile_discoverability|upsert_my_first_party/,
      );
      expect(src, f).not.toMatch(/defaultChecked|checked=\{true\}|preferred_countries|preferredCountries/);
    }
  });

  it("the next-step panel has no form control at all", () => {
    expect(tsCode(read("components/app/worker-activation-steps.tsx"))).not.toMatch(
      /<form|<input|<button|<select|onClick|"use client"/,
    );
  });

  it("the privacy page records the referral only from a validated tag and writes no consent", () => {
    const page = tsCode(read("app/[locale]/dashboard/privacy/page.tsx"));
    expect(page).toMatch(/parseContentTag\(referral\)/);
    expect(page).toMatch(/if \(referralTag\)/);
    expect(page).toMatch(/recordInboundReferralSignup\(referralTag\)/);
    expect(page).not.toMatch(/grantProfileDiscoverability|grantPartnerSupplyRepresentation|upsertMySupplyDeclaration/);
  });

  it("the consent text and its pinned hashes were not touched by this flow", () => {
    const defs = read("lib/privacy/consent-definitions.ts");
    // The activation copy lives under privacySelfService.activation, never in a consent text.
    expect(defs).not.toMatch(/activation/i);
  });
});

describe("migration 20261006100000 - an observation, not an acceptance", () => {
  const raw = readRepo("supabase/migrations/20261006100000_external_referral_signup_observation_v1.sql");
  const sql = sqlCode(raw);

  it("ships UNAPPLIED with its rollback and without the owner-gate marker", () => {
    expect(raw.startsWith("-- @human-gate-approved")).toBe(false);
    expect(raw).not.toMatch(/^-- @human-gate-approved/m);
    const down = readRepo(
      "supabase/rollbacks/20261006100000_external_referral_signup_observation_v1.down.sql",
    );
    expect(down).toMatch(/drop function if exists public\.record_external_referral_signup_v1/);
    expect(down).toMatch(/drop function if exists public\.external_referral_observed_signups_v1/);
    expect(down).not.toMatch(/delete\s+from/i);
  });

  it("the writer is authenticated-only; the reader is service_role-only; nothing to anon/public", () => {
    expect(sql).toMatch(
      /grant execute on function public\.record_external_referral_signup_v1\(text, text\) to authenticated/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.external_referral_observed_signups_v1\(text, text\[\]\) from authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.external_referral_observed_signups_v1\(text, text\[\]\) to service_role/,
    );
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(public|anon)\b/i);
    expect(sql).toMatch(/set search_path = public/);
  });

  it("it never accepts, never reads declared_context, never touches profile / skill / consent tables", () => {
    expect(sql).not.toMatch(/declared_context|consent_record|invitation_acceptances|privacy_consent|worker_skills|worker_professions/i);
    expect(sql).not.toMatch(/update\s+public\.invitations|use_count|insert into public\.invitations/i);
    // exactly ONE write: the audit row
    const inserts = sql.match(/insert into\s+[a-z_.]+/gi) ?? [];
    expect(inserts).toEqual(["insert into public.audit_logs"]);
    expect(sql).not.toMatch(/\bdelete\s+from|\btruncate\b|\bdrop\s+table/i);
  });

  it("the reader exposes no account id, e-mail or name", () => {
    const reader = sql.slice(sql.indexOf("external_referral_observed_signups_v1"));
    const returns = reader.slice(reader.indexOf("returns table"), reader.indexOf("language sql"));
    expect(returns).toMatch(/reference\s+text/);
    expect(returns).not.toMatch(/actor|profile|email|name/i);
  });

  it("the writer's reply never says whether an invitation row exists (no existence oracle)", () => {
    const writer = sql.slice(0, sql.indexOf("external_referral_observed_signups_v1"));
    const returned = writer.match(/return jsonb_build_object\([^;]*;/g) ?? [];
    for (const r of returned) expect(r).not.toMatch(/invitation|matched|v_inv/);
  });
});

describe("i18n - the next-step copy exists in every active locale, as non-consent UI strings", () => {
  const keys = [
    "title",
    "intro",
    "stateDone",
    "stateOpen",
    "stateUnknown",
    "go",
    "steps.visibility.title",
    "steps.representation.title",
    "steps.declaration.title",
    "steps.declaration.hint",
    "steps.profile.title",
    "steps.profile.hint",
  ];
  const en = JSON.parse(read("messages/en.json")).privacySelfService.activation;
  const dig = (o: Record<string, unknown>, path: string): unknown =>
    path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], o);

  it.each([...activeLocales])("%s carries every key, non-empty", (locale) => {
    const cat = JSON.parse(read(`messages/${locale}.json`)).privacySelfService.activation;
    for (const k of keys) {
      const v = dig(cat, k);
      expect(typeof v, `${locale}:${k}`).toBe("string");
      expect((v as string).trim().length, `${locale}:${k}`).toBeGreaterThan(0);
    }
  });

  it("every non-English locale is actually translated, not English copied", () => {
    for (const locale of activeLocales.filter((l) => l !== "en")) {
      const cat = JSON.parse(read(`messages/${locale}.json`)).privacySelfService.activation;
      expect(cat.intro, locale).not.toBe(en.intro);
      expect(cat.steps.declaration.title, locale).not.toBe(en.steps.declaration.title);
    }
  });

  it("states plainly that registering switches nothing on (the honesty sentence is in every locale)", () => {
    const needles: Record<string, RegExp> = {
      en: /does not switch anything on/,
      lt: /nieko neįjungia/,
      ru: /ничего не включает/,
      de: /schaltet nichts ein/,
      nl: /schakelt niets in/,
      pl: /niczego nie włącza/,
    };
    for (const locale of activeLocales) {
      const cat = JSON.parse(read(`messages/${locale}.json`)).privacySelfService.activation;
      expect(cat.intro, locale).toMatch(needles[locale]);
    }
  });
});
