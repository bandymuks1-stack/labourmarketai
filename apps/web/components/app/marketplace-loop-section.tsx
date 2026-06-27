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
  title: string;
  lead: string;
  notAvailable: string;
  discoverHeading: string;
  discoverEmpty: string;
  request: string;
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
  status: Record<RequestStatus, string>;
};

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

  function run(action: () => Promise<{ kind: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.kind === "duplicate") setError(labels.duplicate);
      else if (res.kind !== "ok") setError(labels.errorGeneric);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-text-primary">{labels.title}</h2>
        <p className="text-sm text-text-muted">{labels.lead}</p>
      </header>

      {/* Discover active offerings */}
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
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => requestServiceOffering(o.id))}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brand-blue/40 px-2 py-1 text-xs text-brand-blue disabled:opacity-50"
                >
                  <Send className="h-3 w-3" /> {labels.request}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Provider inbox — incoming requests for my offerings */}
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
            {incoming.map((r) => (
              <li
                key={r.id}
                data-testid="marketplace-incoming-row"
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">{r.offeringTitle ?? "—"}</p>
                  <StatusChip status={r.status} label={labels.status[r.status]} />
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
            ))}
          </ul>
        )}
      </section>

      {/* Buyer status — my outgoing requests */}
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
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">{r.offeringTitle ?? "—"}</p>
                  <StatusChip status={r.status} label={labels.status[r.status]} />
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

      {error && <p className="text-sm text-state-warning">{error}</p>}
    </div>
  );
}
