"use client";

import { useState, useTransition } from "react";

import {
  communicationLanguageNames,
  communicationLocales,
  isCommunicationLocale,
} from "@/lib/i18n/config";
import { persistCommunicationLocaleAction } from "@/lib/i18n/locale-actions";

/**
 * COMM-1 — "I read messages in …": ONE control on the account settings page
 * over the 13-language COMMUNICATION set, every language named in itself
 * (the same names the composer's "I am writing in" control shows), with
 * "same as the interface" as the empty choice.
 *
 * HONESTY RULES carried in the markup:
 *  - the server passes the STORED value; this component never guesses one;
 *  - a failed save REVERTS the select and says so — it never shows a
 *    preference the database refused;
 *  - while the owner-gated column is not applied the control is disabled and
 *    the section says the setting is not available yet — a stated state,
 *    never a silent no-op.
 */
export interface CommunicationLocaleLabels {
  readonly title: string;
  readonly intro: string;
  readonly label: string;
  readonly sameAsInterface: string;
  readonly saved: string;
  readonly error: string;
  readonly unavailable: string;
}

type Status = "idle" | "saved" | "error" | "unavailable";

export function CommunicationLocaleSection({
  value,
  available,
  labels,
}: {
  /** The stored preference (null = same as the interface). */
  value: string | null;
  /** false while the column is not applied (read reported `unavailable`). */
  available: boolean;
  labels: CommunicationLocaleLabels;
}) {
  const [current, setCurrent] = useState<string>(
    value && isCommunicationLocale(value) ? value : "",
  );
  const [status, setStatus] = useState<Status>(available ? "idle" : "unavailable");
  const [pending, startTransition] = useTransition();

  const onChange = (next: string) => {
    const previous = current;
    setCurrent(next);
    setStatus("idle");
    startTransition(async () => {
      const result = await persistCommunicationLocaleAction(next === "" ? null : next);
      if (result.kind === "ok") {
        setStatus("saved");
        return;
      }
      setCurrent(previous);
      setStatus(result.kind === "unavailable" ? "unavailable" : "error");
    });
  };

  return (
    <section
      className="card-border p-5"
      data-testid="account-communication-locale"
      data-state={status}
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {labels.title}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">{labels.intro}</p>
      <label className="mt-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-sm text-text-primary">{labels.label}</span>
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={status === "unavailable" || pending}
          aria-label={labels.label}
          className="min-h-11 rounded-md border border-ink-500 bg-ink-700 px-3 text-sm text-text-primary outline-none focus:border-brand-blue disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="account-communication-locale-select"
        >
          <option value="">{labels.sameAsInterface}</option>
          {communicationLocales.map((code) => (
            <option key={code} value={code}>
              {communicationLanguageNames[code]}
            </option>
          ))}
        </select>
      </label>
      {status === "saved" ? (
        <p className="mt-2 text-meta text-state-success" role="status">
          {labels.saved}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 text-meta text-state-danger" role="alert">
          {labels.error}
        </p>
      ) : null}
      {status === "unavailable" ? (
        <p className="mt-2 text-meta text-text-muted" data-testid="account-communication-locale-unavailable">
          {labels.unavailable}
        </p>
      ) : null}
    </section>
  );
}
