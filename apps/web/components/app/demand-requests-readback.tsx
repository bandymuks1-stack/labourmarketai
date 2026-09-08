import Link from "next/link";

import type {
  CustomerRequestRow,
  CustomerRequestStatus,
  CustomerRequestsListResult,
} from "@/lib/buyer/customer-requests";
import { resolveDemandTitle } from "@/lib/demand/sanitize-demand-title";
import { parseStoredEstimate } from "@/lib/estimate/estimate-payload";
import { EstimateSummary } from "@/components/app/estimate-summary";
import { DemandLocationCapture } from "@/components/app/demand-location-capture";
import { Card } from "@/components/ui/Card";

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
 * TWO DIRECTIONS, TWO SECTIONS (owner window 7 §4, 2026-09-06). The heading
 * says "what you asked for", and until now an agency's OFFERS — "turime 20
 * suvirintojų ir ieškome jiems darbo" — were listed underneath it, because the
 * read dropped `kind` and nothing downstream could tell a need from a
 * capacity. Each row now carries its own `direction` and each half is stated
 * as what it is, including the honest gap on the supply side.
 *
 * Pure presentational server component — the parent fetches the RLS-respected
 * list and passes it in, so this stays trivially testable and reusable.
 */

export interface DemandRequestsReadbackLabels {
  /** Localized stand-ins for the two ENGLISH placeholder titles the write
   *  path stamps when an employer submits a need without naming the role.
   *  Optional: omitted → the stored string renders exactly as before. */
  readonly syntheticTitle?: {
    readonly hiringWorkers: string;
    readonly agencyPartnership: string;
  };
  readonly heading: string;
  readonly note: string;
  /** Heading for the OTHER direction: capacity this organisation has offered,
   *  which is not something it asked for. */
  readonly supplyHeading: string;
  /** Honest statement of what happens to an offer today — employer-facing
   *  discovery of offered capacity is not live yet, and the surface says so
   *  rather than implying a route that does not exist. */
  readonly supplyNote: string;
  /** Honest gap statement: workers cannot see submitted needs until the
   *  approved-route migration is applied (audit finding F-E1). */
  readonly workerVisibilityNote: string;
  readonly empty: string;
  readonly created: string;
  /** Honest "what you can do next" line — drafts are deletable; closing/
   *  reopening a SUBMITTED request lives in scouting (PR10); self-serve
   *  EDITING of submitted text is still not available (documented gap). */
  readonly manageHelp: string;
  /** Per-row deep link into scouting for THIS demand (matched workers,
   *  interest signals, acknowledgement, confirm/close controls). */
  readonly scoutLink: string;
  readonly status: Readonly<Record<CustomerRequestStatus, string>>;
  /** Neutral label for an unrecognized stored status — never the raw enum
   *  (dead-UI repair, 2026-07-05). */
  readonly statusOther: string;
  /** "Submitted details" expander + the labels for each stored payload field. */
  readonly detailsLabel: string;
  readonly fields: Readonly<{
    description: string;
    role: string;
    /** Row label for the declared opportunity type (structured cluster). */
    opportunityType: string;
    location: string;
    skills: string;
    urgency: string;
    notes: string;
  }>;
  /** Localized labels for the urgency enum stored in the payload. */
  readonly urgencyValues: Readonly<Record<string, string>>;
  /** Localized labels for `structured_v2.opportunity_type` (closed set). */
  readonly opportunityTypeValues: Readonly<Record<string, string>>;
}

/** A single label/value row inside the submitted-details list. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap text-text-secondary">{value}</dd>
    </>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * ONE stored request, rendered. Both directions use it — what differs is the
 * section it sits in and whether a scouting link is honest for it.
 */
function RequestRow({
  r,
  labels,
  locale,
  pendingInterest,
  scoutable,
}: {
  r: CustomerRequestRow;
  labels: DemandRequestsReadbackLabels;
  locale: string;
  pendingInterest?: ReadonlyMap<string, { count: number; label: string }>;
  /** Scouting answers "who could fill this need". That question is meaningless
   *  over an OFFER, so the supply section renders no link rather than sending
   *  the person into a view that cannot describe their row. */
  scoutable: boolean;
}) {
  const p = r.payload ?? {};
  const description = str(r.needSummary);
  const role = str(p.role) || str(r.roleOrWorkType);
  const location = str(p.location) || str(r.location);
  const skills = str(p.skills);
  const urgencyKey = str(p.urgency);
  const urgency = urgencyKey ? labels.urgencyValues[urgencyKey] ?? "" : "";
  const notes = str(p.notes) || str(r.notes);
  // The DECLARED opportunity type (internship / apprenticeship / …) from the
  // structured cluster — shown back to the employer so the row says the same
  // thing the worker board and compass show.
  const s2 =
    p.structured_v2 && typeof p.structured_v2 === "object"
      ? (p.structured_v2 as Record<string, unknown>)
      : null;
  const opportunityTypeKey = s2 ? str(s2.opportunity_type) : "";
  const opportunityType = opportunityTypeKey
    ? labels.opportunityTypeValues[opportunityTypeKey] ?? ""
    : "";
  const detailRows: Array<[string, string]> = [
    [labels.fields.description, description],
    [labels.fields.role, role],
    [labels.fields.opportunityType, opportunityType],
    [labels.fields.location, location],
    [labels.fields.skills, skills],
    [labels.fields.urgency, urgency],
    [labels.fields.notes, notes],
  ].filter(([, v]) => v.length > 0) as Array<[string, string]>;
  const waiting = pendingInterest?.get(r.id) ?? null;
  // Tolerant: older requests have no estimate → null, section omitted.
  const estimate = parseStoredEstimate(r.payload);
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3"
      data-testid="demand-readback-row"
      data-direction={r.direction}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-text-primary">
            {resolveDemandTitle(r.title, labels.syntheticTitle)}
          </span>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.created}: {r.createdAt.slice(0, 10)}
          </span>
        </div>
        <span className="shrink-0 rounded-sm border border-brand-blue/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue">
          {labels.status[r.status] ?? labels.statusOther}
        </span>
      </div>
      {/* Somebody raised their hand on THIS demand and is still waiting.
          Without this the row looked identical whether five people had applied
          or nobody had, and the only surface that knew was a page the employer
          had to open unprompted. */}
      {waiting ? (
        <p
          className="inline-flex w-fit items-center gap-2 rounded-sm border border-state-warning/50 bg-state-warning/10 px-2 py-1 text-xs font-medium text-state-warning"
          data-testid="demand-readback-interest-waiting"
          data-count={waiting.count}
        >
          {waiting.label}
        </p>
      ) : null}
      {/* PR10: every demand row deep-links its OWN scouting view — matched
          workers, interest signals, acknowledgement and the confirm/close
          lifecycle controls. Real route, no new page. */}
      {scoutable ? (
        <Link
          href={`/${locale}/dashboard/company/scouting?request=${r.id}`}
          className={
            waiting
              ? "inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand-blue underline underline-offset-2 transition-colors hover:text-brand-cyan"
              : "inline-flex w-fit items-center gap-1 text-xs font-medium text-brand-blue transition-colors hover:text-brand-cyan"
          }
          data-testid="demand-readback-scout-link"
        >
          {labels.scoutLink} →
        </Link>
      ) : null}
      {detailRows.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none font-mono text-meta uppercase tracking-label text-text-muted hover:text-text-secondary">
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
      {estimate && (
        <div className="mt-1" data-testid="demand-readback-estimate">
          <EstimateSummary
            result={estimate.result}
            assumptions={estimate.assumptions}
            missingInfo={estimate.missingInfo}
            compact
          />
        </div>
      )}
      {/* Signal-only location capture for THIS demand (#423 table). Writes
          country/city/label/address with no coordinates — a map point only
          appears once coordinates are confirmed. Demand only: the capture
          writes to the demand-location table, which has no supply meaning. */}
      {scoutable ? <DemandLocationCapture requestId={r.id} /> : null}
    </li>
  );
}

export function DemandRequestsReadback({
  result,
  labels,
  pendingInterest,
  locale,
}: {
  result: CustomerRequestsListResult;
  labels: DemandRequestsReadbackLabels;
  /** requestId → how many people are still waiting, with the localized line.
   *  Absent entry = nobody waiting; the row renders exactly as before. */
  pendingInterest?: ReadonlyMap<string, { count: number; label: string }>;
  locale: string;
}) {
  // needs-migration / error → render nothing (graceful; on prod the
  // 0028 migration is applied so this resolves to a real list).
  if (result.kind !== "ok") return null;

  // The row's own direction decides its section — nothing here re-derives it
  // from a title or a kind string. A row that is neither direction belongs to
  // neither section; the company room's kind scope is asserted to contain only
  // classified kinds by `lib/guards/market-direction-surfaces.test.ts`, so an
  // unclassified row cannot silently vanish without failing a guard first.
  const needs = result.rows.filter((r) => r.direction === "demand");
  const offers = result.rows.filter((r) => r.direction === "supply");

  return (
    <>
      <Card compact>
      <section
        aria-labelledby="demand-readback-title"
        data-testid="demand-requests-readback"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="demand-readback-title"
            className="font-display text-base font-semibold text-text-primary"
          >
            {labels.heading}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">{labels.note}</p>
          <p
            className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-meta leading-relaxed text-text-secondary"
            data-testid="demand-readback-worker-visibility-note"
          >
            {labels.workerVisibilityNote}
          </p>
        </div>

        {needs.length > 0 && (
          <p
            className="rounded-md border border-border-subtle bg-surface-1/60 px-3 py-2 text-meta leading-relaxed text-text-muted"
            data-testid="demand-readback-manage-help"
          >
            {labels.manageHelp}
          </p>
        )}

        {needs.length === 0 ? (
          <p className="text-sm text-text-muted">{labels.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {needs.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                labels={labels}
                locale={locale}
                pendingInterest={pendingInterest}
                scoutable
              />
            ))}
          </ul>
        )}
      </section>
      </Card>

      {/* THE OTHER DIRECTION. Rendered only when this organisation has actually
          offered capacity — an empty supply section would be noise for every
          employer who never offers any. The note states the honest gap: the
          offer is stored and readable here, and employer-facing discovery of
          it is not live yet. */}
      {offers.length > 0 && (
        <Card compact>
        <section
          aria-labelledby="supply-readback-title"
          data-testid="supply-offers-readback"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="supply-readback-title"
              className="font-display text-base font-semibold text-text-primary"
            >
              {labels.supplyHeading}
            </h2>
            <p
              className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-meta leading-relaxed text-text-secondary"
              data-testid="supply-readback-note"
            >
              {labels.supplyNote}
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {offers.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                labels={labels}
                locale={locale}
                scoutable={false}
              />
            ))}
          </ul>
        </section>
        </Card>
      )}
    </>
  );
}
