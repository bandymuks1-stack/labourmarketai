"use client";

import { useActionState, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Link2,
  MessageSquare,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";

import {
  effectiveReviewStage,
  pendingDeliveryByEmail,
  reviewStageTone,
  type AgencyConnectionsState,
  type BridgeInviteDelivery,
  type ClientInviteDeliveriesState,
  type OfferProgressState,
  type SharedRequestsState,
} from "@/lib/agency/bridge-model";
import {
  inviteClientAction,
  refreshClientInviteLinkAction,
  revokeConnectionAction,
  submitOfferAction,
  withdrawOfferAction,
  type BridgeActionState,
} from "@/lib/agency/bridge-actions";
import { openAgencyConnectionConversationAction } from "@/lib/agency/bridge-conversation";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Agency side of the REAL two-subject bridge (issue #859). The staffing agency
 * invites a REAL client company, sees only the requests that client explicitly
 * shared, offers an active roster worker, and sees the DERIVED review stage —
 * but can NEVER act as the client. Renders only in the staffing_agency block.
 *
 * DELIVERY (2026-09-24). An invite used to end in a connection row nobody
 * could see. The invite action now also creates the invitation through the
 * ONE invitation primitive, and this section shows what actually happened:
 * the link (copy it), whether an e-mail went out (only when a provider
 * acknowledged it — `created` means "link ready, NOT e-mailed"), a fresh
 * link for a pending invitation, and — once the client accepted — the
 * conversation with the person who accepted.
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
  // Delivery through the invitation primitive.
  readonly deliveryHeading: string;
  readonly deliveryCreated: string;
  readonly deliverySent: string;
  readonly deliveryFailed: string;
  readonly deliveryDuplicate: string;
  readonly deliveryRefused: string;
  readonly deliveryUnavailable: string;
  readonly noInvitationYet: string;
  readonly getLink: string;
  readonly newLink: string;
  readonly messageButton: string;
  readonly copyLink: string;
  readonly copied: string;
  /** The primitive's own localized outcome words (network.invite.outcomes). */
  readonly outcomeLabels: Record<string, string>;
}

const IDLE: BridgeActionState = { status: "idle" };
const TONE: Record<ReturnType<typeof reviewStageTone>, string> = {
  muted: "border-ink-500 text-text-muted",
  info: "border-brand-blue/50 text-brand-blue",
  warning: "border-state-warning/50 text-state-warning",
  success: "border-state-success/50 text-state-success",
};

/** Every non-ok outcome an action can return — none may be silent. */
function failed(s: BridgeActionState): boolean {
  return (
    s.status === "error" ||
    s.status === "forbidden" ||
    s.status === "invalid" ||
    s.status === "not-found"
  );
}

/** The stored delivery_status of an invitation row, in the primitive's
 *  outcome vocabulary (`not_sent` = the link is ready, nothing was e-mailed). */
function deliveryStatusOutcome(deliveryStatus: string): string {
  if (deliveryStatus === "sent") return "sent";
  if (deliveryStatus === "delivery_failed") return "delivery_failed";
  return "created";
}

export function AgencyBridgeSection({
  agencyCompanyId,
  connections,
  shared,
  progress,
  roster,
  deliveries,
  labels,
  locale,
}: {
  agencyCompanyId: string;
  connections: AgencyConnectionsState;
  shared: SharedRequestsState;
  progress: OfferProgressState;
  roster: readonly { workerId: string; label: string }[];
  /** The agency's sent connection invitations (the primitive's rows), so a
   *  pending connection can show its real delivery state and offer a link. */
  deliveries: ClientInviteDeliveriesState;
  labels: AgencyBridgeLabels;
  locale: string;
}) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteClientAction, IDLE);
  const [revokeState, revokeAction] = useActionState(revokeConnectionAction, IDLE);
  const [offerState, offerAction, offerPending] = useActionState(submitOfferAction, IDLE);
  const [withdrawState, withdrawAction] = useActionState(withdrawOfferAction, IDLE);
  const [linkState, linkAction, linkPending] = useActionState(refreshClientInviteLinkAction, IDLE);

  // The most recent delivery result (an invite OR a fresh link) — shown once,
  // with the link, until the next one replaces it.
  const [delivery, setDelivery] = useState<BridgeInviteDelivery | null>(null);
  useEffect(() => {
    if (inviteState.status === "ok" && inviteState.invite) setDelivery(inviteState.invite);
  }, [inviteState]);
  useEffect(() => {
    if (linkState.status === "ok" && linkState.invite) setDelivery(linkState.invite);
  }, [linkState]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
    } catch {
      /* clipboard unavailable — the link stays visible for manual copy */
    }
  }

  const gated =
    connections.kind === "needs-migration" ||
    shared.kind === "needs-migration" ||
    inviteState.status === "needs-migration" ||
    offerState.status === "needs-migration";

  const connRows = connections.kind === "ok" ? connections.rows : [];
  const sharedRows = shared.kind === "ok" ? shared.rows : [];
  const progressRows = progress.kind === "ok" ? progress.rows : [];
  const stageByWorker = new Map(progressRows.map((p) => [`${p.requestId}:${p.workerId}`, p]));
  // UNKNOWN is not "no invitation": only an ok read says whether a pending
  // connection has an invitation behind it.
  const pendingByEmail =
    deliveries.kind === "ok" ? pendingDeliveryByEmail(deliveries.rows) : null;

  // TIME_TO_EXTERNAL_HUMAN_RESPONSE for the agency: another person acted on
  // what the agency did - a client accepted the connection, shared a request
  // or decided on a candidate - and the agency is looking at it now. Emitted
  // once per tab session (TelemetryView dedup), no ids.
  const humanResponseVisible =
    connRows.some((c) => c.status === "active") ||
    sharedRows.length > 0 ||
    progressRows.some((p) => p.offerStatus === "accepted" || p.offerStatus === "declined");

  const deliveryHint = (d: BridgeInviteDelivery): string => {
    switch (d.outcome) {
      case "created":
        return labels.deliveryCreated;
      case "sent":
        return labels.deliverySent;
      case "delivery_failed":
        return labels.deliveryFailed;
      case "duplicate_pending":
        return labels.deliveryDuplicate;
      case "refused":
        return labels.deliveryRefused;
      default:
        return labels.deliveryUnavailable;
    }
  };
  const deliveryOutcomeLabel = (d: BridgeInviteDelivery): string | null => {
    if (d.outcome === "unavailable") return null;
    const key = d.outcome === "refused" ? (d.reason ?? "error") : d.outcome;
    return labels.outcomeLabels[key] ?? labels.outcomeLabels.error ?? null;
  };

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="agency-bridge-section">
      {humanResponseVisible ? (
        <TelemetryView
          event={FUNNEL_EVENTS.firstRealResult}
          metadata={{ surface: "agency_bridge", step: "human", role_context: "agency" }}
        />
      ) : null}
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
                {connRows.map((c) => {
                  const invitation = pendingByEmail?.get(c.invitedEmail.toLowerCase()) ?? null;
                  return (
                    <li key={c.id} className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2" data-testid="agency-bridge-connection-row">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{c.invitedEmail}</span>
                        <span className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                          {labels.statusLabels[c.status] ?? c.status}
                        </span>
                        {c.status === "active" && (
                          // The conversation with the person who accepted —
                          // the action re-verifies the active connection and
                          // the caller's side server-side before opening.
                          <form action={openAgencyConnectionConversationAction} className="shrink-0">
                            <input type="hidden" name="connectionId" value={c.id} />
                            <input type="hidden" name="locale" value={locale} />
                            <button type="submit" data-testid={`agency-bridge-message-${c.id}`}
                              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-brand-blue/50 bg-brand-blue/10 px-3 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue">
                              <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {labels.messageButton}
                            </button>
                          </form>
                        )}
                        {(c.status === "pending" || c.status === "active") && (
                          <form action={revokeAction} className="shrink-0">
                            <input type="hidden" name="connectionId" value={c.id} />
                            <button type="submit" title={labels.revokeButton} aria-label={labels.revokeButton}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink-500 text-text-muted transition-colors hover:border-state-danger hover:text-state-danger">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </form>
                        )}
                      </div>
                      {/* A PENDING connection is only real once the invitation
                          reached the person: the delivery state of the
                          primitive's row, or the plain fact that no
                          invitation exists yet (an unknown read shows nothing). */}
                      {c.status === "pending" && pendingByEmail !== null && (
                        <div className="flex flex-wrap items-center gap-2" data-testid="agency-bridge-delivery-row"
                          data-delivery={invitation ? deliveryStatusOutcome(invitation.deliveryStatus) : "none"}>
                          {invitation ? (
                            <>
                              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                                {labels.outcomeLabels[deliveryStatusOutcome(invitation.deliveryStatus)]}
                              </span>
                              <form action={linkAction} className="shrink-0">
                                <input type="hidden" name="invitationId" value={invitation.invitationId} />
                                <input type="hidden" name="email" value={c.invitedEmail} />
                                <input type="hidden" name="locale" value={locale} />
                                <button type="submit" disabled={linkPending} data-testid={`agency-bridge-new-link-${c.id}`}
                                  className="inline-flex min-h-11 items-center gap-1 rounded-md border border-ink-500 px-3 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:opacity-60">
                                  <RefreshCw className="h-3 w-3" aria-hidden /> {labels.newLink}
                                </button>
                              </form>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-text-muted">{labels.noInvitationYet}</span>
                              {/* Idempotent: the connection RPC reuses this
                                  row; only the invitation is new. */}
                              <form action={inviteAction} className="shrink-0">
                                <input type="hidden" name="agencyCompanyId" value={agencyCompanyId} />
                                <input type="hidden" name="email" value={c.invitedEmail} />
                                <input type="hidden" name="locale" value={locale} />
                                <button type="submit" disabled={invitePending} data-testid={`agency-bridge-get-link-${c.id}`}
                                  className="inline-flex min-h-11 items-center gap-1 rounded-md border border-ink-500 px-3 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:opacity-60">
                                  <Link2 className="h-3 w-3" aria-hidden /> {labels.getLink}
                                </button>
                              </form>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <form action={inviteAction} className="flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="agency-bridge-invite-form">
              <input type="hidden" name="agencyCompanyId" value={agencyCompanyId} />
              <input type="hidden" name="locale" value={locale} />
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
            {/* WHAT HAPPENED to the invitation: the primitive's own outcome
                word, what to do about it, and the link when one was minted.
                `created` is stated as "link ready", never as "sent". */}
            {delivery && (
              <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
                data-testid="agency-bridge-delivery" data-outcome={delivery.outcome}>
                <p className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.deliveryHeading}</p>
                <p className="text-xs text-text-secondary">
                  <span className="text-text-primary">{delivery.email}</span>
                  {deliveryOutcomeLabel(delivery) ? ` · ${deliveryOutcomeLabel(delivery)}` : null}
                </p>
                <p className="text-xs text-text-secondary">{deliveryHint(delivery)}</p>
                {delivery.inviteLink && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input readOnly value={delivery.inviteLink} data-testid="agency-bridge-invite-link"
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-md border border-ink-500 bg-ink-700 px-2 py-1.5 font-mono text-meta text-text-primary" />
                    <button type="button" onClick={() => copyLink(delivery.inviteLink as string)} data-testid="agency-bridge-copy-link"
                      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-ink-500 px-3 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary">
                      {copiedLink === delivery.inviteLink ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                      {copiedLink === delivery.inviteLink ? labels.copied : labels.copyLink}
                    </button>
                  </div>
                )}
              </div>
            )}
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
                  const stage = effectiveReviewStage(p.offerStatus, p.reviewStage);
                  return (
                    <li key={p.offerId} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2" data-testid="agency-bridge-progress-row" data-stage={stage}>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${TONE[reviewStageTone(stage)]}`}>
                        {labels.stageLabels[stage] ?? stage}
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
              feedback at all, and a failed revoke / withdraw / link refresh
              was discarded outright (its action state was never read). */}
          {[inviteState, offerState, revokeState, withdrawState, linkState].some(failed) && (
            <p className="text-xs text-state-danger" role="alert" data-testid="agency-bridge-error">
              {[inviteState, offerState, revokeState, withdrawState, linkState].some((s) => s.status === "invalid")
                ? labels.invalidLabel
                : labels.errorLabel}
            </p>
          )}
        </>
      )}
    </section>
  );
}
