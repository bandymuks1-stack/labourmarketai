"use client";

import { useState } from "react";

import { setNotificationPreferenceAction } from "@/lib/notifications/preferences-actions";
import type { NotificationChannel } from "@/lib/notifications/notification-preferences";

/**
 * Notification preference toggles (completion v1 — M5 closure): one row per
 * canonical event type, in-app + email columns, backed by the applied
 * `notification_preferences` table via the caller-scoped server action.
 *
 * HONESTY RULES carried in the markup:
 *  - in-app defaults ON (opt-out model), email defaults OFF (consent-first,
 *    migration §4) — the server passes the RESOLVED effective state, this
 *    component never re-derives defaults;
 *  - `email: null` means the type has NO email dispatch path — the cell
 *    renders an em dash, never a toggle whose consent could not be honoured;
 *  - while real email delivery is unconfigured the section says so plainly:
 *    a stored email opt-in is a stored choice, not a claim that mail flows;
 *  - a failed save REVERTS the toggle and says so — the switch never shows
 *    a state the database refused.
 */

export interface NotificationPreferenceRowView {
  /** Canonical event-type slug (NOTIFICATION_EVENT_TYPES). */
  readonly type: string;
  /** Localized label — the same auth.notifications.types.event_* copy the
   *  bell renders. */
  readonly label: string;
  readonly inApp: boolean;
  /** null = no email dispatch path for this type (cell shows a dash). */
  readonly email: boolean | null;
}

export interface NotificationPreferencesLabels {
  readonly title: string;
  readonly intro: string;
  readonly inAppHeader: string;
  readonly emailHeader: string;
  readonly emailConsentNote: string;
  /** Shown only while no real email provider is configured. */
  readonly emailInactiveNote: string;
  readonly error: string;
  readonly unavailable: string;
}

export function NotificationPreferencesSection({
  rows,
  labels,
  emailDeliveryActive,
}: {
  rows: readonly NotificationPreferenceRowView[];
  labels: NotificationPreferencesLabels;
  emailDeliveryActive: boolean;
}) {
  const [state, setState] = useState<
    Record<string, { inApp: boolean; email: boolean | null }>
  >(() =>
    Object.fromEntries(
      rows.map((r) => [r.type, { inApp: r.inApp, email: r.email }]),
    ),
  );
  const [notice, setNotice] = useState<"error" | "unavailable" | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const toggle = async (type: string, channel: NotificationChannel) => {
    const current = state[type];
    if (!current) return;
    const prev = channel === "in_app" ? current.inApp : current.email;
    if (prev === null) return;
    const next = !prev;
    const key = `${type}:${channel}`;
    setPending(key);
    setNotice(null);
    // Optimistic — reverted below if the database refuses.
    setState((s) => ({
      ...s,
      [type]: { ...s[type], [channel === "in_app" ? "inApp" : "email"]: next },
    }));
    try {
      const result = await setNotificationPreferenceAction({
        notificationType: type,
        channel,
        enabled: next,
      });
      if (result.kind !== "ok") {
        setState((s) => ({
          ...s,
          [type]: {
            ...s[type],
            [channel === "in_app" ? "inApp" : "email"]: prev,
          },
        }));
        setNotice(result.kind === "feature_unavailable" ? "unavailable" : "error");
      }
    } catch {
      setState((s) => ({
        ...s,
        [type]: { ...s[type], [channel === "in_app" ? "inApp" : "email"]: prev },
      }));
      setNotice("error");
    } finally {
      setPending((p) => (p === key ? null : p));
    }
  };

  return (
    <details
      // Plain bordered box (not the Card primitive: a <details> needs its
      // <summary> as a direct child, which the Card wrapper cannot give it) —
      // and not the raw ratcheted card class (visual-contract-v1).
      className="group rounded-md border border-ink-500 bg-ink-800/20 p-5"
      data-testid="account-notification-preferences"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted hover:text-text-primary">
        <span aria-hidden className="transition-transform group-open:rotate-90">
          ›
        </span>
        {labels.title}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">
        {labels.intro}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        {labels.emailConsentNote}
      </p>
      {!emailDeliveryActive ? (
        <p
          className="mt-2 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
          data-testid="notification-prefs-email-inactive"
        >
          {labels.emailInactiveNote}
        </p>
      ) : null}
      {notice ? (
        <p
          className="mt-2 rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs text-state-warning"
          data-testid="notification-prefs-notice"
          role="status"
        >
          {notice === "unavailable" ? labels.unavailable : labels.error}
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-600 text-left">
              <th scope="col" className="py-2 pr-3 font-normal text-text-muted">
                <span className="sr-only">{labels.title}</span>
              </th>
              <th
                scope="col"
                className="px-2 py-2 text-center font-mono text-meta font-normal uppercase tracking-label text-text-muted"
              >
                {labels.inAppHeader}
              </th>
              <th
                scope="col"
                className="px-2 py-2 text-center font-mono text-meta font-normal uppercase tracking-label text-text-muted"
              >
                {labels.emailHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cur = state[r.type] ?? { inApp: r.inApp, email: r.email };
              return (
                <tr key={r.type} className="border-b border-ink-600/60 last:border-b-0">
                  <td className="py-2 pr-3 text-text-primary">{r.label}</td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-blue"
                      checked={cur.inApp}
                      disabled={pending === `${r.type}:in_app`}
                      onChange={() => toggle(r.type, "in_app")}
                      aria-label={`${r.label} — ${labels.inAppHeader}`}
                      data-testid={`notification-pref-${r.type}-in_app`}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {cur.email === null ? (
                      // No email dispatch path for this type — never render a
                      // toggle whose consent could not be honoured.
                      <span aria-hidden className="text-text-muted">
                        —
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        className="size-4 accent-brand-blue"
                        checked={cur.email}
                        disabled={pending === `${r.type}:email`}
                        onChange={() => toggle(r.type, "email")}
                        aria-label={`${r.label} — ${labels.emailHeader}`}
                        data-testid={`notification-pref-${r.type}-email`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
