"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { completeOnboarding, type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { RoleIcon } from "@/components/app/role-icon";
import { trackFunnel } from "@/lib/telemetry/task";
import { getFirstTouchAttribution } from "@/lib/telemetry/attribution";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  countryOptionMatches,
  countryOptionsForLocale,
} from "@/lib/location/country-options";
import { PROFESSION_SLUGS } from "@/lib/taxonomy/profession-skills";
import {
  FIRST_RUN_INTENTS,
  INTENT_IDENTITY,
  asksForCurrentEducation,
  identitiesForIntents,
  nextPathForIntents,
  type FirstRunIntent,
} from "@/lib/onboarding/first-run-intent";

/** Role cards — the START is intentionally simple (owner directive,
 *  company-role-simplicity-v1): a person either WORKS THEMSELVES or
 *  REPRESENTS A COMPANY. An agency is NOT a root role — it is a company
 *  type ('staffing_agency') picked inside the company profile; the same
 *  goes for a client / requester organisation ('client_customer').
 *  Internal identifiers stay within the DB Role contract. */
const ROLE_CARDS: { key: Role }[] = [{ key: "worker" }, { key: "company" }];

/** Universal first-run router (FIRST REAL ECOSYSTEM USE, 2026-09-03; owner
 *  correction 2026-09-26): the screen asks which parts of the world of work
 *  the person is IN today — contexts, not a role and not an episode of
 *  searching — and maps them onto the two identities above
 *  (lib/onboarding/first-run-intent.ts). Six intents, still two identities:
 *  being part of a company or team is a PERSON (the membership comes from the
 *  organisation model, never from this screen), an agency is a company TYPE,
 *  an education institution is a company CAPABILITY, a student is a person
 *  whose evidence starts in learning. Multi-select stays — one account
 *  carries all of it, and the person can change it later. */
const INTENT_CARDS: readonly FirstRunIntent[] = FIRST_RUN_INTENTS;

/** Icon for an intent card = the icon of the identity it opens. */
const INTENT_ICON_ROLE: Record<FirstRunIntent, Role> = {
  work: "worker",
  member: "worker",
  student: "worker",
  hire: "company",
  agency: "company",
  education: "company",
};

// Country names come from the canonical global country model (Intl-backed,
// localized, no hand-translated catalogue). The select offers EVERY ISO
// country — the active markets (incl. GE and US) first, then the world — with
// NO pre-selected country (PR-G: no silent Lithuania default; the user must
// actively choose). See lib/location/country-options.ts.

/** Person-first onboarding. Two steps: (1) pick one OR MORE roles (the same
 *  person can be a worker, run an agency, and buy services), (2) basic profile
 *  (display name + country). Submits the full role set via completeOnboarding;
 *  the first selected (canonical order) becomes the active workspace. */
export function OnboardingWizard({
  defaultName,
  returnTo,
  educationTypeOptions,
  saidSentence = null,
  defaultIntents = [],
  defaultProfessionSlug = null,
  doorIntents = [],
  doorWords = null,
}: {
  defaultName: string;
  /** Safe internal path (e.g. an invite deep link) that onboarding
   *  completion returns to instead of the role dashboard. */
  returnTo?: string | null;
  /** The person's own landing sentence when it travelled here inside
   *  `returnTo` (`/dashboard?say=…`) — shown back to them, never re-typed. */
  saidSentence?: string | null;
  /** Cards to pre-tick from that sentence (lib/onboarding/landing-handoff):
   *  a DEFAULT the person sees and can untick, not a fact declared for them. */
  defaultIntents?: readonly FirstRunIntent[];
  /** Registry profession the sentence named (exactly one), else null. */
  defaultProfessionSlug?: string | null;
  /** The landing DOOR the person came through, when `returnTo` is exactly
   *  the path the first-run router hands these intents (lib/onboarding/
   *  landing-handoff, `nextPathForIntents` inverted). A door is a default,
   *  not an invitation: the person's final choice decides the destination. */
  doorIntents?: readonly FirstRunIntent[];
  /** That door's plain words (the landing button the person pressed),
   *  resolved on the server — shown back, like the sentence. */
  doorWords?: string | null;
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
  // Every ISO country, active markets first (global-access rule 2026-09-22:
  // MARKET PRIORITY ≠ ACCESS PERMISSION). Measured before this: the select
  // offered the 17 ACTIVE_MARKETS only, so a person in Vietnam, Ireland,
  // Saudi Arabia or the Philippines could not name their own country.
  const countryOptions = useMemo(() => countryOptionsForLocale(locale), [locale]);
  const [step, setStep] = useState<1 | 2>(1);
  // Pre-ticked from the landing sentence when one travelled here; the person
  // still sees the tick, can remove it, and must press Continue.
  const [intents, setIntents] = useState<Set<FirstRunIntent>>(
    () => new Set(defaultIntents),
  );
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
  // Same rule for the work type: no silent default, because a defaulted
  // profession would be a fact nobody stated (§7 — nothing is auto-declared
  // on a person's behalf). The ONE exception is the profession the person
  // themselves named in their landing sentence ("esu suvirintojas…") — that
  // is their statement, pre-chosen in a field they still see and submit.
  // Asked only of a worker; a company-only signup never sees it.
  //
  // A LIST, not one value (owner direction 2026-09-27). "Kokį darbą dirbi?"
  // assumed the person holds exactly one job right now; the same person can be
  // a welder AND a warehouse worker, and `worker_professions` has carried
  // several directions per worker since 0008 (one primary, the rest equal
  // members). The first chosen becomes the primary, exactly as the RPC
  // already decides it.
  const [professionSlugs, setProfessionSlugs] = useState<readonly string[]>(() =>
    defaultProfessionSlug && PROFESSION_SLUGS.includes(defaultProfessionSlug)
      ? [defaultProfessionSlug]
      : [],
  );
  // The add control offers what is not already named — DarkListbox's
  // `{ value, label }` shape, the same idiom the profile's work-directions
  // panel uses (`worker-trade-profile.tsx`).
  const professionsToOffer = useMemo(
    () =>
      professionOptions
        .filter((p) => !professionSlugs.includes(p.slug))
        .map((p) => ({ value: p.slug, label: p.label })),
    [professionOptions, professionSlugs],
  );
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
    // NO profession check. A person may not be working right now, may hold
    // several professions, or may simply not want to name one at the door
    // (owner direction 2026-09-27) — and the platform already reads an
    // occupation off the work itself when none was declared
    // (`bestEvidencedProfession`, guard no-mandatory-profession). An empty
    // field means "not stated here", never "has no profession".
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
    // The primary stays `profession_slug` — the field `complete_onboarding`
    // has always read — and the full list rides beside it, so an older client
    // and this one mean the same thing by the first value.
    if (roles.has("worker") && professionSlugs.length > 0) {
      form.set("profession_slug", professionSlugs[0]);
      form.set("profession_slugs", professionSlugs.join(","));
    }
    // A deep link (invitation) still wins; otherwise a company identity goes
    // straight to the one canonical setup form with the intent's presets.
    // A landing DOOR is not a deep link (window 6, lanes F + C): its path is
    // exactly what its pre-ticked card routes to, so the person's final
    // choice decides — keeping the tick lands on the door's own path, and a
    // corrected choice ("Ieškau darbo" after the institution door) is not
    // dragged back to the organisation setup.
    const cameThroughDoor = doorIntents.length > 0;
    if (returnTo && !cameThroughDoor) form.set("next", returnTo);
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
        // First-touch campaign attribution rides UNDER the explicit keys
        // (2026-09-20): onboarding completion is the END of the campaign →
        // job → registration handoff and was the one step carrying no
        // campaign at all. BOTH success paths merge it, or the redirect path
        // (the usual one) would silently drop the attribution.
        trackFunnel(FUNNEL_EVENTS.onboardingCompleted, {
          ...getFirstTouchAttribution(),
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
            ...getFirstTouchAttribution(),
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
          {/* What the product is FOR, in one line, before any choice — the
              same for a worker, a company, an agency and a school (owner
              correction 2026-09-26: a daily work system, not a search). */}
          <p
            className="text-sm leading-relaxed text-text-secondary"
            data-testid="onboarding-lead"
          >
            {t("rolePicker.intentLead")}
          </p>
          {/*
           * Doctrine §5.5 — no person fits in one category — still holds, and
           * the multi-select promise is still stated BEFORE anything is
           * picked. What changed (owner, 2026-09-23) is how much saying it
           * costs: this used to be a bordered callout carrying three
           * sentences, including an explanation of the person/organisation
           * split. On a 375px screen that pushed the cards themselves below
           * the fold, so the first thing a new person met was a paragraph
           * about the product instead of the choices that ARE the product.
           *
           * The rule is now one short line, and the cards do the explaining.
           * The callout styling is gone with it: a box around a single
           * sentence is chrome, and the brief was explicitly that no second
           * explanation box replaces the first. The person/organisation
           * distinction is not lost — it is carried by the cards and by the
           * workspace model itself, which is where it is real rather than
           * described.
           */}
          <p
            className="text-sm leading-relaxed text-text-secondary"
            data-testid="onboarding-role-multi-note"
          >
            {t("rolePicker.intentNote")}
          </p>
          {/* The landing sentence, shown back (walk-real-person-join,
              2026-09-06): the person is not asked again what they just
              wrote — the matching card is ticked below, and they can change
              it. Nothing is submitted until Continue → Finish. */}
          {saidSentence && (
            <p
              className="text-sm leading-relaxed text-text-secondary"
              data-testid="onboarding-said"
              data-preselected={defaultIntents.length > 0 ? "1" : "0"}
            >
              <span className="text-text-muted">{t("rolePicker.saidLabel")}</span>{" "}
              <span className="font-medium text-text-primary">
                &bdquo;{saidSentence}&ldquo;
              </span>
              {defaultIntents.length > 0 && (
                <>
                  {" "}
                  <span className="text-text-muted">{t("rolePicker.saidHint")}</span>
                </>
              )}
            </p>
          )}
          {/* The landing door, shown back (lanes F + C, 2026-09-06): the
              person who pressed "Atstovauju mokyklai, kolegijai ar
              universitetui" is not asked to guess which card is theirs —
              the card that door routes to is ticked below, with the same
              hint, and they can change it. */}
          {!saidSentence && doorWords && defaultIntents.length > 0 && (
            <p
              className="text-sm leading-relaxed text-text-secondary"
              data-testid="onboarding-door"
              data-preselected="1"
            >
              <span className="text-text-muted">{t("rolePicker.doorLabel")}</span>{" "}
              <span className="font-medium text-text-primary">
                &bdquo;{doorWords}&ldquo;
              </span>{" "}
              <span className="text-text-muted">{t("rolePicker.saidHint")}</span>
            </p>
          )}
        </header>

        {/* Desktop: all six cards share ONE height — the tallest card's —
            across all three rows (`sm:auto-rows-fr` makes every implicit
            row as tall as the tallest, `sm:h-full` makes each card fill its
            cell), so tops and bottoms line up and the gaps stay equal.
            Mobile (one column) keeps each card's natural height. */}
        <ul
          className="grid grid-cols-1 gap-3 sm:auto-rows-fr sm:grid-cols-2"
          data-testid="onboarding-intents"
        >
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
                    "flex w-full items-start gap-3 rounded-md border bg-ink-800 p-4 text-left transition-colors sm:h-full",
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

      {/* SEARCHABLE (owner direction 2026-09-27). The list is every ISO
          country and stays that way — the global-access rule is that a market
          list orders it, never shortens it. What was wrong was the only way
          IN: 249 rows of scrolling, measured on production as a person in
          Germany unable to find Vokietija. Typing "Vok" now answers, through
          the canonical fold and the ONE country resolver
          (`countryOptionMatches`), with no second list of countries anywhere. */}
      {/* A <div>, not a <label>. A `<label>` forwards a click on ANY
          descendant to its labelled control, and `<button>` is labelable — so
          with the listbox inside a label, clicking a country closed the panel
          and the forwarded click on the toggle reopened it immediately
          (measured in Chromium: aria-expanded stayed "true" after a pick).
          A label cannot label a div-based listbox anyway; the control carries
          its own `aria-label`. */}
      <div
        className="flex flex-col gap-1.5 text-xs text-text-secondary"
        data-testid="onboarding-country-field"
      >
        <span>{t("country_label")}</span>
        <DarkListbox
          name="country"
          value={country}
          onChange={setCountry}
          options={countryOptions}
          placeholder={t("country_placeholder")}
          ariaLabel={t("country_label")}
          searchable
          match={countryOptionMatches}
          searchPlaceholder={t("country_search_placeholder")}
          searchEmptyLabel={t("country_search_empty")}
          testId="onboarding-country"
        />
      </div>

      {/* WHAT WORK THIS PERSON DOES — asked here because this is the moment
          of highest intent, and because it is the field the rest of the
          product reads: the match engine's subject, the profile-directed pool
          of external ads and the CV work direction.

          ASKED, NEVER REQUIRED, AND NEVER JUST ONE (owner direction
          2026-09-27). Three things were wrong with asking it as one mandatory
          pick. It assumed the person is working right now — somebody between
          jobs had to name a job to get through the door. It assumed ONE — the
          same person can be a welder and a warehouse worker, and
          `worker_professions` has held several directions per worker since
          0008. And a first answer read as a lock on a profile the person had
          not built yet.

          Registry values, from the platform's own 49-row `professions` table,
          sorted by the LOCALIZED label so the list reads alphabetically in the
          language on screen. A profession the registry does not carry cannot
          be stored anywhere today — `worker_professions.profession_id` is a
          foreign key, and there is no person-scoped free-text occupation
          column in the schema — so the field offers what it can honestly keep
          and nothing it would silently drop. */}
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
        <div
          className="flex flex-col gap-1.5 text-xs text-text-secondary"
          data-testid="onboarding-profession-field"
        >
          <span>{t("profession_label")}</span>
          {/* What the person has named so far — each one removable, so a
              mistaken pick is not a trap and the list is theirs to shape. */}
          {professionSlugs.length > 0 && (
            <ul
              className="flex flex-wrap gap-2"
              data-testid="onboarding-profession-chosen"
            >
              {professionSlugs.map((slug) => (
                <li key={slug}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-brand-blue/30 bg-brand-blue/10 py-1 pl-3 pr-1 text-sm text-text-primary">
                    {tProfession(slug)}
                    <button
                      type="button"
                      onClick={() =>
                        setProfessionSlugs((prev) =>
                          prev.filter((s) => s !== slug),
                        )
                      }
                      aria-label={t("profession_remove")}
                      data-testid={`onboarding-profession-remove-${slug}`}
                      className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-text-muted transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {professionsToOffer.length > 0 && (
            <DarkListbox
              value=""
              onChange={(slug) =>
                slug &&
                setProfessionSlugs((prev) =>
                  prev.includes(slug) ? prev : [...prev, slug],
                )
              }
              options={professionsToOffer}
              placeholder={t("profession_placeholder")}
              ariaLabel={t("profession_label")}
              searchable
              searchPlaceholder={t("profession_search_placeholder")}
              searchEmptyLabel={t("profession_search_empty")}
              testId="onboarding-profession"
            />
          )}
          <span className="text-meta leading-relaxed text-text-muted">
            {t("profession_hint")}
          </span>
        </div>
      )}

      {/* Landing→profile continuity (DESIGN.md): honestly preview the real
          profile the user builds next, so the first post-CTA screen does not
          feel weaker than the premium landing. Concept labels only — no fake
          data, nothing auto-verified. */}
      <div
        className="card-border flex flex-col gap-3 p-4"
        data-testid="onboarding-next-steps"
      >
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
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
