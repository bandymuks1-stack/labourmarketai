import type {
  CustomerRequestStatus,
  CustomerRequestsListResult,
} from "@/lib/buyer/customer-requests";
import { sanitizeDemandTitle } from "@/lib/demand/sanitize-demand-title";

/**
 * Demand read-back (Slice 1 — demand → matching readiness).
 *
 * Closes the company / agency demand loop: the cockpit "Submit your need"
 * CTA writes a real `customer_requests` row via `submit_demand_request`;
 * this surface reads those own rows back (RLS-scoped via
 * `listOwnCustomerRequests`) and shows each request's REAL stored status.
 *
 * Honest by design (PLATFORM_DOCTRINE §18 + the locked convergence decision):
 * no automatic matching, no candidate suggestions, no fake "match" results —
 * the matching engine (job_demands / matches) stays dormant until M4. The only
 * "readiness" shown is the request's own manual-review status.
 *
 * Pure presentational server component — the parent fetches the RLS-respected
 * list and passes it in, so this stays trivially testable and reusable.
 */

export interface DemandRequestsReadbackLabels {
  readonly heading: string;
  readonly note: string;
  readonly empty: string;
  readonly created: string;
  readonly status: Readonly<Record<CustomerRequestStatus, string>>;
}

export function DemandRequestsReadback({
  result,
  labels,
}: {
  result: CustomerRequestsListResult;
  labels: DemandRequestsReadbackLabels;
}) {
  // needs-migration / error → render nothing (graceful; on prod the
  // 0028 migration is applied so this resolves to a real list).
  if (result.kind !== "ok") return null;
  const rows = result.rows;

  return (
    <section
      aria-labelledby="demand-readback-title"
      data-testid="demand-requests-readback"
      className="card-border flex flex-col gap-3 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="demand-readback-title"
          className="font-display text-base font-semibold text-text-primary"
        >
          {labels.heading}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {labels.note}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/50 p-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-text-primary">
                  {sanitizeDemandTitle(r.title)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {labels.created}: {r.createdAt.slice(0, 10)}
                </span>
              </div>
              <span className="shrink-0 rounded-sm border border-brand-blue/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-blue">
                {labels.status[r.status] ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
