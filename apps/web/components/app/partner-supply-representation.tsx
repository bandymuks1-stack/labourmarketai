"use client";

import { useState, useTransition } from "react";

import {
  grantPartnerSupplyRepresentation,
  reconfirmMySupplyDeclaration,
  upsertMySupplyDeclaration,
  withdrawMySupplyDeclaration,
  withdrawPartnerSupplyRepresentation,
  type PartnerSupplyState,
} from "@/lib/privacy/partner-supply-actions";
import type { ConsentLegalTexts } from "@/components/app/discoverability-consent";

/**
 * Representation outside LabourMarket.ai — the worker's own control.
 *
 * TWO ACTS, IN THIS ORDER, AND THE ORDER IS THE POINT
 * ---------------------------------------------------------------------------
 * 1. the CONSENT — "you may represent me through approved partner
 *    infrastructure" — a legal act against a versioned, hashed text, landing in
 *    the append-only consent ledger. This is MATCH authority.
 * 2. the DECLARATION — current intent, where they may legally work, where they
 *    agree to be offered, and which of contact / presentation / naming they
 *    permit. This is the SCOPE of the act.
 *
 * A declaration alone exports nothing: the feed joins on the consent predicate.
 * So the consent is asked first and the form appears after it — a person cannot
 * end up scoped-but-not-consenting, and no code path here can reverse that,
 * because the filter lives in the database.
 *
 * FOUR AUTHORITIES, FOUR ANSWERS
 * ---------------------------------------------------------------------------
 * The screen states, in the person's own language, that being MATCHED reveals
 * nothing: a match is a count and an opaque reference. Being CONTACTED, being
 * PRESENTED to an audience, and being NAMED are three further permissions that
 * this form asks for separately and that all start OFF. The common real case is
 * a worker who wants matching and contact but not a public post carrying their
 * name — visible to a current employer.
 *
 * DEFAULT DENY, AND NO FABRICATED DEFAULTS (guarded by
 * partner-supply-consent-ux.test.ts)
 * ---------------------------------------------------------------------------
 * - no checkbox is ever pre-ticked, and the three authority checkboxes have no
 *   `defaultChecked` at all;
 * - no work-seeking intent is preselected — the person picks one or the form
 *   will not submit;
 * - countries are NEVER prefilled from `workers.preferred_countries`. That is a
 *   preference; this asks where they may LEGALLY work and where they AGREE to
 *   be offered, which are two different questions with two different
 *   consequences, and answering them from a third field would be fabricating
 *   consent;
 * - granting and declining are two buttons of equal weight; declining writes
 *   nothing;
 * - withdrawal lives on the same screen and takes one click.
 *
 * Honest degradation throughout: `needs-migration` and error states are plain
 * text, never a fake success.
 */

export interface PartnerSupplyLabels {
  sectionIntro: string;
  noWorkerProfile: string;

  statusNotRepresented: string;
  statusNotRepresentedBody: string;
  statusRepresented: string;
  statusConsentOnly: string;
  statusWithdrawn: string;
  statusStale: string;
  statusAgeing: string;
  statusExpired: string;

  authoritiesTitle: string;
  authorityMatch: string;
  authorityMatchBody: string;
  authorityContact: string;
  authorityContactBody: string;
  authorityPresentation: string;
  authorityPresentationBody: string;
  authorityIdentity: string;
  authorityIdentityBody: string;
  matchNeverReveals: string;

  grant: string;
  decline: string;
  declinedNote: string;
  manage: string;
  withdrawConsent: string;

  formTitle: string;
  intentLabel: string;
  intentAvailableNow: string;
  intentAvailableFrom: string;
  intentOpenToOffers: string;
  intentLookingForWork: string;
  intentLookingForProjects: string;
  availableFromLabel: string;
  workCountriesLabel: string;
  workCountriesHelp: string;
  marketsLabel: string;
  marketsHelp: string;
  validDaysLabel: string;
  validDaysHelp: string;
  save: string;
  saving: string;
  saved: string;
  edit: string;
  cancel: string;

  currentTitle: string;
  currentIntent: string;
  currentAvailableFrom: string;
  currentWorkCountries: string;
  currentMarkets: string;
  currentValidUntil: string;
  currentReconfirmedAt: string;
  currentAuthorities: string;
  granted: string;
  denied: string;
  unknown: string;

  reconfirm: string;
  reconfirmed: string;
  withdrawDeclaration: string;
  withdrawnDeclarationNote: string;

  needsMigration: string;
  errorGeneric: string;
  errorUnknownIntent: string;
  errorAvailableFromRequired: string;
  errorCountriesRequired: string;
  errorNotIso2: string;
  errorMarketOutside: string;
  errorValidity: string;
}

const INTENTS = [
  "AVAILABLE_NOW",
  "AVAILABLE_FROM",
  "OPEN_TO_OFFERS",
  "LOOKING_FOR_WORK",
  "LOOKING_FOR_PROJECTS",
] as const;
type Intent = (typeof INTENTS)[number];

/** "LT, de , NL" -> ["LT","DE","NL"]. Rejection of a bad code is the RPC's job,
 *  and it REFUSES rather than dropping — silently discarding a country a person
 *  typed would narrow their reach without telling them. */
function parseCountries(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c !== "");
}

export function PartnerSupplyRepresentation({
  locale,
  state,
  legal,
  labels,
}: {
  locale: string;
  state: PartnerSupplyState;
  legal: ConsentLegalTexts;
  labels: PartnerSupplyLabels;
}) {
  const declaration = state.declaration;

  const [phase, setPhase] = useState<
    "idle" | "expanded" | "declined" | "needs-migration" | "error"
  >("idle");
  const [consentGranted, setConsentGranted] = useState(
    state.consentStatus === "granted",
  );
  const [editing, setEditing] = useState(false);
  const [savedNote, setSavedNote] = useState<"saved" | "reconfirmed" | "withdrawn" | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Existing answers are the person's OWN, so editing prefills from them.
  // Nothing is ever prefilled from a different field.
  const [intent, setIntent] = useState<Intent | "">(
    (declaration?.intentState as Intent | undefined) ?? "",
  );
  const [availableFrom, setAvailableFrom] = useState(declaration?.availableFrom ?? "");
  const [workCountries, setWorkCountries] = useState(
    (declaration?.workAuthorisedCountries ?? []).join(", "),
  );
  const [markets, setMarkets] = useState((declaration?.allowedMarkets ?? []).join(", "));
  const [contactAuthority, setContactAuthority] = useState(
    declaration?.contactAuthority ?? false,
  );
  const [publicationAuthority, setPublicationAuthority] = useState(
    declaration?.publicationAuthority ?? false,
  );
  const [identityDisclosureAuthority, setIdentityDisclosureAuthority] = useState(
    declaration?.identityDisclosureAuthority ?? false,
  );
  const [validDays, setValidDays] = useState(60);

  function errorLabel(reason: string): string {
    switch (reason) {
      case "unknown_intent_state":
        return labels.errorUnknownIntent;
      case "available_from_required":
        return labels.errorAvailableFromRequired;
      case "work_authorised_countries_required":
        return labels.errorCountriesRequired;
      case "country_code_not_iso2":
        return labels.errorNotIso2;
      case "market_outside_work_authorisation":
        return labels.errorMarketOutside;
      case "invalid_validity_window":
        return labels.errorValidity;
      default:
        return labels.errorGeneric;
    }
  }

  function onGrantConsent() {
    startTransition(async () => {
      const res = await grantPartnerSupplyRepresentation({ locale });
      if (res.kind === "ok") {
        setConsentGranted(true);
        setPhase("idle");
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
      else setPhase("error");
    });
  }

  function onWithdrawConsent() {
    startTransition(async () => {
      const res = await withdrawPartnerSupplyRepresentation();
      if (res.kind === "ok") {
        // Withdrawing the consent also stops the declaration being emitted —
        // the RPC stamps it withdrawn in the same transaction, so the screen
        // must not keep showing "represented".
        setConsentGranted(false);
        setSavedNote("withdrawn");
        setEditing(false);
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
      else setPhase("error");
    });
  }

  function onSave() {
    setFormError(null);
    if (intent === "") {
      setFormError(labels.errorUnknownIntent);
      return;
    }
    startTransition(async () => {
      const res = await upsertMySupplyDeclaration({
        intentState: intent,
        availableFrom: intent === "AVAILABLE_FROM" ? (availableFrom || null) : null,
        workAuthorisedCountries: parseCountries(workCountries),
        allowedMarkets: parseCountries(markets),
        // No canonical channel consent exists yet, and an empty list means NONE
        // rather than "all" on both ends of the contract.
        allowedChannels: [],
        contactAuthority,
        publicationAuthority,
        identityDisclosureAuthority,
        validDays,
      });
      if (res.kind === "ok") {
        setSavedNote("saved");
        setEditing(false);
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
      else if (res.kind === "invalid") setFormError(errorLabel(res.reason));
      else setFormError(labels.errorGeneric);
    });
  }

  function onReconfirm() {
    startTransition(async () => {
      const res = await reconfirmMySupplyDeclaration(60);
      if (res.kind === "ok") setSavedNote("reconfirmed");
      else if (res.kind === "needs-migration") setPhase("needs-migration");
      else setFormError(labels.errorGeneric);
    });
  }

  function onWithdrawDeclaration() {
    startTransition(async () => {
      const res = await withdrawMySupplyDeclaration();
      if (res.kind === "ok") {
        setSavedNote("withdrawn");
        setEditing(false);
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
      else setFormError(labels.errorGeneric);
    });
  }

  if (state.kind === "needs-migration" || phase === "needs-migration") {
    return (
      <p className="text-sm text-text-secondary" data-testid="partner-supply-unavailable">
        {labels.needsMigration}
      </p>
    );
  }

  /** The four authorities, named and separated, with the one sentence that
   *  keeps a match from being read as a disclosure. */
  const authoritiesBlock = (
    <div
      className="mt-4 rounded-md border border-ink-500 bg-ink-800/30 p-4"
      data-testid="partner-supply-authorities"
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {labels.authoritiesTitle}
      </p>
      <dl className="mt-2 flex flex-col gap-2 text-sm">
        <div>
          <dt className="text-text-primary">{labels.authorityMatch}</dt>
          <dd className="text-text-secondary">{labels.authorityMatchBody}</dd>
        </div>
        <div>
          <dt className="text-text-primary">{labels.authorityContact}</dt>
          <dd className="text-text-secondary">{labels.authorityContactBody}</dd>
        </div>
        <div>
          <dt className="text-text-primary">{labels.authorityPresentation}</dt>
          <dd className="text-text-secondary">{labels.authorityPresentationBody}</dd>
        </div>
        <div>
          <dt className="text-text-primary">{labels.authorityIdentity}</dt>
          <dd className="text-text-secondary">{labels.authorityIdentityBody}</dd>
        </div>
      </dl>
      <p
        className="mt-3 text-sm font-medium text-text-primary"
        data-testid="partner-supply-match-never-reveals"
      >
        {labels.matchNeverReveals}
      </p>
    </div>
  );

  const legalBlock = (
    <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-text-primary">
      <p>{legal.summary}</p>
      <p>{legal.visibleData}</p>
      <p>{legal.invisibleData}</p>
      <p className="text-text-secondary">{legal.freedom}</p>
      <p className="text-text-secondary">{legal.withdrawal}</p>
      {/* GDPR Art. 13(1)(a): controller identity shown WITH the consent text. */}
      <p className="text-text-secondary" data-testid="partner-supply-controller">
        {legal.controller}
      </p>
    </div>
  );

  // ---------------------------------------------------------------- consent
  if (!consentGranted) {
    const stale = state.consentStatus === "granted_stale_version";
    const withdrawn = state.consentStatus === "withdrawn" || savedNote === "withdrawn";
    return (
      <div data-testid="partner-supply-choice">
        <p className="text-sm font-medium text-text-primary">
          {stale
            ? labels.statusStale
            : withdrawn
              ? labels.statusWithdrawn
              : labels.statusNotRepresented}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {labels.statusNotRepresentedBody}
        </p>

        {phase === "declined" ? (
          <p
            className="mt-3 text-sm text-text-secondary"
            data-testid="partner-supply-declined"
          >
            {labels.declinedNote}
          </p>
        ) : phase !== "expanded" ? (
          <button
            type="button"
            onClick={() => setPhase("expanded")}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-brand-blue/40 px-4 text-sm font-medium text-brand-blue hover:border-brand-blue"
            data-testid="partner-supply-open"
          >
            {legal.title}
          </button>
        ) : (
          <div>
            <h3 className="mt-4 text-base font-semibold text-text-primary">
              {legal.title}
            </h3>
            {legalBlock}
            {authoritiesBlock}
            {/* Two EQUAL choices — same classes, same weight. Declining writes
                nothing and removes nothing. */}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onGrantConsent}
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
                data-testid="partner-supply-grant"
              >
                {labels.grant}
              </button>
              <button
                type="button"
                onClick={() => setPhase("declined")}
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
                data-testid="partner-supply-decline"
              >
                {labels.decline}
              </button>
            </div>
          </div>
        )}
        {phase === "error" && (
          <p className="mt-2 text-sm text-text-secondary">{labels.errorGeneric}</p>
        )}
      </div>
    );
  }

  // ------------------------------------------------- consent granted: scope
  const live = declaration !== null && declaration.withdrawnAt === null;
  const freshness = declaration?.freshness ?? null;
  const showForm = editing || !live || savedNote === "withdrawn";

  const statusLine =
    savedNote === "withdrawn"
      ? labels.withdrawnDeclarationNote
      : !live
        ? labels.statusConsentOnly
        : freshness === "EXPIRED"
          ? labels.statusExpired
          : freshness === "AGEING"
            ? labels.statusAgeing
            : labels.statusRepresented;

  const yesNo = (v: boolean) => (v ? labels.granted : labels.denied);

  return (
    <div data-testid="partner-supply-managed">
      <p
        className="text-sm font-medium text-text-primary"
        data-testid="partner-supply-status"
      >
        {statusLine}
      </p>

      {!state.hasWorkerProfile && (
        <p
          className="mt-2 text-sm text-text-secondary"
          data-testid="partner-supply-no-worker"
        >
          {labels.noWorkerProfile}
        </p>
      )}

      {/* Current answers, when there are any. Never invented: a field the
          person did not answer reads as unknown rather than as a value. */}
      {live && !showForm && (
        <dl
          className="mt-3 flex flex-col gap-1 text-sm"
          data-testid="partner-supply-current"
        >
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.currentTitle}
          </p>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">{labels.currentIntent}</dt>
            <dd className="text-text-primary" data-testid="partner-supply-current-intent">
              {declaration?.intentState ?? labels.unknown}
            </dd>
          </div>
          {declaration?.availableFrom && (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-text-muted">{labels.currentAvailableFrom}</dt>
              <dd className="text-text-primary">{declaration.availableFrom}</dd>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">{labels.currentWorkCountries}</dt>
            <dd className="text-text-primary">
              {declaration && declaration.workAuthorisedCountries.length > 0
                ? declaration.workAuthorisedCountries.join(", ")
                : labels.unknown}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">{labels.currentMarkets}</dt>
            <dd className="text-text-primary" data-testid="partner-supply-current-markets">
              {declaration && declaration.allowedMarkets.length > 0
                ? declaration.allowedMarkets.join(", ")
                : labels.unknown}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">{labels.currentReconfirmedAt}</dt>
            <dd className="text-text-primary">
              {declaration?.reconfirmedAt?.slice(0, 10) ?? labels.unknown}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">{labels.currentValidUntil}</dt>
            <dd className="text-text-primary">
              {declaration?.validUntil?.slice(0, 10) ?? labels.unknown}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-muted">{labels.currentAuthorities}</dt>
            <dd
              className="text-text-primary"
              data-testid="partner-supply-current-authorities"
            >
              {labels.authorityContact}: {yesNo(declaration?.contactAuthority ?? false)} ·{" "}
              {labels.authorityPresentation}:{" "}
              {yesNo(declaration?.publicationAuthority ?? false)} ·{" "}
              {labels.authorityIdentity}:{" "}
              {yesNo(declaration?.identityDisclosureAuthority ?? false)}
            </dd>
          </div>
        </dl>
      )}

      {savedNote === "saved" && (
        <p className="mt-2 text-sm text-text-secondary" data-testid="partner-supply-saved">
          {labels.saved}
        </p>
      )}
      {savedNote === "reconfirmed" && (
        <p
          className="mt-2 text-sm text-text-secondary"
          data-testid="partner-supply-reconfirmed"
        >
          {labels.reconfirmed}
        </p>
      )}

      {/* Reconfirmation: offered exactly when the answer is old enough to want
          it, so the button is a real prompt rather than permanent furniture. */}
      {live && !showForm && (freshness === "AGEING" || freshness === "EXPIRED") && (
        <button
          type="button"
          onClick={onReconfirm}
          disabled={pending}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-brand-blue/40 px-4 text-sm font-medium text-brand-blue hover:border-brand-blue disabled:opacity-60"
          data-testid="partner-supply-reconfirm"
        >
          {labels.reconfirm}
        </button>
      )}

      {showForm ? (
        <div className="mt-4" data-testid="partner-supply-form">
          <h3 className="text-base font-semibold text-text-primary">{labels.formTitle}</h3>

          <fieldset className="mt-3">
            <legend className="font-mono text-meta uppercase tracking-label text-text-muted">
              {labels.intentLabel}
            </legend>
            {/* NOTHING is preselected. A work-seeking intent is a claim about a
                person, and a default would make that claim for them. */}
            <div className="mt-2 flex flex-col gap-1">
              {INTENTS.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="partner-supply-intent"
                    value={value}
                    checked={intent === value}
                    onChange={() => setIntent(value)}
                    data-testid={`partner-supply-intent-${value}`}
                  />
                  <span className="text-text-primary">
                    {value === "AVAILABLE_NOW"
                      ? labels.intentAvailableNow
                      : value === "AVAILABLE_FROM"
                        ? labels.intentAvailableFrom
                        : value === "OPEN_TO_OFFERS"
                          ? labels.intentOpenToOffers
                          : value === "LOOKING_FOR_WORK"
                            ? labels.intentLookingForWork
                            : labels.intentLookingForProjects}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {intent === "AVAILABLE_FROM" && (
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="font-mono uppercase tracking-label text-text-muted">
                {labels.availableFromLabel}
              </span>
              <input
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="w-fit rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
                data-testid="partner-supply-available-from"
              />
            </label>
          )}

          {/* Two country questions, deliberately apart and deliberately not
              prefilled from `preferred_countries`. */}
          <label className="mt-3 flex flex-col gap-1 text-xs">
            <span className="font-mono uppercase tracking-label text-text-muted">
              {labels.workCountriesLabel}
            </span>
            <input
              type="text"
              value={workCountries}
              onChange={(e) => setWorkCountries(e.target.value)}
              placeholder="LT, DE, NL"
              className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm uppercase text-text-primary"
              data-testid="partner-supply-work-countries"
            />
            <span className="text-text-muted normal-case">{labels.workCountriesHelp}</span>
          </label>

          <label className="mt-3 flex flex-col gap-1 text-xs">
            <span className="font-mono uppercase tracking-label text-text-muted">
              {labels.marketsLabel}
            </span>
            <input
              type="text"
              value={markets}
              onChange={(e) => setMarkets(e.target.value)}
              placeholder="DE"
              className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm uppercase text-text-primary"
              data-testid="partner-supply-markets"
            />
            <span className="text-text-muted normal-case">{labels.marketsHelp}</span>
          </label>

          {/* The three authorities beyond matching. No `defaultChecked` on any
              of them — a permission nobody ticked is a permission nobody gave. */}
          <fieldset className="mt-4">
            <legend className="font-mono text-meta uppercase tracking-label text-text-muted">
              {labels.authoritiesTitle}
            </legend>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contactAuthority}
                  onChange={(e) => setContactAuthority(e.target.checked)}
                  className="mt-1"
                  data-testid="partner-supply-contact-authority"
                />
                <span>
                  <span className="text-text-primary">{labels.authorityContact}</span>
                  <span className="block text-text-secondary">
                    {labels.authorityContactBody}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={publicationAuthority}
                  onChange={(e) => setPublicationAuthority(e.target.checked)}
                  className="mt-1"
                  data-testid="partner-supply-publication-authority"
                />
                <span>
                  <span className="text-text-primary">{labels.authorityPresentation}</span>
                  <span className="block text-text-secondary">
                    {labels.authorityPresentationBody}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={identityDisclosureAuthority}
                  onChange={(e) => setIdentityDisclosureAuthority(e.target.checked)}
                  className="mt-1"
                  data-testid="partner-supply-identity-authority"
                />
                <span>
                  <span className="text-text-primary">{labels.authorityIdentity}</span>
                  <span className="block text-text-secondary">
                    {labels.authorityIdentityBody}
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <label className="mt-4 flex flex-col gap-1 text-xs">
            <span className="font-mono uppercase tracking-label text-text-muted">
              {labels.validDaysLabel}
            </span>
            <select
              value={validDays}
              onChange={(e) => setValidDays(Number(e.target.value))}
              className="w-fit rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
              data-testid="partner-supply-valid-days"
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
            <span className="text-text-muted normal-case">{labels.validDaysHelp}</span>
          </label>

          {formError && (
            <p className="mt-3 text-sm text-text-secondary" data-testid="partner-supply-error">
              {formError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
              data-testid="partner-supply-save"
            >
              {pending ? labels.saving : labels.save}
            </button>
            {live && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setFormError(null);
                }}
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
                data-testid="partner-supply-cancel"
              >
                {labels.cancel}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setSavedNote(null);
              setEditing(true);
            }}
            className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue"
            data-testid="partner-supply-edit"
          >
            {labels.edit}
          </button>
          <button
            type="button"
            onClick={onWithdrawDeclaration}
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
            data-testid="partner-supply-withdraw-declaration"
          >
            {labels.withdrawDeclaration}
          </button>
        </div>
      )}

      {/* Revoking the permission itself — same screen, one click, never harder
          than granting was. */}
      <div className="mt-4 border-t border-ink-500 pt-4">
        {authoritiesBlock}
        <button
          type="button"
          onClick={onWithdrawConsent}
          disabled={pending}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
          data-testid="partner-supply-withdraw-consent"
        >
          {labels.withdrawConsent}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">{legal.withdrawal}</p>
      </div>

      {phase === "error" && (
        <p className="mt-2 text-sm text-text-secondary">{labels.errorGeneric}</p>
      )}
    </div>
  );
}
