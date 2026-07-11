"use client";

import { useState, useTransition } from "react";

import {
  grantProfileDiscoverability,
  withdrawProfileDiscoverability,
  type DiscoverabilityState,
} from "@/lib/privacy/discoverability-actions";

/**
 * Profile-discoverability consent control (GDPR Art. 7; EDPB 05/2020).
 *
 * Deliberate UX properties (guarded by discoverability-consent-ux.test.ts):
 * - NO checkbox exists at all — nothing can be "pre-ticked";
 * - two EQUAL buttons: enable ("Sutinku ir įjungiu matomumą") and decline
 *   ("Dabar neįjungti") — same size, same visual weight, no red scare block;
 * - declining performs NO server write and never blocks the private profile,
 *   CV or work journal;
 * - the FULL versioned legal text (title/summary/visible/invisible/freedom/
 *   withdrawal) is rendered from the registry — the exact hashed wording;
 * - withdrawal lives on the same screen and takes one click, not more than
 *   granting took;
 * - honest degradation: needs-migration / error states are plain text,
 *   never a fake success.
 */

export interface ConsentLegalTexts {
  title: string;
  summary: string;
  visibleData: string;
  invisibleData: string;
  freedom: string;
  withdrawal: string;
}

export interface PreviewField {
  label: string;
  value: string;
}

export interface DiscoverabilityConsentLabels {
  statusHidden: string;
  statusHiddenBody: string;
  statusVisible: string;
  statusWithdrawn: string;
  statusStale: string;
  grant: string;
  decline: string;
  manage: string;
  withdraw: string;
  previewTitle: string;
  previewEmpty: string;
  decidedAtLabel: string;
  versionLabel: string;
  needsMigration: string;
  errorGeneric: string;
  declinedNote: string;
}

export function DiscoverabilityConsent({
  locale,
  state,
  legal,
  preview,
  labels,
}: {
  locale: string;
  state: DiscoverabilityState;
  legal: ConsentLegalTexts;
  preview: PreviewField[];
  labels: DiscoverabilityConsentLabels;
}) {
  const [phase, setPhase] = useState<
    "idle" | "expanded" | "declined" | "done" | "withdrawn" | "needs-migration" | "error"
  >("idle");
  const [managing, setManaging] = useState(false);
  const [pending, startTransition] = useTransition();

  const status = state.status;

  function onGrant() {
    startTransition(async () => {
      const res = await grantProfileDiscoverability({ locale });
      if (res.kind === "ok") setPhase("done");
      else if (res.kind === "needs-migration") setPhase("needs-migration");
      else setPhase("error");
    });
  }

  function onWithdraw() {
    startTransition(async () => {
      const res = await withdrawProfileDiscoverability();
      if (res.kind === "ok") setPhase("withdrawn");
      else if (res.kind === "needs-migration") setPhase("needs-migration");
      else setPhase("error");
    });
  }

  const legalBlock = (
    <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-text-primary">
      <p>{legal.summary}</p>
      <p>{legal.visibleData}</p>
      <p>{legal.invisibleData}</p>
      <p className="text-text-secondary">{legal.freedom}</p>
      <p className="text-text-secondary">{legal.withdrawal}</p>
    </div>
  );

  const previewBlock = (
    <div
      className="mt-4 rounded-md border border-ink-500 bg-ink-800/30 p-4"
      data-testid="discoverability-preview"
    >
      <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
        {labels.previewTitle}
      </p>
      {preview.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">{labels.previewEmpty}</p>
      ) : (
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {preview.map((f) => (
            <div key={f.label} className="flex flex-wrap justify-between gap-2 text-sm">
              <dt className="text-text-muted">{f.label}</dt>
              <dd className="text-text-primary">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );

  if (phase === "needs-migration") {
    return (
      <p className="text-sm text-text-secondary" data-testid="discoverability-unavailable">
        {labels.needsMigration}
      </p>
    );
  }

  // GRANTED (fresh grant in this session, or already granted)
  if (phase === "done" || (status === "granted" && phase !== "withdrawn")) {
    return (
      <div data-testid="discoverability-granted">
        <p className="text-sm font-medium text-text-primary">{labels.statusVisible}</p>
        {state.decidedAt && phase !== "done" && (
          <p className="mt-1 text-xs text-text-muted">
            {labels.decidedAtLabel}: {state.decidedAt.slice(0, 10)}
            {state.version ? ` · ${labels.versionLabel}: ${state.version}` : null}
          </p>
        )}
        {!managing ? (
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue"
            data-testid="discoverability-manage"
          >
            {labels.manage}
          </button>
        ) : (
          <div className="mt-3">
            {legalBlock}
            <button
              type="button"
              onClick={onWithdraw}
              disabled={pending}
              className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
              data-testid="discoverability-withdraw"
            >
              {labels.withdraw}
            </button>
          </div>
        )}
        {phase === "error" && (
          <p className="mt-2 text-sm text-text-secondary">{labels.errorGeneric}</p>
        )}
      </div>
    );
  }

  // WITHDRAWN
  if (phase === "withdrawn" || status === "withdrawn") {
    return (
      <div data-testid="discoverability-withdrawn">
        <p className="text-sm font-medium text-text-primary">{labels.statusWithdrawn}</p>
        <p className="mt-1 text-sm text-text-secondary">{labels.statusHiddenBody}</p>
        {phase !== "expanded" ? (
          <button
            type="button"
            onClick={() => setPhase("expanded")}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue"
            data-testid="discoverability-reopen"
          >
            {labels.manage}
          </button>
        ) : null}
      </div>
    );
  }

  // NOT SET (default) or STALE VERSION — the choice screen.
  const stale = status === "granted_stale_version";
  return (
    <div data-testid="discoverability-choice">
      <p className="text-sm font-medium text-text-primary">
        {stale ? labels.statusStale : labels.statusHidden}
      </p>
      <p className="mt-1 text-sm text-text-secondary">{labels.statusHiddenBody}</p>

      {phase === "declined" ? (
        <p className="mt-3 text-sm text-text-secondary" data-testid="discoverability-declined">
          {labels.declinedNote}
        </p>
      ) : phase !== "expanded" ? (
        <button
          type="button"
          onClick={() => setPhase("expanded")}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-brand-blue/40 px-4 text-sm font-medium text-brand-blue hover:border-brand-blue"
          data-testid="discoverability-open"
        >
          {legal.title}
        </button>
      ) : (
        <div>
          <h3 className="mt-4 text-base font-semibold text-text-primary">{legal.title}</h3>
          {legalBlock}
          {previewBlock}
          {/* Two EQUAL choices — same classes, same weight. Declining writes
              nothing and removes nothing. */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onGrant}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
              data-testid="discoverability-grant"
            >
              {labels.grant}
            </button>
            <button
              type="button"
              onClick={() => setPhase("declined")}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
              data-testid="discoverability-decline"
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
