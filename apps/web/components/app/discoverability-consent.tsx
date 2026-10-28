"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  declineProfileDiscoverability,
  getMyDiscoverabilityState,
  grantProfileDiscoverability,
  recordVisibilityDefaultNotice,
  withdrawProfileDiscoverability,
  type DiscoverabilityState,
} from "@/lib/privacy/discoverability-actions";
import type { DiscoverabilityConsentSource } from "@/lib/privacy/employer-visibility";
import {
  discoverabilityScreen,
  type ConfirmedVisibility,
  type DiscoverabilityPhase,
} from "@/lib/privacy/discoverability-screen";

/**
 * Profile-discoverability control (GDPR Art. 7 consent; Art. 13 notice and
 * Art. 21 objection for the free-worker default) — the worker's MATCHABILITY
 * SWITCH (owner goals 2026-10-24/25: a worker sees at once whether employers
 * can find them and changes it in ONE action; free workers are discoverable by
 * default once informed).
 *
 * Deliberate UX properties (guarded by consent-ux-honesty.test.ts,
 * employer-visibility-doors.test.ts, discoverability-screen.test.ts,
 * free-worker-default-visibility.test.ts):
 * - ONE STATUS LINE FIRST: "Visible to employers · On / Off", icon + word,
 *   never colour alone, then what stays private whatever the switch says;
 * - NO checkbox exists at all — nothing can be "pre-ticked";
 * - OFF: the FULL versioned consent text and the employer preview are on
 *   screen, with two EQUAL buttons under them (enable / not now). Turning
 *   visibility on is ONE tap, after the text, never before it. "Not now" is
 *   recorded as a decision (it used to write nothing, so it could not be told
 *   apart from "never asked"); it never blocks the profile, CV or journal;
 * - THE DEFAULT NOTICE (free worker, never decided, owner switch armed): the
 *   versioned notice text is shown with the switch-off right under it; its
 *   display is recorded in the ledger — the default applies only after that
 *   record. Nothing here grants anything;
 * - ON (a grant or the default): switch-off is right under the status — ONE
 *   tap; once off it stays off until the person turns it on;
 * - THE RESULT IS SAID: after a grant or a withdrawal a status note says what
 *   changed;
 * - SERVER TRUTH: the screen is derived from the last server read and the last
 *   SUCCESSFUL write only; a failed write re-reads the server and shows that
 *   state with its button for a retry — never a guess (#2730 review);
 * - `compact` (the worker home): the status line and the one action only; the
 *   OFF side opens the same full text in place before its grant button exists;
 * - honest degradation: needs-migration / error states are plain text;
 * - SEP-7: a state that could not be READ renders as unknown — never as the
 *   "not visible" choice screen.
 *
 * ONE component, several doors: the privacy screen (its canonical home), the
 * profile, the worker home, onboarding and the conversation render THIS
 * component with the same server-built labels (lib/privacy/discoverability-
 * view.ts). `source` only names which door the decision was made at.
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
  /** ON by the free-worker default (not a consent) — and how to switch it off. */
  defaultOnNote: string;
  /** The default starts on a date (an existing account's notice period); `{date}`. */
  defaultPendingNote: string;
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
  notice = null,
  preview,
  labels,
  source = "dashboard_privacy_screen",
  compact = false,
}: {
  locale: string;
  state: DiscoverabilityState;
  legal: ConsentLegalTexts;
  /** The default-visibility notice text (registry, hashed) — shown when due. */
  notice?: ConsentLegalTexts | null;
  preview: PreviewField[];
  labels: DiscoverabilityConsentLabels;
  /** Where this copy of the consent is rendered — recorded with the decision. */
  source?: DiscoverabilityConsentSource;
  /** The status line + one action only (the worker home). */
  compact?: boolean;
}) {
  // The REQUEST state (declined / error / needs-migration) — never the
  // visibility itself. A failed request leaves `confirmed` exactly as it was.
  const [phase, setPhase] = useState<DiscoverabilityPhase>("idle");
  // The outcome of the last SUCCESSFUL grant / withdrawal in this session.
  // Wins over the server read, which some doors never refresh (#2730 review).
  const [confirmed, setConfirmed] = useState<ConfirmedVisibility>(null);
  // A fresher server read than the props (after a failure, or after the
  // notice was recorded). The props are the first read; this is the latest.
  const [live, setLive] = useState<DiscoverabilityState | null>(null);
  // Which result note to show — set only by a success, cleared by a new try.
  const [note, setNote] = useState<"granted" | "withdrawn" | null>(null);
  // compact only: the person asked to read the terms before deciding.
  const [opened, setOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  // The result note of a grant / withdrawal is brought into view: the result
  // is SEEN, not left above the fold (local walk 2026-10-24, 1280 px).
  const resultRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (note) resultRef.current?.scrollIntoView({ block: "nearest" });
  }, [note]);

  const st = live ?? state;
  const status = st.status;

  /** After a failed write: ask the server what is TRUE and show that. */
  async function reconcile() {
    try {
      const fresh = await getMyDiscoverabilityState();
      if (fresh.kind === "ok") {
        setLive(fresh);
        setConfirmed(null);
      }
    } catch {
      /* the read failed too: keep the last confirmed screen and the error */
    }
  }

  // THE NOTICE IS RECORDED WHILE IT IS ON SCREEN — once per mount, never from
  // anywhere else. Then the server is re-read: the default applies by the
  // database rule (or, for an existing account, from the date it names).
  const noticeShown = st.kind === "ok" && st.noticeDue === true && notice !== null && confirmed === null;
  const noticeRecorded = useRef(false);
  // Once on screen, the notice STAYS on screen for this visit (local walk
  // 2026-10-25: re-reading after the record swapped it for the ON screen within
  // a second — a notice nobody had time to read). The status line above it
  // follows the server; a switch-off replaces it.
  const [noticeSticky, setNoticeSticky] = useState(false);
  useEffect(() => {
    if (!noticeShown || noticeRecorded.current) return;
    noticeRecorded.current = true;
    setNoticeSticky(true);
    void recordVisibilityDefaultNotice({ locale, source }).then((res) => {
      if (res.kind === "ok") void reconcile();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeShown]);

  function onGrant() {
    setNote(null);
    startTransition(async () => {
      const res = await grantProfileDiscoverability({ locale, source });
      if (res.kind === "ok") {
        setOpened(false);
        setConfirmed("on");
        setNote("granted");
        setPhase("idle");
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
      // A failure changes NOTHING about the visibility shown: the server is
      // re-read and the true screen keeps its button for a retry.
      else {
        setPhase("error");
        await reconcile();
      }
    });
  }

  function onWithdraw() {
    setNote(null);
    startTransition(async () => {
      const res = await withdrawProfileDiscoverability({ source });
      if (res.kind === "ok") {
        setOpened(false);
        setConfirmed("off");
        setNote("withdrawn");
        setPhase("idle");
      } else if (res.kind === "needs-migration") setPhase("needs-migration");
      else {
        setPhase("error");
        await reconcile();
      }
    });
  }

  const textBlock = (t: ConsentLegalTexts) => (
    <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-text-primary">
      <p>{t.summary}</p>
      <p>{t.visibleData}</p>
      <p>{t.invisibleData}</p>
      <p className="text-text-secondary">{t.freedom}</p>
      <p className="text-text-secondary">{t.withdrawal}</p>
      {/* GDPR Art. 13(1)(a): controller identity shown WITH the text. */}
      <p className="text-text-secondary" data-testid="consent-controller">
        {t.controller}
      </p>
    </div>
  );
  const legalBlock = textBlock(legal);

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

  const withdrawButton = (
    <button
      type="button"
      onClick={onWithdraw}
      disabled={pending}
      className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
      data-testid="discoverability-withdraw"
    >
      {labels.withdraw}
    </button>
  );

  const errorLine =
    phase === "error" ? (
      <p role="alert" className="mt-2 text-sm text-text-secondary" data-testid="discoverability-error">
        {labels.errorGeneric}
      </p>
    ) : null;

  if (phase === "needs-migration" || st.kind === "needs-migration") {
    return (
      <p className="text-sm text-text-secondary" data-testid="discoverability-unavailable">
        {labels.needsMigration}
      </p>
    );
  }

  // SEP-7: the read failed (or there is no signed-in reader). The choice
  // screen below would say "Profilis darbdaviams nematomas" — a claim about
  // this person's profile made from a failed query. Say it could not be read.
  if (st.kind === "error" || st.kind === "not-authed") {
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

  // THE DEFAULT NOTICE — a free worker who never decided, the switch armed.
  // Before its display is recorded the status is OFF; after it, the line
  // follows the server (ON for a new account, the start date for an existing
  // one). The switch-off is offered right away and grants nothing.
  if ((noticeShown || noticeSticky) && notice && confirmed === null) {
    const on = status === "default_on";
    const from = status === "default_pending" && st.defaultFrom ? st.defaultFrom.slice(0, 10) : null;
    return (
      <div data-testid="discoverability-notice">
        {statusLine(on)}
        {on && (
          <p className="mt-1 text-sm text-text-secondary" data-testid="discoverability-default-note">
            {labels.defaultOnNote}
          </p>
        )}
        {from && (
          <p className="mt-1 text-sm text-text-secondary" data-testid="discoverability-pending-note">
            {labels.defaultPendingNote.replace("{date}", from)}
          </p>
        )}
        <h3 className="mt-3 text-sm font-semibold text-text-primary">{notice.title}</h3>
        {textBlock(notice)}
        {!compact && previewBlock}
        {withdrawButton}
        {errorLine}
      </div>
    );
  }

  const screen = discoverabilityScreen({ status, confirmed });
  const byDefault = confirmed === null && status === "default_on";

  // ON — a grant or the free-worker default. Switch-off is ONE tap.
  if (screen === "granted") {
    return (
      <div data-testid="discoverability-granted" data-default={byDefault ? "true" : undefined}>
        {statusLine(true)}
        <p className="mt-1 text-sm text-text-secondary">{labels.statusVisibleBody}</p>
        {privateLine}
        {byDefault && (
          <p className="mt-2 text-sm text-text-secondary" data-testid="discoverability-default-note">
            {labels.defaultOnNote}
          </p>
        )}
        {note === "granted" && (
          <p
            ref={resultRef}
            role="status"
            className="mt-2 text-sm font-medium text-state-success"
            data-testid="discoverability-granted-note"
          >
            {labels.grantedNote}
          </p>
        )}
        {withdrawButton}
        {!compact && (
          <details className="group mt-3" data-testid="discoverability-details">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-text-secondary hover:text-text-primary">
              {labels.details}
              <span aria-hidden className="ml-1 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            {st.decidedAt && confirmed === null && !byDefault && (
              <p className="mt-1 text-xs text-text-muted">
                {labels.decidedAtLabel}: {st.decidedAt.slice(0, 10)}
                {st.version ? ` · ${labels.versionLabel}: ${st.version}` : null}
              </p>
            )}
            {previewBlock}
            {byDefault && notice ? textBlock(notice) : legalBlock}
          </details>
        )}
        {errorLine}
      </div>
    );
  }

  // The default starts on a date (an existing account's notice period): not
  // visible yet; the person can object now.
  if (screen === "pending") {
    const from = st.defaultFrom ? st.defaultFrom.slice(0, 10) : "";
    return (
      <div data-testid="discoverability-pending">
        {statusLine(false)}
        <p className="mt-1 text-sm text-text-secondary" data-testid="discoverability-pending-note">
          {labels.defaultPendingNote.replace("{date}", from)}
        </p>
        {privateLine}
        {withdrawButton}
        {!compact && notice && (
          <details className="group mt-3" data-testid="discoverability-details">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-text-secondary hover:text-text-primary">
              {labels.details}
            </summary>
            {previewBlock}
            {textBlock(notice)}
          </details>
        )}
        {errorLine}
      </div>
    );
  }

  // OFF — never decided, withdrawn, declined, or granted under a superseded text.
  const stale = status === "granted_stale_version" && confirmed === null;
  const why = stale
    ? labels.statusStale
    : status === "withdrawn" || confirmed === "off"
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
      {note === "withdrawn" && (
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
          {/* Two EQUAL choices — same classes, same weight. "Not now" is
              recorded as a decision and removes nothing. */}
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
              onClick={() => {
                setPhase("declined");
                void declineProfileDiscoverability({ locale, source });
              }}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 text-sm font-medium text-text-primary hover:border-brand-blue disabled:opacity-60"
              data-testid="discoverability-decline"
            >
              {labels.decline}
            </button>
          </div>
        </div>
      )}
      {errorLine}
    </div>
  );
}
