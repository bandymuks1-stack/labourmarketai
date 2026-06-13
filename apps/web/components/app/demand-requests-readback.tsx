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
  /** "Submitted details" expander + the labels for each stored payload field. */
  readonly detailsLabel: string;
  readonly fields: Readonly<{
    description: string;
    role: string;
    location: string;
    skills: string;
    urgency: string;
    notes: string;
  }>;
  /** Localized labels for the urgency enum stored in the payload. */
  readonly urgencyValues: Readonly<Record<string, string>>;
}

/** A single label/value row inside the submitted-details list. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap text-text-secondary">{value}</dd>
    </>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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
          {rows.map((r) => {
            const p = r.payload ?? {};
            const description = str(r.needSummary);
            const role = str(p.role) || str(r.roleOrWorkType);
            const location = str(p.location) || str(r.location);
            const skills = str(p.skills);
            const urgencyKey = str(p.urgency);
            const urgency = urgencyKey ? labels.urgencyValues[urgencyKey] ?? "" : "";
            const notes = str(p.notes) || str(r.notes);
            const detailRows: Array<[string, string]> = [
              [labels.fields.description, description],
              [labels.fields.role, role],
              [labels.fields.location, location],
              [labels.fields.skills, skills],
              [labels.fields.urgency, urgency],
              [labels.fields.notes, notes],
            ].filter(([, v]) => v.length > 0) as Array<[string, string]>;
            return (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3"
                data-testid="demand-readback-row"
              >
                <div className="flex items-center justify-between gap-3">
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
                </div>
                {detailRows.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-label text-text-muted hover:text-text-secondary">
                      {labels.detailsLabel}
                    </summary>
                    <dl
                      className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs"
                      data-testid="demand-readback-details"
                    >
                      {detailRows.map(([label, value]) => (
                        <DetailRow key={label} label={label} value={value} />
                      ))}
                    </dl>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
