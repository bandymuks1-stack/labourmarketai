"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  grantProfileDiscoverability,
  withdrawProfileDiscoverability,
  type DiscoverabilityState,
} from "@/lib/privacy/discoverability-actions";
import type { DiscoverabilityConsentSource } from "@/lib/privacy/employer-visibility";
import { discoverabilityScreen, type DiscoverabilityPhase } from "@/lib/privacy/discoverability-screen";

/**
 * Profile-discoverability consent control (GDPR Art. 7; EDPB 05/2020) — and
 * the worker's MATCHABILITY SWITCH (owner goal 2026-10-24: a worker must see
 * at once whether employers can find them and change it in ONE action).
 *
 * Deliberate UX properties (guarded by consent-ux-honesty.test.ts,
 * employer-visibility-doors.test.ts, discoverability-screen.test.ts):
 * - ONE STATUS LINE FIRST: "Visible to employers · On / Off", icon + word,
 *   never colour alone, then what stays private whatever the switch says;
 * - NO checkbox exists at all — nothing can be "pre-ticked";
 * - OFF: the FULL versioned legal text (title/summary/visible/invisible/
 *   freedom/withdrawal/controller — the exact hashed wording) and the
 *   employer preview are already on screen, with two EQUAL buttons under
 *   them: enable ("Sutinku ir įjungiu matomumą") and decline ("Dabar
 *   neįjungti") — same size, same visual weight, no red scare block. Turning
 *   visibility on is ONE tap, after the text, never before it;
 * - declining performs NO server write and never blocks the private profile,
 *   CV or work journal;
 * - ON: the switch-off button is right under the status — ONE tap, never
 *   more than granting took; the terms and the preview stay one tap down;
 * - THE RESULT IS SAID: after a grant or a withdrawal a status note says
 *   what changed, so the person never has to infer it from a re-render;
 * - `compact` (the worker home): the status line and the one action only;
 *   the OFF side opens the same full text in place before its grant button
 *   exists — the consent is never given from a line the person did not read;
 * - honest degradation: needs-migration / error states are plain text,
 *   never a fake success;
 * - SEP-7: a state that could not be READ renders as unknown — never as the
 *   "not visible" choice screen, which would tell the person their profile is
 *   hidden because a query failed.
 *
 * ONE component, several doors: the privacy screen (its canonical home), the
 * profile, the worker home, onboarding and the conversation ("kas mato mano
 * profilį?") render THIS component with the same server-built labels
 * (lib/privacy/discoverability-view.ts). `source` only names which door the
 * decision was made at, for the consent ledger.
 */

export interface ConsentLegalTexts {
  title: string;
  summary: string;
  visibleData: string;
  invisibleData: string;
  freedom: string;
  withdrawal: string;
  controller: string;
}

export interface PreviewField {
  label: string;
  value: string;
}

export interface DiscoverabilityConsentLabels {
  /** "Visible to employers" — the status line's subject. */
  headline: string;
  /** "On" / "Off" — the status word. */
  stateOn: string;
  stateOff: string;
  statusHidden: string;
  statusHiddenBody: string;
  statusVisible: string;
  statusVisibleBody: string;
  statusWithdrawn: string;
  statusStale: string;
  /** What this switch never shows, whatever it says. */
  privateLine: string;
  grant: string;
  decline: string;
  /** compact only: opens the terms in place (never grants). */
  turnOn: string;
  withdraw: string;
  /** Disclosure title over the terms + preview on the ON side. */
  details: string;
  /** The visible result of a grant / a withdrawal. */
  grantedNote: string;
  withdrawnNote: string;
  previewTitle: string;
  previewEmpty: string;
  decidedAtLabel: string;
  versionLabel: string;
  needsMigration: string;
  errorGeneric: string;
  declinedNote: string;
  /** The current state could not be read — said as unknown, never as off. */
  readFailed: string;
}

export function DiscoverabilityConsent({
  locale,
  state,
  legal,
  preview,
  labels,
  source = "dashboard_privacy_screen",
  compact = false,
}: {
  locale: string;
  state: DiscoverabilityState;
  legal: ConsentLegalTexts;
  preview: PreviewField[];
  labels: DiscoverabilityConsentLabels;
  /** Where this copy of the consent is rendered — recorded with the decision. */
  source?: DiscoverabilityConsentSource;
  /** The status line + one action only (the worker home). */
  compact?: boolean;
}) {
  const [phase, setPhase] = useState<DiscoverabilityPhase>("idle");
  // compact only: the person asked to read the terms before deciding.
  const [opened, setOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  // The result note of a grant / withdrawal. Granting collapses the terms
  // above the person's scroll position (compact) and the server re-render
  // can move the block, so the note is brought into view: the result is SEEN,
  // not left above the fold (local walk 2026-10-24, 1280 px).
  const resultRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (phase === "done" || phase === "withdrawn") {
      resultRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [phase]);

  const status = state.status;

  function onGrant() {
    startTransition(async () => {
      const res = await grantProfileDiscoverability({ locale, source });
      if (res.kind === "ok") {
        setOpened(false);
        setPhase("done");
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
      else setPhase("error");
    });
  }

  function onWithdraw() {
    startTransition(async () => {
      const res = await withdrawProfileDiscoverability({ source });
      if (res.kind === "ok") {
        setOpened(false);
        setPhase("withdrawn");
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
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
      {/* GDPR Art. 13(1)(a): controller identity shown WITH the consent text. */}
      <p className="text-text-secondary" data-testid="consent-controller">
        {legal.controller}
      </p>
    </div>
  );

  const previewBlock = (
    <div
      className="mt-4 rounded-md border border-ink-500 bg-ink-800/30 p-4"
      data-testid="discoverability-preview"
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
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

  // THE STATUS LINE — the first thing every door shows. Icon shape + word, so
  // the state is never carried by colour alone.
  const statusLine = (on: boolean) => {
    const Icon = on ? Eye : EyeOff;
    return (
      <p
        className="flex items-center gap-2 text-base font-semibold text-text-primary"
        data-testid="discoverability-status"
        data-visibility={on ? "on" : "off"}
      >
        <Icon
          className={`h-5 w-5 shrink-0 ${on ? "text-state-success" : "text-text-primary"}`}
          strokeWidth={1.75}
          aria-hidden
        />
        <span>
          {labels.headline}
          {" · "}
          <span className={on ? "text-state-success" : undefined}>
            {on ? labels.stateOn : labels.stateOff}
          </span>
        </span>
      </p>
    );
  };

  const privateLine = (
    <p className="mt-1 text-xs leading-relaxed text-text-muted" data-testid="discoverability-private-line">
      {labels.privateLine}
    </p>
  );

  if (phase === "needs-migration" || state.kind === "needs-migration") {
    return (
      <p className="text-sm text-text-secondary" data-testid="discoverability-unavailable">
        {labels.needsMigration}
      </p>
    );
  }

  // SEP-7: the read failed (or there is no signed-in reader). The choice
  // screen below would say "Profilis darbdaviams nematomas" — a claim about
  // this person's profile made from a failed query. Say it could not be read.
  if (state.kind === "error" || state.kind === "not-authed") {
    return (
      <p
        role="status"
        className="text-sm text-text-secondary"
        data-testid="discoverability-read-failed"
      >
        {labels.readFailed}
      </p>
    );
  }

  const screen = discoverabilityScreen({ status, phase });

  // ON — the switch-off is ONE tap, right under the status.
  if (screen === "granted") {
    return (
      <div data-testid="discoverability-granted">
        {statusLine(true)}
        <p className="mt-1 text-sm text-text-secondary">{labels.statusVisibleBody}</p>
        {privateLine}
        {phase === "done" && (
          <p
            ref={resultRef}
            role="status"
            className="mt-2 text-sm font-medium text-state-success"
            data-testid="discoverability-granted-note"
          >
            {labels.grantedNote}
          </p>
        )}
        <button
          type="button"
          onClick={onWithdraw}
          disabled={pending}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
          data-testid="discoverability-withdraw"
        >
          {labels.withdraw}
        </button>
        {!compact && (
          <details className="group mt-3" data-testid="discoverability-details">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-text-secondary hover:text-text-primary">
              {labels.details}
              <span aria-hidden className="ml-1 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            {state.decidedAt && phase !== "done" && (
              <p className="mt-1 text-xs text-text-muted">
                {labels.decidedAtLabel}: {state.decidedAt.slice(0, 10)}
                {state.version ? ` · ${labels.versionLabel}: ${state.version}` : null}
              </p>
            )}
            {previewBlock}
            {legalBlock}
          </details>
        )}
        {phase === "error" && (
          <p className="mt-2 text-sm text-text-secondary">{labels.errorGeneric}</p>
        )}
      </div>
    );
  }

  // OFF — never decided, withdrawn, or granted under a superseded text.
  const stale = status === "granted_stale_version" && phase !== "withdrawn";
  const why = stale
    ? labels.statusStale
    : status === "withdrawn" || phase === "withdrawn"
      ? labels.statusWithdrawn
      : labels.statusHidden;
  // compact shows the terms only once the person asks to read them.
  const showTerms = !compact || opened;
  return (
    <div data-testid="discoverability-choice">
      {statusLine(false)}
      <p className="mt-1 text-sm text-text-secondary">
        <span className="font-medium text-text-primary">{why.replace(/[.!]\s*$/, "")}.</span>{" "}
        {labels.statusHiddenBody}
      </p>
      {privateLine}
      {phase === "withdrawn" && (
        <p
          ref={resultRef}
          role="status"
          className="mt-2 text-sm font-medium text-text-primary"
          data-testid="discoverability-withdrawn-note"
        >
          {labels.withdrawnNote}
        </p>
      )}

      {phase === "declined" ? (
        <p className="mt-3 text-sm text-text-secondary" data-testid="discoverability-declined">
          {labels.declinedNote}
        </p>
      ) : !showTerms ? (
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="mt-3 inline-flex min-h-11 items-center rounded-md border border-brand-blue/40 px-4 text-sm font-medium text-brand-blue hover:border-brand-blue"
          data-testid="discoverability-open"
        >
          {labels.turnOn}
        </button>
      ) : (
        <div>
          <h3 className="mt-4 text-sm font-semibold text-text-primary">{legal.title}</h3>
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
