"use client";

import { useState, useTransition } from "react";

import {
  grantContactDisclosureAction,
  respondContactDisclosureAction,
} from "@/lib/privacy/contact-disclosure-actions";
import type { ContactDisclosureStatus } from "@/lib/privacy/contact-disclosure-shared";

/**
 * Worker-side contact-detail requests (Wagon 1, shared contact/consent
 * contract) — the privacy screen card where the worker answers an employer's
 * ask in TWO DISTINCT decisions:
 *
 *   1. Accept / decline the ASK — request row only; accepting shares NOTHING;
 *   2. SEPARATELY allow the contact-detail disclosure — the applied
 *      append-only consent ledger (grant_employer_data_disclosure), offered
 *      only after an accept, with the exact versioned legal wording
 *      (interpolated with the real company name and need title) shown first.
 *
 * Honest states only; no auto-grant, no preselection, default is
 * "do nothing" — and doing nothing shares nothing.
 */

export interface ContactRequestCard {
  readonly id: string;
  readonly status: ContactDisclosureStatus;
  readonly organizationName: string;
  readonly needTitle: string;
  readonly createdAtDate: string;
  /** Localized labels of the requested fields (never raw enum values). */
  readonly fieldLabels: readonly string[];
  /** Decision 2 state — the SEPARATE consent-ledger grant, read live. */
  readonly disclosureGranted: boolean;
  /** The versioned consent wording, already interpolated server-side. */
  readonly legal: {
    readonly title: string;
    readonly summary: string;
    readonly visibleData: string;
    readonly invisibleData: string;
    readonly freedom: string;
    readonly withdrawal: string;
    readonly controller: string;
  };
}

export function ContactDisclosureRequests({
  locale,
  requests,
  labels,
}: {
  locale: string;
  requests: readonly ContactRequestCard[];
  labels: {
    empty: string;
    requestedFields: string;
    acceptNote: string;
    accept: string;
    decline: string;
    working: string;
    statusCreated: string;
    statusAccepted: string;
    statusDeclined: string;
    statusWithdrawn: string;
    statusExpired: string;
    acceptedNote: string;
    declinedNote: string;
    grantTitle: string;
    grantIntro: string;
    showDetails: string;
    grant: string;
    grantedNote: string;
    error: string;
  };
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [answered, setAnswered] = useState<
    Record<string, "accepted" | "declined" | "error">
  >({});
  const [granted, setGranted] = useState<Record<string, "granted" | "error">>({});
  const [, startTransition] = useTransition();

  if (requests.length === 0) {
    return (
      <p className="mt-2 text-sm text-text-secondary" data-testid="contact-requests-empty">
        {labels.empty}
      </p>
    );
  }

  const statusLabel: Record<ContactDisclosureStatus, string> = {
    created: labels.statusCreated,
    accepted: labels.statusAccepted,
    declined: labels.statusDeclined,
    withdrawn: labels.statusWithdrawn,
    expired: labels.statusExpired,
  };

  function answer(id: string, decision: "accepted" | "declined") {
    setPendingId(id);
    startTransition(async () => {
      const res = await respondContactDisclosureAction({ locale, id, decision });
      setPendingId(null);
      if (res.kind === "ok") {
        setAnswered((prev) => ({ ...prev, [id]: res.status }));
      } else {
        setAnswered((prev) => ({ ...prev, [id]: "error" }));
      }
    });
  }

  function grantDisclosure(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await grantContactDisclosureAction({ locale, id });
      setPendingId(null);
      setGranted((prev) => ({ ...prev, [id]: res.kind === "ok" ? "granted" : "error" }));
    });
  }

  return (
    <ul className="mt-3 flex flex-col gap-3" data-testid="contact-requests-list">
      {requests.map((r) => {
        const local = answered[r.id];
        const status: ContactDisclosureStatus =
          local === "accepted" || local === "declined" ? local : r.status;
        const isGranted = r.disclosureGranted || granted[r.id] === "granted";
        return (
          <li
            key={r.id}
            className="flex flex-col gap-2 rounded-md border border-ink-500 px-3 py-3"
            data-testid={`contact-request-${r.id}`}
            data-status={status}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-text-primary">
                {r.organizationName} · {r.needTitle}
              </p>
              <span className="flex items-center gap-2">
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {r.createdAtDate}
                </span>
                <span className="rounded-sm border border-ink-500 bg-ink-800/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                  {statusLabel[status]}
                </span>
              </span>
            </div>

            <p className="text-xs text-text-secondary">
              {labels.requestedFields}: {r.fieldLabels.join(", ")}
            </p>

            {/* Decision 1: answer the ASK. Accepting shares nothing. */}
            {status === "created" ? (
              <>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {labels.acceptNote}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => answer(r.id, "accepted")}
                    disabled={pendingId !== null}
                    data-testid={`contact-request-accept-${r.id}`}
                    className="min-h-11 rounded-md border border-brand-blue bg-brand-blue/10 px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20 disabled:opacity-60"
                  >
                    {pendingId === r.id ? labels.working : labels.accept}
                  </button>
                  <button
                    type="button"
                    onClick={() => answer(r.id, "declined")}
                    disabled={pendingId !== null}
                    data-testid={`contact-request-decline-${r.id}`}
                    className="min-h-11 rounded-md border border-ink-500 px-4 text-sm font-medium text-text-secondary transition-colors hover:border-brand-blue/60 disabled:opacity-60"
                  >
                    {labels.decline}
                  </button>
                </div>
              </>
            ) : null}
            {local === "accepted" ? (
              <p className="text-xs text-text-secondary" data-testid={`contact-request-done-${r.id}`}>
                {labels.acceptedNote}
              </p>
            ) : null}
            {local === "declined" ? (
              <p className="text-xs text-text-secondary" data-testid={`contact-request-done-${r.id}`}>
                {labels.declinedNote}
              </p>
            ) : null}

            {/* Decision 2 (SEPARATE, shared contract): the actual contact-
                detail disclosure grant — offered only after an accept, with
                the exact versioned legal wording shown first. */}
            {status === "accepted" && !isGranted ? (
              <div
                className="flex flex-col gap-2 rounded-md border border-brand-blue/25 bg-brand-blue/5 px-3 py-2"
                data-testid={`contact-request-grant-block-${r.id}`}
              >
                <p className="text-xs font-semibold text-text-primary">
                  {labels.grantTitle}
                </p>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {labels.grantIntro}
                </p>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {r.legal.summary}
                </p>
                <details className="group rounded-md border border-ink-600 bg-ink-800/40">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-primary marker:text-text-muted">
                    {labels.showDetails}
                  </summary>
                  <div className="flex flex-col gap-2 px-3 pb-3 text-xs leading-relaxed text-text-secondary">
                    <p>{r.legal.visibleData}</p>
                    <p>{r.legal.invisibleData}</p>
                    <p>{r.legal.freedom}</p>
                    <p>{r.legal.withdrawal}</p>
                    <p className="text-text-muted">{r.legal.controller}</p>
                  </div>
                </details>
                <button
                  type="button"
                  onClick={() => grantDisclosure(r.id)}
                  disabled={pendingId !== null}
                  data-testid={`contact-request-grant-${r.id}`}
                  className="min-h-11 w-fit rounded-md border border-brand-blue bg-brand-blue/10 px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/20 disabled:opacity-60"
                >
                  {pendingId === r.id ? labels.working : labels.grant}
                </button>
                {granted[r.id] === "error" ? (
                  <p className="text-xs text-state-danger">{labels.error}</p>
                ) : null}
              </div>
            ) : null}
            {status === "accepted" && isGranted ? (
              <p className="text-xs text-state-success" data-testid={`contact-request-granted-${r.id}`}>
                {labels.grantedNote}
              </p>
            ) : null}

            {local === "error" ? (
              <p className="text-xs text-state-danger">{labels.error}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
