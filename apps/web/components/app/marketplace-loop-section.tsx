"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Check, X, Undo2 } from "lucide-react";
import {
  requestServiceOffering,
  respondToRequest,
  withdrawRequest,
} from "@/lib/marketplace/service-requests";
import type {
  DiscoverableOfferingRow,
  IncomingRequestRow,
  OutgoingRequestRow,
  RequestStatus,
} from "@/lib/marketplace/service-requests-shared";
import {
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import { buildPlayerCardMinimum } from "@/lib/identity/player-card-minimum";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * P0 Marketplace loop (Phase 1) — one compact surface: discover active offerings
 * and request one; see your outgoing request status; respond to incoming requests
 * for your own offerings. Real data only — every row comes from RLS-scoped
 * queries. NO seed/demo rows. When the migration is not applied yet the parent
 * passes `needsMigration` and we show a calm "not available yet" state.
 *
 * A request is a real intent with a structured status — no payment, no rating.
 */

export type MarketplaceLabels = {
  notAvailable: string;
  discoverHeading: string;
  discoverEmpty: string;
  request: string;
  requested: string;
  remoteBadge: string;
  outgoingHeading: string;
  outgoingEmpty: string;
  incomingHeading: string;
  incomingEmpty: string;
  accept: string;
  decline: string;
  withdraw: string;
  errorGeneric: string;
  duplicate: string;
  requesterMessage: string;
  providerNote: string;
  responded: string;
  requestedBy: string;
  requesterFallback: string;
  status: Record<RequestStatus, string>;
};

/** ISO timestamp → locale-independent YYYY-MM-DD (no hydration drift, no extra
 *  i18n). Returns null for an empty/invalid value so the caller can omit it. */
function isoDay(ts: string | null): string | null {
  if (!ts) return null;
  const day = ts.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

const STATUS_RING: Record<RequestStatus, string> = {
  sent: "border-ink-500 bg-ink-800/40 text-text-muted",
  accepted: "border-state-success/40 bg-state-success/5 text-state-success",
  declined: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  withdrawn: "border-ink-500 bg-ink-800/40 text-text-muted",
};

function StatusChip({ status, label }: { status: RequestStatus; label: string }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_RING[status]}`}>
      {label}
    </span>
  );
}

export function MarketplaceLoopSection({
  discoverable,
  outgoing,
  incoming,
  needsMigration,
  labels,
}: {
  discoverable: DiscoverableOfferingRow[];
  outgoing: OutgoingRequestRow[];
  incoming: IncomingRequestRow[];
  needsMigration: boolean;
  labels: MarketplaceLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Offerings the caller already has an OPEN ('sent') request for — derived from
  // the outgoing rows already fetched (no extra query, no new logic). Used to
  // reflect an honest "Requested" state on the discover row so a buyer doesn't
  // re-click and hit the duplicate error.
  const openRequestOfferingIds = new Set(
    outgoing.filter((r) => r.status === "sent").map((r) => r.offeringId),
  );

  if (needsMigration) {
    return (
      <div
        data-testid="marketplace-not-available"
        className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
      >
        {labels.notAvailable}
      </div>
    );
  }

  function run(
    action: () => Promise<{ kind: string }>,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.kind === "duplicate") setError(labels.duplicate);
      else if (res.kind !== "ok") setError(labels.errorGeneric);
      else onOk?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* Single top-level title/intro lives on the page (pageTitle/pageLead) —
          no duplicate section header here. Order follows the real-use journey:
          find/request → see what I sent → respond to incoming. */}

      {/* 1 — Discover active offerings (find / request a service) */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-secondary">{labels.discoverHeading}</h3>
        {discoverable.length === 0 ? (
          <div
            data-testid="marketplace-discover-empty"
            className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
          >
            {labels.discoverEmpty}
          </div>
        ) : (
          <ul className="space-y-2">
            {discoverable.map((o) => (
              <li
                key={o.id}
                data-testid="marketplace-offer-row"
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{o.title}</p>
                  {o.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{o.description}</p>
                  )}
                  <p className="mt-1 text-xs text-text-muted">
                    {[o.categorySlug, o.locationCountry, o.remote ? labels.remoteBadge : null, o.rateText]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {openRequestOfferingIds.has(o.id) ? (
                  <span
                    data-testid="marketplace-offer-requested"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-500 px-2 py-1 text-xs text-text-muted"
                  >
                    <Check className="h-3 w-3" /> {labels.requested}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      trackFunnel(FUNNEL_EVENTS.serviceRequestStarted, {
                        surface: "marketplace",
                      });
                      run(
                        () => requestServiceOffering(o.id),
                        () =>
                          trackFunnel(FUNNEL_EVENTS.serviceRequestSent, {
                            surface: "marketplace",
                            success: true,
                          }),
                      );
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brand-blue/40 px-2 py-1 text-xs text-brand-blue disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" /> {labels.request}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2 — My requests (see what I sent) — buyer-facing status of my own
          outgoing requests, shown before the provider inbox per the real-use
          journey order. */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-secondary">{labels.outgoingHeading}</h3>
        {outgoing.length === 0 ? (
          <div
            data-testid="marketplace-outgoing-empty"
            className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
          >
            {labels.outgoingEmpty}
          </div>
        ) : (
          <ul className="space-y-2">
            {outgoing.map((r) => (
              <li
                key={r.id}
                data-testid="marketplace-outgoing-row"
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm text-text-primary">{r.offeringTitle ?? "—"}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusChip status={r.status} label={labels.status[r.status]} />
                    {isoDay(r.respondedAt) && (
                      <span
                        data-testid="marketplace-outgoing-responded"
                        className="text-xs text-text-muted tabular-nums"
                      >
                        {labels.responded} {isoDay(r.respondedAt)}
                      </span>
                    )}
                  </div>
                  {r.responseNote && (
                    <p
                      data-testid="marketplace-outgoing-note"
                      className="line-clamp-3 text-xs text-text-muted"
                    >
                      <span className="text-text-secondary">{labels.providerNote}:</span>{" "}
                      {r.responseNote}
                    </p>
                  )}
                </div>
                {r.status === "sent" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => withdrawRequest(r.id))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-500 px-2 py-1 text-xs text-text-muted disabled:opacity-50"
                  >
                    <Undo2 className="h-3 w-3" /> {labels.withdraw}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3 — Provider inbox (respond to incoming) — incoming requests for my
          own offerings. */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-secondary">{labels.incomingHeading}</h3>
        {incoming.length === 0 ? (
          <div
            data-testid="marketplace-incoming-empty"
            className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
          >
            {labels.incomingEmpty}
          </div>
        ) : (
          <ul className="space-y-2">
            {incoming.map((r) => {
              // Requester identity through the ONE minimum Player Card contract,
              // using only the #531-safe display name. Same fallback rules
              // (clean/trim, neutral "•" initials) as the player card — one
              // identity everywhere, never a fabricated avatar/role.
              const requester = buildPlayerCardMinimum({
                fullName: r.requesterDisplayName,
              });
              return (
              <li
                key={r.id}
                data-testid="marketplace-incoming-row"
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <div className="min-w-0 space-y-1.5">
                  {/* Requester identity — compact request-provider variant of the
                      Player Identity foundation. Display name + initials only;
                      neutral "•"/fallback when the buyer set no name or the
                      identity RPC is not applied yet. */}
                  <div
                    className="flex items-center gap-2"
                    data-testid="marketplace-incoming-requester"
                  >
                    <span
                      aria-hidden
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${PLAYER_IDENTITY_AVATAR_BORDER} ${PLAYER_IDENTITY_FALLBACK_SURFACE}`}
                    >
                      {requester.initials}
                    </span>
                    <span className="min-w-0 truncate text-xs">
                      <span className="text-text-muted">{labels.requestedBy}: </span>
                      <span className="text-text-secondary">
                        {requester.displayName ?? labels.requesterFallback}
                      </span>
                    </span>
                  </div>
                  <p className="truncate text-sm text-text-primary">{r.offeringTitle ?? "—"}</p>
                  <StatusChip status={r.status} label={labels.status[r.status]} />
                  {r.message && (
                    <p
                      data-testid="marketplace-incoming-message"
                      className="line-clamp-3 text-xs text-text-muted"
                    >
                      <span className="text-text-secondary">{labels.requesterMessage}:</span>{" "}
                      {r.message}
                    </p>
                  )}
                </div>
                {r.status === "sent" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => respondToRequest(r.id, "accepted"))}
                      className="inline-flex items-center gap-1 rounded-md border border-state-success/40 px-2 py-1 text-xs text-state-success disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> {labels.accept}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => respondToRequest(r.id, "declined"))}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2 py-1 text-xs text-text-muted disabled:opacity-50"
                    >
                      <X className="h-3 w-3" /> {labels.decline}
                    </button>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-state-warning">{error}</p>}
    </div>
  );
}
