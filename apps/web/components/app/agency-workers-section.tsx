"use client";

import { useActionState, useState } from "react";

import {
  inviteAgencyWorkerAction,
  type InviteFormState,
} from "@/lib/agency/actions";
import type {
  AgencyWorkerInvitation,
  LinkedAgencyWorker,
} from "@/lib/agency/agency-workers";

/**
 * Stage 2 PR 2 — Agency workers + invitations panel.
 *
 * Pure client renderer fed by the server-component parent. The parent
 * passes:
 *   - `workersResult` / `invitationsResult` — RLS-respected reads of
 *     public.agency_workers and public.agency_worker_invitations.
 *     When either list comes back as kind="needs-migration", we render
 *     the literal migration blocker copy (one canonical message).
 *   - `lt` — i18n labels (passed as strings so the client component
 *     stays free of next-intl imports and can render in unit tests
 *     without a provider).
 */

type ListState<T> =
  | { kind: "ok"; rows: readonly T[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export interface AgencyWorkersSectionLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly emptyState: string;
  readonly emptyCta: string;
  readonly inviteHeading: string;
  readonly inviteDescription: string;
  readonly inviteEmailLabel: string;
  readonly inviteEmailPlaceholder: string;
  readonly inviteNoteLabel: string;
  readonly inviteNoteHint: string;
  readonly inviteSubmit: string;
  readonly invitationsHeading: string;
  readonly invitationsEmpty: string;
  readonly statusInvited: string;
  readonly statusAlreadyPending: string;
  readonly statusAlreadyLinked: string;
  readonly statusNotOwner: string;
  readonly statusInvalidEmail: string;
  readonly statusError: string;
  readonly statusNoAgency: string;
  readonly migrationBlockerHeading: string;
  readonly migrationBlockerBody: string;
  readonly activeWorkersHeading: string;
  readonly columnEmail: string;
  readonly columnStatus: string;
  readonly columnInvitedAt: string;
  readonly noWorkersHeading: string;
  readonly noWorkersBody: string;
  readonly coordinationHeading: string;
  readonly coordinationBody: string;
  readonly coordinationNextAction: string;
}

export function AgencyWorkersSection({
  workersResult,
  invitationsResult,
  labels,
  roleCoordinationEnabled,
}: {
  readonly workersResult: ListState<LinkedAgencyWorker>;
  readonly invitationsResult: ListState<AgencyWorkerInvitation>;
  readonly labels: AgencyWorkersSectionLabels;
  /** From the operations role-capability map — false today. */
  readonly roleCoordinationEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    InviteFormState | null,
    FormData
  >(inviteAgencyWorkerAction, null);
  const [shouldShowOutcome, setShouldShowOutcome] = useState(true);

  const migrationNeeded =
    workersResult.kind === "needs-migration" ||
    invitationsResult.kind === "needs-migration";

  const activeWorkers =
    workersResult.kind === "ok" ? workersResult.rows : ([] as LinkedAgencyWorker[]);
  const pendingInvitations =
    invitationsResult.kind === "ok"
      ? invitationsResult.rows.filter((i) => i.status === "pending")
      : ([] as AgencyWorkerInvitation[]);

  const outcomeLabel: string | null = (() => {
    if (!state || !shouldShowOutcome) return null;
    if (state.ok) {
      switch (state.outcome) {
        case "invited":
          return labels.statusInvited;
        case "already_pending":
          return labels.statusAlreadyPending;
        case "already_linked":
          return labels.statusAlreadyLinked;
        case "not_owner":
          return labels.statusNotOwner;
        case "invalid_email":
          return labels.statusInvalidEmail;
      }
    }
    if (state.code === "no_agency") return labels.statusNoAgency;
    if (state.code === "needs_migration") return labels.migrationBlockerHeading;
    return state.message ?? labels.statusError;
  })();

  return (
    <section
      className="card-border flex flex-col gap-5 p-5"
      data-testid="agency-workers-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      {migrationNeeded ? (
        <div
          className="rounded-md border border-state-warning bg-state-warning/10 p-3"
          data-testid="agency-workers-migration-blocker"
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
            {labels.migrationBlockerHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {labels.migrationBlockerBody}
          </p>
        </div>
      ) : null}

      {/* Active workers */}
      <section
        className="flex flex-col gap-2"
        data-testid="agency-workers-active-list"
      >
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {labels.activeWorkersHeading}
        </h3>
        {activeWorkers.length === 0 ? (
          <div
            className="rounded-md border border-dashed border-ink-500 p-3"
            data-testid="agency-workers-empty"
          >
            <p className="text-xs font-semibold text-text-primary">
              {labels.noWorkersHeading}
            </p>
            <p className="text-xs text-text-secondary">{labels.noWorkersBody}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 text-left">{labels.columnEmail}</th>
                <th className="py-1 text-left">{labels.columnStatus}</th>
                <th className="py-1 text-left">{labels.columnInvitedAt}</th>
              </tr>
            </thead>
            <tbody>
              {activeWorkers.map((w) => (
                <tr
                  key={w.workerId}
                  className="border-t border-ink-700"
                  data-testid={`agency-worker-row-${w.workerId}`}
                >
                  <td className="py-1 text-text-primary">{w.email ?? "—"}</td>
                  <td className="py-1 text-text-secondary">{w.status ?? "active"}</td>
                  <td className="py-1 text-text-muted">{w.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {!roleCoordinationEnabled ? (
        <div
          className="rounded-md border border-ink-700 bg-surface-1 p-3"
          data-testid="agency-workers-coordination-note"
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.coordinationHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {labels.coordinationBody}
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            {labels.coordinationNextAction}
          </p>
        </div>
      ) : null}

      {/* Invite worker form */}
      <form
        action={(fd) => {
          setShouldShowOutcome(true);
          return formAction(fd);
        }}
        className="flex flex-col gap-3"
        data-testid="agency-workers-invite-form"
      >
        <header className="flex flex-col gap-1">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {labels.inviteHeading}
          </h3>
          <p className="text-xs text-text-secondary">
            {labels.inviteDescription}
          </p>
        </header>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-secondary">{labels.inviteEmailLabel}</span>
          <input
            type="email"
            name="email"
            required
            placeholder={labels.inviteEmailPlaceholder}
            className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="agency-workers-invite-email"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-secondary">{labels.inviteNoteLabel}</span>
          <textarea
            name="note"
            rows={2}
            maxLength={500}
            className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="agency-workers-invite-note"
          />
          <span className="text-[11px] text-text-muted">
            {labels.inviteNoteHint}
          </span>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="agency-workers-invite-submit"
        >
          {labels.inviteSubmit}
        </button>
        {outcomeLabel ? (
          <p
            className={
              state?.ok && state.outcome === "invited"
                ? "rounded-md border border-state-success bg-state-success/10 px-3 py-2 text-xs text-state-success"
                : "rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
            }
            role="status"
            data-testid="agency-workers-invite-result"
          >
            {outcomeLabel}
          </p>
        ) : null}
      </form>

      {/* Pending invitations */}
      <section
        className="flex flex-col gap-2"
        data-testid="agency-workers-pending-list"
      >
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {labels.invitationsHeading}
        </h3>
        {pendingInvitations.length === 0 ? (
          <p className="text-xs text-text-secondary">
            {labels.invitationsEmpty}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 text-left">{labels.columnEmail}</th>
                <th className="py-1 text-left">{labels.columnStatus}</th>
                <th className="py-1 text-left">{labels.columnInvitedAt}</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvitations.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-ink-700"
                  data-testid={`agency-invitation-row-${inv.id}`}
                >
                  <td className="py-1 text-text-primary">{inv.invitedEmail}</td>
                  <td className="py-1 text-text-secondary">{inv.status}</td>
                  <td className="py-1 text-text-muted">
                    {inv.createdAt.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
