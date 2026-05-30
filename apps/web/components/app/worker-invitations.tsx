"use client";

import { useActionState } from "react";

import {
  acceptWorkerInvitationAction,
  type AcceptInvitationActionState,
} from "@/lib/worker/invitation-actions";

/**
 * Worker-side pending-invitation acceptance surface (slice
 * sales-core-nonstop-v1, gap #1). Each pending company/agency invitation gets a
 * real "Accept" button wired to the SECURITY DEFINER accept RPC (migration
 * 0036) which creates the company_workers / agency_workers link. No fake state:
 * the row reflects the real RPC outcome.
 */

export interface WorkerInvitationView {
  readonly kind: "company" | "agency";
  readonly orgId: string;
  readonly orgName: string;
  readonly note: string | null;
  readonly invitedAt: string;
}

export interface WorkerInvitationsLabels {
  readonly title: string;
  readonly body: string;
  readonly companyLabel: string;
  readonly agencyLabel: string;
  readonly accept: string;
  readonly accepting: string;
  readonly noteLabel: string;
  readonly outcomeLinked: string;
  readonly outcomeAlreadyLinked: string;
  readonly outcomeNoInvitation: string;
  readonly outcomeNoWorker: string;
  readonly outcomeError: string;
  readonly outcomeNeedsMigration: string;
}

function InvitationRow({
  inv,
  labels,
}: {
  readonly inv: WorkerInvitationView;
  readonly labels: WorkerInvitationsLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    AcceptInvitationActionState | null,
    FormData
  >(acceptWorkerInvitationAction, null);

  const message: { text: string; ok: boolean } | null = (() => {
    if (!state) return null;
    if (state.ok) {
      switch (state.outcome) {
        case "linked":
          return { text: labels.outcomeLinked, ok: true };
        case "already_linked":
          return { text: labels.outcomeAlreadyLinked, ok: true };
        case "no_invitation":
          return { text: labels.outcomeNoInvitation, ok: false };
        case "no_worker_profile":
          return { text: labels.outcomeNoWorker, ok: false };
      }
    }
    if (state.code === "needs_migration")
      return { text: labels.outcomeNeedsMigration, ok: false };
    return { text: labels.outcomeError, ok: false };
  })();

  const accepted = state?.ok === true && state.outcome === "linked";

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-700 bg-surface-1 p-3"
      data-testid={`worker-invitation-${inv.kind}-${inv.orgId}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {inv.kind === "company" ? labels.companyLabel : labels.agencyLabel}
        </span>
        <span className="text-sm font-semibold text-text-primary">
          {inv.orgName}
        </span>
      </div>
      {inv.note ? (
        <p className="text-xs text-text-secondary">
          <span className="text-text-muted">{labels.noteLabel}: </span>
          {inv.note}
        </p>
      ) : null}
      {!accepted ? (
        <form action={formAction}>
          <input type="hidden" name="kind" value={inv.kind} />
          <input type="hidden" name="orgId" value={inv.orgId} />
          <button
            type="submit"
            disabled={isPending}
            className="self-start rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
            data-testid={`worker-invitation-accept-${inv.kind}-${inv.orgId}`}
          >
            {isPending ? labels.accepting : labels.accept}
          </button>
        </form>
      ) : null}
      {message ? (
        <p
          className={
            message.ok
              ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-xs text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-xs text-state-warning"
          }
          role="status"
          data-testid={`worker-invitation-result-${inv.kind}-${inv.orgId}`}
        >
          {message.text}
        </p>
      ) : null}
    </li>
  );
}

export function WorkerInvitations({
  invitations,
  labels,
}: {
  readonly invitations: readonly WorkerInvitationView[];
  readonly labels: WorkerInvitationsLabels;
}) {
  if (invitations.length === 0) return null;
  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="worker-invitations"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-xs text-text-secondary">{labels.body}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {invitations.map((inv) => (
          <InvitationRow key={`${inv.kind}:${inv.orgId}`} inv={inv} labels={labels} />
        ))}
      </ul>
    </section>
  );
}
