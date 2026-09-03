"use client";

import { useActionState } from "react";
import { Handshake, Check, X, Trash2 } from "lucide-react";

import {
  pendingInvites,
  type ClientInvitesState,
} from "@/lib/agency/bridge-model";
import {
  acceptConnectionAction,
  declineConnectionAction,
  revokeConnectionAction,
  shareRequestAction,
  type BridgeActionState,
} from "@/lib/agency/bridge-actions";

/**
 * Client side of the REAL two-subject bridge (issue #859). A real client
 * company accepts/declines a staffing agency's connection invite, sees its
 * active agencies, shares specific OWN requests, and revokes. The client is the
 * ONLY reviewer of proposed candidates (on its own scouting surface). Renders
 * only when the caller owns a company that is NOT itself a staffing agency.
 */
export interface ClientBridgeLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly gatedHeading: string;
  readonly gatedBody: string;
  readonly invitesHeading: string;
  readonly noInvites: string;
  readonly acceptButton: string;
  readonly declineButton: string;
  readonly activeHeading: string;
  readonly noActive: string;
  readonly revokeButton: string;
  readonly shareLabel: string;
  readonly sharePlaceholder: string;
  readonly shareButton: string;
  readonly noDemands: string;
  readonly errorLabel: string;
  readonly fromAgency: string;
}

const IDLE: BridgeActionState = { status: "idle" };

export function ClientAgencyBridgeSection({
  invites,
  clientCompanyId,
  demands,
  labels,
}: {
  invites: ClientInvitesState;
  clientCompanyId: string;
  demands: readonly { id: string; title: string }[];
  labels: ClientBridgeLabels;
}) {
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptConnectionAction, IDLE);
  const [declineState, declineAction] = useActionState(declineConnectionAction, IDLE);
  const [revokeState, revokeAction] = useActionState(revokeConnectionAction, IDLE);
  const [shareState, shareAction, sharePending] = useActionState(shareRequestAction, IDLE);

  const gated = invites.kind === "needs-migration" || shareState.status === "needs-migration";
  const rows = invites.kind === "ok" ? invites.rows : [];
  const pend = pendingInvites(rows);
  const active = rows.filter((r) => r.status === "active");

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="client-bridge-section">
      <header className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <Handshake className="h-4 w-4 text-brand-blue" aria-hidden />
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      {gated ? (
        <div className="rounded-md border border-state-warning bg-state-warning/10 p-3" data-testid="client-bridge-gated">
          <p className="font-mono text-meta uppercase tracking-label text-state-warning">{labels.gatedHeading}</p>
          <p className="mt-1 text-xs text-text-secondary">{labels.gatedBody}</p>
        </div>
      ) : (
        <>
          {/* Pending invites */}
          <div className="flex flex-col gap-2" data-testid="client-bridge-invites">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.invitesHeading}</h3>
            {pend.length === 0 ? (
              <p className="text-xs text-text-muted">{labels.noInvites}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pend.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2" data-testid="client-bridge-invite-row">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {labels.fromAgency}: {c.agencyName}
                    </span>
                    <form action={acceptAction} className="shrink-0">
                      <input type="hidden" name="connectionId" value={c.id} />
                      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
                      <button type="submit" disabled={acceptPending} data-testid={`client-bridge-accept-${c.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-state-success/50 bg-state-success/10 px-3 text-xs font-semibold text-state-success transition-colors hover:border-state-success disabled:opacity-60">
                        <Check className="h-3.5 w-3.5" aria-hidden /> {labels.acceptButton}
                      </button>
                    </form>
                    <form action={declineAction} className="shrink-0">
                      <input type="hidden" name="connectionId" value={c.id} />
                      <button type="submit" title={labels.declineButton} aria-label={labels.declineButton}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-500 text-text-muted transition-colors hover:border-state-danger hover:text-state-danger">
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Active agencies + share a request */}
          <div className="flex flex-col gap-2" data-testid="client-bridge-active">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.activeHeading}</h3>
            {active.length === 0 ? (
              <p className="text-xs text-text-muted">{labels.noActive}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {active.map((c) => (
                  <li key={c.id} className="card-border flex flex-col gap-2 p-3" data-testid="client-bridge-active-row">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{c.agencyName}</span>
                      <form action={revokeAction} className="shrink-0">
                        <input type="hidden" name="connectionId" value={c.id} />
                        <button type="submit" title={labels.revokeButton} aria-label={labels.revokeButton}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink-500 text-text-muted transition-colors hover:border-state-danger hover:text-state-danger">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </form>
                    </div>
                    {demands.length === 0 ? (
                      <p className="text-xs text-text-muted">{labels.noDemands}</p>
                    ) : (
                      <form action={shareAction} className="flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="client-bridge-share-form">
                        <input type="hidden" name="connectionId" value={c.id} />
                        <label className="flex min-w-44 flex-1 flex-col gap-1">
                          <span className="text-xs font-medium text-text-secondary">{labels.shareLabel}</span>
                          <select name="requestId" required defaultValue=""
                            className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue">
                            <option value="" disabled>{labels.sharePlaceholder}</option>
                            {demands.map((d) => (
                              <option key={d.id} value={d.id}>{d.title}</option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" disabled={sharePending}
                          className="inline-flex h-10 items-center rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60">
                          {labels.shareButton}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* A failed accept / decline / revoke used to be silent (the action
              state was discarded); every non-ok outcome now shows the error. */}
          {[shareState, acceptState, declineState, revokeState].some(
            (s) => s.status === "error" || s.status === "forbidden" || s.status === "invalid" || s.status === "not-found",
          ) && (
            <p className="text-xs text-state-danger" role="alert">{labels.errorLabel}</p>
          )}
        </>
      )}
    </section>
  );
}
