"use client";

import { PeriodMonthlyShare } from "@/components/app/period-monthly-share";
import { EvidenceState, type EvidenceStanding } from "@/components/app/work-world/primitives";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/Card";

import {
  respondToRosterLinkAction,
  type RosterLinkActionResult,
} from "@/lib/organization-evidence/roster-link-actions";
import {
  disputeEvidenceRecordAction,
  type DisputeEvidenceResult,
} from "@/lib/organization-evidence/dispute-actions";
import type {
  EvidenceRecordView,
  SubjectRosterLink,
} from "@/lib/organization-evidence/import-core";

/**
 * "WHAT ORGANIZATIONS HAVE RECORDED ABOUT ME" — the subject's side of the
 * evidence import, on the person's own profile.
 *
 * This is the half that makes an import worth anything to the person it is
 * about: a company's timesheet from 2019 stops being the company's private
 * spreadsheet and becomes evidence in their Living CV, with the provenance
 * intact — who supplied it, in what capacity, from which source, and on which
 * day it was imported.
 *
 * ── WHAT IT REFUSES TO IMPLY ───────────────────────────────────────────────
 * Every record carries the line that it is NOT independently verified, because
 * an import never is. An organization attesting its own submission is shown as
 * an attestation and, when the attester is the subject, as a self-attestation
 * — real, permanent, and never counted as verification.
 *
 * ── CONSENT IS EXPLICIT ────────────────────────────────────────────────────
 * A pending offer shows the organization's name and the name it holds, and
 * offers two answers (`RosterLinkOffers`, below — rendered by the profile
 * page ABOVE its disclosures, not inside this card). Refusing is a
 * first-class action, not a hidden one: being named in someone's records must
 * never be something a person can only accept. An unanswered offer stays
 * pending — silence is not consent.
 */

const CARD = "rounded-md border border-ink-500 bg-ink-900 px-3 py-2";

function OfferDecision({
  offer,
  labels,
}: {
  offer: SubjectRosterLink;
  labels: { accept: string; refuse: string; errorMsg: string };
}) {
  const [state, submit, pending] = useActionState<
    RosterLinkActionResult | null,
    FormData
  >(respondToRosterLinkAction, null);
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="person_id" value={offer.id} />
      <button
        type="submit"
        name="decision"
        value="accept"
        disabled={pending}
        className="rounded-md border border-state-success/50 bg-state-success/10 px-3 py-1.5 text-xs font-semibold text-state-success disabled:opacity-50"
      >
        {labels.accept}
      </button>
      <button
        type="submit"
        name="decision"
        value="refuse"
        disabled={pending}
        className="rounded-md border border-ink-500 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-text-secondary disabled:opacity-50"
      >
        {labels.refuse}
      </button>
      <p
        role="alert"
        className={
          state?.ok === false ? "text-xs text-state-warning" : "sr-only"
        }
      >
        {state?.ok === false ? labels.errorMsg : ""}
      </p>
    </form>
  );
}

/**
 * "THIS IS WRONG" — the subject's objection to one record.
 *
 * Deliberately a two-step: the button reveals a form, and only an explicit
 * submit writes anything. Contesting an employer's record is not a thing to
 * do by mis-tap, and the note is where the person says what is actually
 * wrong — optional, because "this is wrong" is already a complete statement
 * and demanding an explanation before someone may object is its own kind of
 * pressure.
 *
 * WHAT THE COPY MUST NEVER SAY is that the record has been corrected,
 * removed, or proven false. It has not. The objection is recorded beside it,
 * both stay readable, and the standing becomes CONTESTED — which is what the
 * database actually holds.
 */
function DisputeRecord({
  recordId,
  labels,
}: {
  recordId: string;
  labels: {
    open: string;
    notePlaceholder: string;
    submit: string;
    cancel: string;
    recorded: string;
    already: string;
    notAllowed: string;
    failed: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<
    DisputeEvidenceResult | null,
    FormData
  >(disputeEvidenceRecordAction, null);

  if (state?.ok) {
    return (
      <p
        className="text-xs text-state-amber"
        role="status"
        data-testid="evidence-dispute-recorded"
      >
        {"already" in state ? labels.already : labels.recorded}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit rounded-md border border-ink-500 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-state-amber hover:text-state-amber"
        data-testid="evidence-dispute-open"
      >
        {labels.open}
      </button>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="record_id" value={recordId} />
      <textarea
        name="note"
        rows={2}
        maxLength={1000}
        placeholder={labels.notePlaceholder}
        data-testid="evidence-dispute-note"
        className="w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-state-amber"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-state-amber/50 bg-state-amber/10 px-3 py-1.5 text-xs font-semibold text-state-amber disabled:opacity-50"
          data-testid="evidence-dispute-submit"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-md border border-ink-500 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-text-secondary disabled:opacity-50"
        >
          {labels.cancel}
        </button>
      </div>
      {state?.ok === false ? (
        <p
          role="alert"
          className="text-xs text-state-warning"
          data-testid="evidence-dispute-error"
        >
          {state.code === "not_allowed" ? labels.notAllowed : labels.failed}
        </p>
      ) : null}
    </form>
  );
}

/**
 * "WAITING FOR YOUR ANSWER" — the pending roster-link offers, as their OWN
 * surface at the top of the profile.
 *
 * Until 2026-09-17 this block lived inside `OrganizationEvidenceSection`,
 * which the profile page renders INSIDE the closed `#cv-details` disclosure —
 * the bar reserved for editors "filled in once and revisited rarely". A
 * decision the person has to make is not one of those. On the first real
 * offer in production (the owner, on their own account, from
 * /dashboard/company/people) the target opened /dashboard/profile and saw no
 * offer and no Accept / Decline at all: the row was persisted, RLS showed it,
 * the read fetched it, the component rendered it — behind a closed bar with
 * no indicator. This component is the same offer card, the same server
 * action and the same two answers, hoisted to where a pending decision is
 * visible on arrival. It renders nothing when there is nothing to decide.
 *
 * Authority is unchanged: the organization offered, only this person can
 * answer, and `respondToRosterLinkAction` still re-derives the caller and
 * the database still refuses any row that does not already name them.
 */
export function RosterLinkOffers({
  offers,
}: {
  offers: readonly SubjectRosterLink[];
}) {
  const t = useTranslations("evidenceImport.mine");
  if (offers.length === 0) return null;
  return (
    <Card compact>
      <section
        id="roster-link-offers"
        className="flex flex-col gap-2 scroll-mt-20"
        data-testid="organization-evidence-offers"
        aria-labelledby="roster-link-offers-title"
      >
        <p
          id="roster-link-offers-title"
          className="font-mono text-meta uppercase tracking-label text-state-amber"
        >
          {t("offersTitle")}
        </p>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("offersHint")}
        </p>
        {offers.map((offer) => (
          <div
            key={offer.id}
            className={`${CARD} flex flex-col gap-2`}
            data-testid="roster-link-offer"
            data-person-id={offer.id}
          >
            <p className="text-sm text-text-primary">
              {offer.organizationName ?? t("unnamedOrganization")} —{" "}
              {offer.displayName}
            </p>
            <OfferDecision
              offer={offer}
              labels={{
                accept: t("accept"),
                refuse: t("refuse"),
                errorMsg: t("decisionFailed"),
              }}
            />
          </div>
        ))}
      </section>
    </Card>
  );
}

export function OrganizationEvidenceSection({
  records,
  needsMigration,
  organizationNames = {},
}: {
  records: readonly EvidenceRecordView[];
  /** The store is not provisioned in this environment. The card still renders,
   *  with its honest note instead of a silently empty list. */
  needsMigration: boolean;
  /** WHICH organization recorded each row, keyed by the roster record
   *  (`personId`). The record view carries no organization name of its own;
   *  the subject read already resolves it on the roster link (the ONE
   *  org-name rule), so the page hands it over — nothing is invented here.
   *  First real linked history (2026-09-18): the card showed a period, hours
   *  and a standing with no organization on it. */
  organizationNames?: Readonly<Record<string, string>>;
}) {
  const t = useTranslations("evidenceImport.mine");
  const tRole = useTranslations("evidenceImport.role");
  const tState = useTranslations("evidenceImport.evidenceState");
  const tRecords = useTranslations("evidenceImport.records");

  return (
    <Card compact>
      <section
        className="flex flex-col gap-3"
        data-testid="organization-evidence-section"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-bold tracking-tightest text-text-primary">
            {t("title")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("intro")}
          </p>
        </header>

        {needsMigration ? (
          <p
            className="text-xs leading-relaxed text-text-muted"
            data-testid="organization-evidence-not-enabled"
          >
            {t("notEnabled")}
          </p>
        ) : null}

        {records.length === 0 ? (
          !needsMigration && (
            <p
              className="text-sm text-text-muted"
              data-testid="organization-evidence-empty"
            >
              {t("empty")}
            </p>
          )
        ) : (
          <ul
            className="flex flex-col gap-2"
            data-testid="organization-evidence-records"
          >
            {records.map((rec) => (
              <li
                key={rec.id}
                className={`${CARD} flex flex-col gap-1`}
                data-state={rec.state}
                data-independently-verified={
                  rec.independentlyVerified ? "true" : "false"
                }
              >
                {/* The organization first, then the activity the row is about:
                    a person reads "who recorded this, and as what" before a
                    figure. Both are the record's own facts. */}
                {organizationNames[rec.personId] || rec.contextLabel ? (
                  <p
                    className="text-sm font-semibold text-text-primary"
                    data-testid="organization-evidence-record-origin"
                  >
                    {organizationNames[rec.personId] ?? ""}
                    {organizationNames[rec.personId] && rec.contextLabel ? " · " : ""}
                    {rec.contextLabel ?? ""}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-text-primary">
                    {rec.activityDate ??
                      [rec.periodStart, rec.periodEnd]
                        .filter(Boolean)
                        .join(" – ")}
                  </span>
                  {rec.hours !== null && (
                    <span className="text-xs text-text-secondary">
                      {rec.hours} h
                    </span>
                  )}
                  {/* DERIVED even monthly share of a period record (owner
                      2026-09-17) — the subject reads the same derivation the
                      organization does, beside the record, never instead. */}
                  {rec.activityDate === null && (
                    <PeriodMonthlyShare
                      hours={rec.hours}
                      periodStart={rec.periodStart}
                      periodEnd={rec.periodEnd}
                      label={tRecords("monthlyShare")}
                      className="flex basis-full flex-col gap-0.5"
                    />
                  )}
                  {/* Canonical evidence-standing chip (work-world primitive):
                      the ONE component that colours standing, so a
                      self-attestation reads as cyan EVIDENCE and never as
                      green verification. Same words as before — the label is
                      chosen here and handed in; the primitive stays i18n-free. */}
                  <EvidenceState
                    state={
                      (rec.withdrawn
                        ? "WITHDRAWN"
                        : rec.attestation
                          ? rec.attestation.self
                            ? "SELF_ATTESTED"
                            : "ORGANIZATION_ATTESTED"
                          : rec.state) as EvidenceStanding
                    }
                    label={
                      rec.withdrawn
                        ? tRecords("withdrawn")
                        : rec.attestation
                          ? rec.attestation.self
                            ? tRecords("selfAttested")
                            : tRecords("attested")
                          : tState(rec.state as never)
                    }
                  />
                </div>
                <p className="text-sm text-text-secondary">{rec.text}</p>
                <p className="text-xs text-text-muted">
                  {tRecords("supplier")}: {tRole(rec.supplierRole as never)} ·{" "}
                  {tRecords("importedAt")}: {rec.importedAt.slice(0, 10)}
                </p>
                {/* The one claim this surface makes about imported evidence, and
                  it is always the same one. */}
                <p className="text-xs text-text-muted">
                  {tRecords("notIndependentlyVerified")}
                </p>
                {/* CONTESTED is rendered as its own line rather than left to
                    the state chip, because "someone objected to this" is the
                    single most important thing a reader of this record can
                    know, and because the chip's catalogue is the REPORTED
                    states — a lifecycle standing falling through it would
                    render a raw enum. */}
                {rec.state === "DISPUTED" ? (
                  <p
                    className="text-xs text-state-amber"
                    data-testid="evidence-record-disputed"
                  >
                    {rec.disputedByViewer
                      ? tRecords("disputedByYou")
                      : tRecords("disputed")}
                  </p>
                ) : null}
                {/* The objection is offered while the person has not already
                    made one. It never appears on a withdrawn record: the
                    organisation has already taken that claim back, and
                    contesting a retracted statement would be theatre. */}
                {!rec.disputedByViewer && !rec.withdrawn ? (
                  <DisputeRecord
                    recordId={rec.id}
                    labels={{
                      open: tRecords("disputeOpen"),
                      notePlaceholder: tRecords("disputeNotePlaceholder"),
                      submit: tRecords("disputeSubmit"),
                      cancel: tRecords("disputeCancel"),
                      recorded: tRecords("disputeRecorded"),
                      already: tRecords("disputeAlready"),
                      notAllowed: tRecords("disputeNotAllowed"),
                      failed: tRecords("disputeFailed"),
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

/**
 * "THIS IS NO LONGER ME" — the subject withdraws a link they once confirmed.
 *
 * The policy `organization_people_subject_decides` has allowed the linked
 * person to return the row to `unlinked` since the store shipped
 * (2026-09-07); the product exposed only Accept / Refuse on an OFFER, so a
 * person who had said yes could never say "no longer". Consent that cannot
 * be withdrawn is not consent. This is the withdrawal — two steps, because
 * the organization's history leaves the profile the moment it succeeds, and
 * that is not something to do by mis-tap.
 *
 * Nothing is deleted: the organization keeps its own record; it stops naming
 * this person. Renders nothing when there is no confirmed link.
 */
export function RosterLinkWithdrawals({
  links,
}: {
  links: readonly SubjectRosterLink[];
}) {
  const t = useTranslations("evidenceImport.mine");
  const confirmed = links.filter((l) => l.linkState === "linked");
  if (confirmed.length === 0) return null;
  return (
    <section
      id="roster-link-withdrawals"
      className="flex flex-col gap-2"
      data-testid="organization-evidence-links"
      aria-labelledby="roster-link-withdrawals-title"
    >
      <p
        id="roster-link-withdrawals-title"
        className="font-mono text-meta uppercase tracking-label text-text-muted"
      >
        {t("linksTitle")}
      </p>
      <p className="text-xs leading-relaxed text-text-secondary">{t("linksHint")}</p>
      <ul className="flex flex-col gap-2">
        {confirmed.map((link) => (
          <li
            key={link.id}
            className={`${CARD} flex flex-col gap-2`}
            data-testid="roster-link-confirmed"
            data-person-id={link.id}
          >
            <p className="text-sm text-text-primary">
              {link.organizationName ?? t("unnamedOrganization")} — {link.displayName}
            </p>
            <WithdrawDecision
              personId={link.id}
              labels={{
                open: t("withdrawLink"),
                confirm: t("withdrawConfirm"),
                cancel: t("withdrawCancel"),
                done: t("withdrawDone"),
                errorMsg: t("decisionFailed"),
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WithdrawDecision({
  personId,
  labels,
}: {
  personId: string;
  labels: {
    open: string;
    confirm: string;
    cancel: string;
    done: string;
    errorMsg: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<
    RosterLinkActionResult | null,
    FormData
  >(respondToRosterLinkAction, null);
  if (state?.ok) {
    return (
      <p className="text-xs text-text-secondary" data-testid="roster-link-withdrawn">
        {labels.done}
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="roster-link-withdraw-open"
        className="min-h-11 w-fit rounded-md border border-ink-500 bg-ink-800 px-3 text-xs font-semibold text-text-secondary hover:border-state-warning/60"
      >
        {labels.open}
      </button>
    );
  }
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="person_id" value={personId} />
      <button
        type="submit"
        name="decision"
        value="withdraw"
        disabled={pending}
        data-testid="roster-link-withdraw-confirm"
        className="min-h-11 rounded-md border border-state-warning/50 bg-state-warning/10 px-3 text-xs font-semibold text-state-warning disabled:opacity-50"
      >
        {labels.confirm}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="min-h-11 rounded-md border border-ink-500 bg-ink-800 px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
      >
        {labels.cancel}
      </button>
      <p role="alert" className={state?.ok === false ? "text-xs text-state-warning" : "sr-only"}>
        {state?.ok === false ? labels.errorMsg : ""}
      </p>
    </form>
  );
}
