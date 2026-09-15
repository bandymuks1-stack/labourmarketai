"use client";

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
 * offers two answers. Refusing is a first-class action, not a hidden one:
 * being named in someone's records must never be something a person can only
 * accept. An unanswered offer stays pending — silence is not consent.
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

export function OrganizationEvidenceSection({
  records,
  pendingOffers,
  needsMigration,
}: {
  records: readonly EvidenceRecordView[];
  pendingOffers: readonly SubjectRosterLink[];
  /** The store is not provisioned in this environment. The card still renders,
   *  with its honest note instead of a silently empty list. */
  needsMigration: boolean;
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

        {pendingOffers.length > 0 && (
          <div
            className="flex flex-col gap-2"
            data-testid="organization-evidence-offers"
          >
            <p className="font-mono text-meta uppercase tracking-label text-state-amber">
              {t("offersTitle")}
            </p>
            <p className="text-xs leading-relaxed text-text-secondary">
              {t("offersHint")}
            </p>
            {pendingOffers.map((offer) => (
              <div key={offer.id} className={`${CARD} flex flex-col gap-2`}>
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
          </div>
        )}

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
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {rec.withdrawn
                      ? tRecords("withdrawn")
                      : rec.attestation
                        ? rec.attestation.self
                          ? tRecords("selfAttested")
                          : tRecords("attested")
                        : tState(rec.state as never)}
                  </span>
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
