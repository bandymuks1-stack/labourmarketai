"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { completeOnboarding, type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { RoleIcon } from "@/components/app/role-icon";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { ACTIVE_MARKETS } from "@/lib/taxonomy/work-categories";
import { countryDisplayName } from "@/lib/location/country-model";
import { PROFESSION_SLUGS } from "@/lib/taxonomy/profession-skills";
import {
  FIRST_RUN_INTENTS,
  INTENT_IDENTITY,
  asksForCurrentEducation,
  identitiesForIntents,
  nextPathForIntents,
  professionRequiredForIntents,
  type FirstRunIntent,
} from "@/lib/onboarding/first-run-intent";

/** Role cards — the START is intentionally simple (owner directive,
 *  company-role-simplicity-v1): a person either WORKS THEMSELVES or
 *  REPRESENTS A COMPANY. An agency is NOT a root role — it is a company
 *  type ('staffing_agency') picked inside the company profile; the same
 *  goes for a client / requester organisation ('client_customer').
 *  Internal identifiers stay within the DB Role contract. */
const ROLE_CARDS: { key: Role }[] = [{ key: "worker" }, { key: "company" }];

/** Universal first-run router (FIRST REAL ECOSYSTEM USE, 2026-09-03): the
 *  screen asks WHAT THE PERSON CAME TO DO, in their words, and maps the answer
 *  onto the two identities above (lib/onboarding/first-run-intent.ts). Five
 *  intents, still two identities: an agency is a company TYPE, an education
 *  institution is a company CAPABILITY, a student is a person whose evidence
 *  starts in learning. Multi-select stays — one account carries all of it. */
const INTENT_CARDS: readonly FirstRunIntent[] = FIRST_RUN_INTENTS;

/** Icon for an intent card = the icon of the identity it opens. */
const INTENT_ICON_ROLE: Record<FirstRunIntent, Role> = {
  work: "worker",
  student: "worker",
  hire: "company",
  agency: "company",
  education: "company",
};

// Country names come from the canonical global country model (Intl-backed,
// localized, no hand-translated catalogue). The select offers the ACTIVE
// markets — incl. GE and US — with NO pre-selected country (PR-G: no silent
// Lithuania default; the user must actively choose).

/** Person-first onboarding. Two steps: (1) pick one OR MORE roles (the same
 *  person can be a worker, run an agency, and buy services), (2) basic profile
 *  (display name + country). Submits the full role set via completeOnboarding;
 *  the first selected (canonical order) becomes the active workspace. */
export function OnboardingWizard({
  defaultName,
  returnTo,
  educationTypeOptions,
}: {
  defaultName: string;
  /** Safe internal path (e.g. an invite deep link) that onboarding
   *  completion returns to instead of the role dashboard. */
  returnTo?: string | null;
  /** Education-type registry labels, resolved on the SERVER (the
   *  `cvSections.educationTypes` namespace is not part of the auth client
   *  message allowlist, and must not be — the wizard ships ~31 KB, not the
   *  CV tree). Order = registry order. */
  educationTypeOptions: ReadonlyArray<{ slug: string; label: string }>;
}) {
  const t = useTranslations("auth.onboarding");
  const tProfession = useTranslations("professions");
  const locale = useLocale();

  // Registry slugs → the label in the language on screen, ordered by that
  // label. `useMemo` because the collator and 49 lookups should not re-run on
  // every keystroke in the name field.
  const professionOptions = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return PROFESSION_SLUGS.map((slug) => ({
      slug,
      label: tProfession(slug),
    })).sort((a, b) => collator.compare(a.label, b.label));
  }, [locale, tProfession]);
  const [step, setStep] = useState<1 | 2>(1);
  const [intents, setIntents] = useState<Set<FirstRunIntent>>(() => new Set());
  // The identities the chosen intents open — the DB Role contract stays
  // worker / company; nothing else is ever submitted as a role.
  const roles = useMemo<Set<Role>>(
    () => new Set<Role>(identitiesForIntents([...intents])),
    [intents],
  );
  const intentList = useMemo(() => [...intents], [intents]);
  const [displayName, setDisplayName] = useState(defaultName);
  // No pre-selected country — the user chooses (placeholder until they do).
  const [country, setCountry] = useState<string>("");
  // Same rule for the work type: no default, because a defaulted profession
  // would be a fact nobody stated (§7 — nothing is auto-declared on a person's
  // behalf). Asked only of a worker; a company-only signup never sees it.
  const [professionSlug, setProfessionSlug] = useState<string>("");
  // Student intent: WHERE the person studies becomes a real, current
  // education record (the canonical "I am studying" state) — asked only when
  // that intent is picked, never declared on anyone's behalf.
  const [institutionName, setInstitutionName] = useState<string>("");
  const [programOrField, setProgramOrField] = useState<string>("");
  const [educationTypeSlug, setEducationTypeSlug] = useState<string>("other");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Activation funnel (P0-A): the wizard mounting = onboarding started.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackFunnel(FUNNEL_EVENTS.onboardingStarted);
  }, []);

  function toggleIntent(i: FirstRunIntent) {
    setIntents((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else {
        next.add(i);
        // Identity-selection funnel signal (Pre-Advertising Launch
        // Readiness v1): fire only when an intent is ADDED, carrying the
        // coarse identity it opens and the intent itself — never any
        // identifying value.
        trackFunnel(FUNNEL_EVENTS.roleSelected, {
          role_context: INTENT_IDENTITY[i],
          intent: i,
        });
      }
      return next;
    });
  }

  function submit() {
    if (roles.size === 0) return;
    setError(null);
    if (!displayName.trim()) {
      setError(t("error_name_required"));
      return;
    }
    if (!country) {
      setError(t("error_country_required"));
      return;
    }
    if (roles.has("worker") && !professionSlug && professionRequiredForIntents(intentList)) {
      setError(t("error_profession_required"));
      return;
    }
    if (asksForCurrentEducation(intentList) && institutionName.trim().length < 2) {
      setError(t("step2.errorInstitution"));
      return;
    }
    const form = new FormData();
    form.set("intents", intentList.join(","));
    if (asksForCurrentEducation(intentList)) {
      form.set("institution_name", institutionName.trim());
      form.set("program_or_field", programOrField.trim());
      form.set("education_type_slug", educationTypeSlug);
    }
    // canonical order keeps the chosen primary deterministic server-side
    form.set(
      "roles",
      ROLE_CARDS.map((c) => c.key).filter((k) => roles.has(k)).join(","),
    );
    form.set("locale", locale);
    form.set("display_name", displayName.trim());
    form.set("country", country);
    if (roles.has("worker") && professionSlug) {
      form.set("profession_slug", professionSlug);
    }
    // A deep link (invitation) still wins; otherwise a company identity goes
    // straight to the one canonical setup form with the intent's presets.
    if (returnTo) form.set("next", returnTo);
    else {
      const routedNext = nextPathForIntents(intentList);
      if (routedNext) form.set("next", routedNext);
    }
    // Primary role = first selected in canonical order (mirrors the
    // server-side primary derivation). Coarse, non-identifying.
    const primaryRole = ROLE_CARDS.map((c) => c.key).find((k) =>
      roles.has(k),
    );
    // Per-step drop-off signal (Pilot Onboarding and Measurement v1): the
    // profile step was filled in and SUBMITTED with valid inputs. Server
    // confirmation stays a separate event (onboarding_completed), so
    // "submitted but failed server-side" remains distinguishable from
    // "abandoned the form". Bounded metadata only — never PII.
    trackFunnel(FUNNEL_EVENTS.onboardingStepProfileCompleted, {
      step: "profile",
      role_context: primaryRole,
      intent: intentList.join(","),
    });
    start(async () => {
      try {
        await completeOnboarding(form);
        // Reached only if the runtime resolves the action instead of
        // throwing NEXT_REDIRECT — exactly one of these two success
        // paths runs, so the event never double-fires.
        trackFunnel(FUNNEL_EVENTS.onboardingCompleted, {
          role_context: primaryRole,
          // The precise actor (student / education / agency …) — without it
          // the TTFV bucketing only had the coarse identity on this row.
          intent: intentList.join(","),
        });
      } catch (e) {
        // A successful onboarding ends in a server-side redirect
        // (NEXT_REDIRECT throws), so this branch — not code after the
        // await — is the reliable success signal. trackFunnel is
        // fire-and-forget, safe before the rethrow.
        if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) {
          trackFunnel(FUNNEL_EVENTS.onboardingCompleted, {
            role_context: primaryRole,
            intent: intentList.join(","),
          });
          throw e;
        }
        console.error("[onboarding] completeOnboarding failed:", e);
        setError(t("error_generic"));
      }
    });
  }

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  if (step === 1) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("rolePicker.intentHeading")}
          </h1>
          {/*
           * Premium-impression cleanup v1: the multi-role promise was
           * previously a quiet `text-sm text-text-secondary` line under
           * the heading. Doctrine §5.5 says no person fits in one
           * category — each person carries a portfolio of engagements.
           * The promise must be visible BEFORE the user picks, so it is
           * now a bordered callout that the eye reads with the cards,
           * not before them. Copy unchanged — same i18n key, same text.
           */}
          <p
            className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm leading-relaxed text-text-secondary"
            data-testid="onboarding-role-multi-note"
          >
            {t("rolePicker.intentNote")}
          </p>
        </header>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="onboarding-intents">
          {INTENT_CARDS.map((intent) => {
            const selected = intents.has(intent);
            return (
              <li key={intent}>
                <button
                  type="button"
                  onClick={() => toggleIntent(intent)}
                  aria-pressed={selected}
                  data-testid={`onboarding-intent-${intent}`}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border bg-ink-800 p-4 text-left transition-colors",
                    selected
                      ? "border-brand-orange ring-1 ring-brand-orange"
                      : "border-ink-500 hover:border-text-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border text-meta",
                      selected
                        ? "border-brand-orange bg-brand-orange text-ink-900"
                        : "border-ink-500 text-transparent",
                    )}
                  >
                    ✓
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <RoleIcon
                        role={INTENT_ICON_ROLE[intent]}
                        className="h-5 w-5 text-text-secondary"
                      />
                      <span className="font-display text-sm font-semibold text-text-primary">
                        {t(`rolePicker.intent.${intent}.title`)}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-text-muted">
                      {t(`rolePicker.intent.${intent}.desc`)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="rounded-md border border-ink-500 bg-ink-700/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
          {t("rolePicker.infoBox")}
        </p>

        <Button
          type="button"
          disabled={intents.size === 0}
          data-testid="onboarding-intents-continue"
          onClick={() => {
            // Per-step drop-off signal (Pilot Onboarding and Measurement
            // v1): the role step is DONE the moment the user advances.
            // Bounded metadata only — a coarse step label + the intent set.
            trackFunnel(FUNNEL_EVENTS.onboardingStepRoleCompleted, {
              step: "role",
              intent: intentList.join(","),
            });
            setStep(2);
          }}
          className="w-full rounded-xl sm:w-auto sm:self-start"
        >
          {t("rolePicker.continue")}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("step2.heading")}
        </h1>
      </header>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("display_name_label")}
        <input
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {t("country_label")}
        <select
          name="country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          required
          className={inputCls}
        >
          <option value="" disabled>
            {t("country_placeholder")}
          </option>
          {ACTIVE_MARKETS.map((c) => (
            <option key={c} value={c}>
              {countryDisplayName(c, locale)}
            </option>
          ))}
        </select>
      </label>

      {/* WHAT WORK THIS PERSON DOES — asked here because this is the moment
          of highest intent, and because it is the single field the rest of the
          product needs: the match engine's subject, the profile-directed pool
          of external ads and the CV work direction all read it. The RPC has
          accepted it since the M1 C-scope migration; the form simply never
          asked, and production shows the result — 26 of 36 workers have a
          country (asked) and 4 have a profession (not asked).

          Closed set, from the platform's own registry. Sorted by the LOCALIZED
          label, so the list reads alphabetically in the language on screen
          rather than in slug order. */}
      {asksForCurrentEducation(intentList) && (
        <fieldset
          className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800 p-4"
          data-testid="onboarding-student-fields"
        >
          <legend className="px-1 font-display text-sm font-semibold text-text-primary">
            {t("step2.studentHeading")}
          </legend>
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            {t("step2.institutionLabel")}
            <input
              name="institution_name"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder={t("step2.institutionPlaceholder")}
              required
              minLength={2}
              maxLength={200}
              data-testid="onboarding-institution"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            {t("step2.programLabel")}
            <input
              name="program_or_field"
              value={programOrField}
              onChange={(e) => setProgramOrField(e.target.value)}
              maxLength={200}
              data-testid="onboarding-program"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            {t("step2.educationTypeLabel")}
            <select
              name="education_type_slug"
              value={educationTypeSlug}
              onChange={(e) => setEducationTypeSlug(e.target.value)}
              data-testid="onboarding-education-type"
              className={inputCls}
            >
              {educationTypeOptions.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}

      {roles.has("worker") && (
        <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
          {t("profession_label")}
          <select
            name="profession_slug"
            value={professionSlug}
            onChange={(e) => setProfessionSlug(e.target.value)}
            required={professionRequiredForIntents(intentList)}
            data-testid="onboarding-profession"
            className={inputCls}
          >
            <option value="" disabled>
              {t("profession_placeholder")}
            </option>
            {professionOptions.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-meta leading-relaxed text-text-muted">
            {t("profession_hint")}
          </span>
        </label>
      )}

      {/* Landing→profile continuity (DESIGN.md): honestly preview the real
          profile the user builds next, so the first post-CTA screen does not
          feel weaker than the premium landing. Concept labels only — no fake
          data, nothing auto-verified. */}
      <div
        className="card-border flex flex-col gap-3 p-4"
        data-testid="onboarding-next-steps"
      >
        <p className="font-mono text-meta uppercase tracking-label text-brand-cyan">
          {t("nextSteps.eyebrow")}
        </p>
        <ul className="flex flex-col gap-2">
          {(["s1", "s2", "s3", "s4"] as const).map((k, i) => (
            <li
              key={k}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary"
            >
              <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border border-brand-blue/30 bg-brand-blue/10 font-mono text-meta font-semibold text-brand-blue">
                {i + 1}
              </span>
              {t(`nextSteps.${k}`)}
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-text-muted">
          {t("nextSteps.note")}
        </p>
      </div>

      {error && (
        <p className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl sm:w-auto"
        >
          {pending ? t("saving") : t("step2.continue")}
        </Button>
        <button
          type="button"
          onClick={() => setStep(1)}
          disabled={pending}
          className="text-xs text-text-muted hover:text-text-secondary disabled:opacity-60"
        >
          {t("back")}
        </button>
      </div>
    </form>
  );
}
