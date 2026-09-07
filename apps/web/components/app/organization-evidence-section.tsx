"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/Card";

import {
  respondToRosterLinkAction,
  type RosterLinkActionResult,
} from "@/lib/organization-evidence/roster-link-actions";
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
