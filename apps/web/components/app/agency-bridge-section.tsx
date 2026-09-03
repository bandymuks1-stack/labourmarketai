"use client";

import { useActionState } from "react";
import { Link2, Trash2, UserPlus, ArrowUpRight } from "lucide-react";

import {
  reviewStageTone,
  type AgencyConnectionsState,
  type OfferProgressState,
  type SharedRequestsState,
} from "@/lib/agency/bridge-model";
import {
  inviteClientAction,
  revokeConnectionAction,
  submitOfferAction,
  withdrawOfferAction,
  type BridgeActionState,
} from "@/lib/agency/bridge-actions";

/**
 * Agency side of the REAL two-subject bridge (issue #859). The staffing agency
 * invites a REAL client company, sees only the requests that client explicitly
 * shared, offers an active roster worker, and sees the DERIVED review stage —
 * but can NEVER act as the client. Renders only in the staffing_agency block.
 */
export interface AgencyBridgeLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly gatedHeading: string;
  readonly gatedBody: string;
  readonly connectionsHeading: string;
  readonly inviteEmailLabel: string;
  readonly inviteButton: string;
  readonly revokeButton: string;
  readonly noConnections: string;
  readonly sharedHeading: string;
  readonly noShared: string;
  readonly workerLabel: string;
  readonly workerPlaceholder: string;
  readonly offerButton: string;
  readonly noRoster: string;
  /** Link text beside `noRoster` — jumps to the roster section. */
  readonly goToRoster: string;
  /** Shown when an action rejected its input (e.g. a malformed client e-mail). */
  readonly invalidLabel: string;
  readonly progressHeading: string;
  readonly noOffers: string;
  readonly withdrawButton: string;
  readonly openScouting: string;
  readonly errorLabel: string;
  readonly statusLabels: Record<string, string>;
  readonly stageLabels: Record<string, string>;
}

const IDLE: BridgeActionState = { status: "idle" };
const TONE: Record<ReturnType<typeof reviewStageTone>, string> = {
  muted: "border-ink-500 text-text-muted",
  info: "border-brand-blue/50 text-brand-blue",
  warning: "border-state-warning/50 text-state-warning",
  success: "border-state-success/50 text-state-success",
};

export function AgencyBridgeSection({
  agencyCompanyId,
  connections,
  shared,
  progress,
  roster,
  labels,
  locale,
}: {
  agencyCompanyId: string;
  connections: AgencyConnectionsState;
  shared: SharedRequestsState;
  progress: OfferProgressState;
  roster: readonly { workerId: string; label: string }[];
  labels: AgencyBridgeLabels;
  locale: string;
}) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteClientAction, IDLE);
  const [, revokeAction] = useActionState(revokeConnectionAction, IDLE);
  const [offerState, offerAction, offerPending] = useActionState(submitOfferAction, IDLE);
  const [, withdrawAction] = useActionState(withdrawOfferAction, IDLE);

  const gated =
    connections.kind === "needs-migration" ||
    shared.kind === "needs-migration" ||
    inviteState.status === "needs-migration" ||
    offerState.status === "needs-migration";

  const connRows = connections.kind === "ok" ? connections.rows : [];
  const sharedRows = shared.kind === "ok" ? shared.rows : [];
  const progressRows = progress.kind === "ok" ? progress.rows : [];
  const stageByWorker = new Map(progressRows.map((p) => [`${p.requestId}:${p.workerId}`, p]));

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="agency-bridge-section">
      <header className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <Link2 className="h-4 w-4 text-brand-blue" aria-hidden />
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      {gated ? (
        <div className="rounded-md border border-state-warning bg-state-warning/10 p-3" data-testid="agency-bridge-gated">
          <p className="font-mono text-meta uppercase tracking-label text-state-warning">{labels.gatedHeading}</p>
          <p className="mt-1 text-xs text-text-secondary">{labels.gatedBody}</p>
        </div>
      ) : (
        <>
          {/* Connections + invite */}
          <div className="flex flex-col gap-2" data-testid="agency-bridge-connections">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.connectionsHeading}</h3>
            {connRows.length === 0 ? (
              <p className="text-xs text-text-muted">{labels.noConnections}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {connRows.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2" data-testid="agency-bridge-connection-row">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{c.invitedEmail}</span>
                    <span className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                      {labels.statusLabels[c.status] ?? c.status}
                    </span>
                    {(c.status === "pending" || c.status === "active") && (
                      <form action={revokeAction} className="shrink-0">
                        <input type="hidden" name="connectionId" value={c.id} />
                        <button type="submit" title={labels.revokeButton} aria-label={labels.revokeButton}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink-500 text-text-muted transition-colors hover:border-state-danger hover:text-state-danger">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form action={inviteAction} className="flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="agency-bridge-invite-form">
              <input type="hidden" name="agencyCompanyId" value={agencyCompanyId} />
              <label className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">{labels.inviteEmailLabel}</span>
                <input type="email" name="email" required maxLength={254}
                  className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue" />
              </label>
              <button type="submit" disabled={invitePending} data-testid="agency-bridge-invite-submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60">
                <UserPlus className="h-4 w-4" aria-hidden /> {labels.inviteButton}
              </button>
            </form>
          </div>

          {/* Shared requests + offer form */}
          <div className="flex flex-col gap-2" data-testid="agency-bridge-shared">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.sharedHeading}</h3>
            {sharedRows.length === 0 ? (
              <p className="text-xs text-text-muted">{labels.noShared}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sharedRows.map((s) => (
                  <li key={s.shareId} className="card-border flex flex-col gap-2 p-3" data-testid="agency-bridge-shared-row">
                    <span className="truncate text-sm font-semibold text-text-primary">{s.title}</span>
                    {roster.length === 0 ? (
                      <p className="text-xs text-text-muted">
                        {labels.noRoster}{" "}
                        <a href="#company-team" className="text-brand-blue hover:underline" data-testid="agency-bridge-no-roster-link">
                          {labels.goToRoster} →
                        </a>
                      </p>
                    ) : (
                      <form action={offerAction} className="flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="agency-bridge-offer-form">
                        <input type="hidden" name="shareId" value={s.shareId} />
                        <label className="flex min-w-44 flex-1 flex-col gap-1">
                          <span className="text-xs font-medium text-text-secondary">{labels.workerLabel}</span>
                          <select name="workerId" required defaultValue=""
                            className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue">
                            <option value="" disabled>{labels.workerPlaceholder}</option>
                            {roster.map((w) => (
                              <option key={w.workerId} value={w.workerId}>{w.label}</option>
                            ))}
                          </select>
                        </label>
                        <input type="text" name="note" maxLength={500} placeholder=""
                          className="min-w-40 flex-1 rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue" />
                        <button type="submit" disabled={offerPending}
                          className="inline-flex h-10 items-center rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60">
                          {labels.offerButton}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Offer progress (derived review stage) */}
          <div className="flex flex-col gap-2" data-testid="agency-bridge-progress">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.progressHeading}</h3>
            {progressRows.length === 0 ? (
              <p className="text-xs text-text-muted">{labels.noOffers}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {progressRows.map((p) => {
                  void stageByWorker;
                  return (
                    <li key={p.offerId} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2" data-testid="agency-bridge-progress-row">
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${TONE[reviewStageTone(p.reviewStage)]}`}>
                        {labels.stageLabels[p.reviewStage] ?? p.reviewStage}
                      </span>
                      {/* The CLIENT's explicit decision on this candidate
                          (migration 20260903101000): accepted → a booking was
                          proposed to the worker; declined → closed. Shown
                          beside the derived review stage, never instead of it. */}
                      {p.offerStatus === "accepted" || p.offerStatus === "declined" ? (
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${
                            p.offerStatus === "accepted"
                              ? "border-state-success/40 bg-state-success/10 text-text-primary"
                              : "border-ink-500 bg-ink-800 text-text-muted"
                          }`}
                          data-testid={`agency-bridge-decision-${p.offerStatus}`}
                        >
                          {labels.stageLabels[`decision_${p.offerStatus}`] ?? p.offerStatus}
                        </span>
                      ) : null}
                      <a href={`/${locale}/dashboard/company/scouting?request=${p.requestId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline">
                        {labels.openScouting} <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </a>
                      {p.offerStatus === "offered" && (
                        <form action={withdrawAction} className="ml-auto shrink-0">
                          <input type="hidden" name="offerId" value={p.offerId} />
                          <button type="submit" title={labels.withdrawButton} aria-label={labels.withdrawButton}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-ink-500 px-2 text-xs text-text-muted transition-colors hover:border-state-danger hover:text-state-danger">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {/* Every non-ok outcome the actions can return is surfaced — an
              invalid client e-mail or a vanished share used to produce no
              feedback at all. */}
          {(["error", "forbidden", "invalid", "not-found"] as const).some(
            (s) => inviteState.status === s || offerState.status === s,
          ) && (
            <p className="text-xs text-state-danger" role="alert">
              {inviteState.status === "invalid" || offerState.status === "invalid" ? labels.invalidLabel : labels.errorLabel}
            </p>
          )}
        </>
      )}
    </section>
  );
}
