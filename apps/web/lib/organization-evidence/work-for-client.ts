/**
 * WORK DONE FOR AN ORGANIZATION BY ITS PARTNERS, AND THE CLIENTS AN
 * ORGANIZATION WORKED FOR (decision 0033, owner order 2026-11-23).
 *
 * A record in partner B's books that names organization A as its `client` is
 * work B did FOR A. It is not A's own work: it is never folded into A's places,
 * people or hours. A sees it as one aggregate with no person, place or partner
 * name (decision 0033 §4: the identity of other chain participants is not
 * disclosed). B, whose books hold it, sees which client it worked for.
 *
 * Pure: the readers pass the records they already read under the caller's RLS.
 * Confirmed and unconfirmed are counted apart; a self-attestation is never a
 * confirmation; hours of period totals are never added to single days.
 */
import { ATTESTED_EVIDENCE_STATES, INDEPENDENTLY_VERIFIED } from "./evidence-state";
import type { EvidenceRecordView } from "./import-core";
import { isPeriodRecord } from "./company-work-history";

type RecordFacts = Pick<
  EvidenceRecordView,
  "withdrawn" | "superseded" | "state" | "hours" | "activityDate" | "periodStart" | "periodEnd" | "parties" | "organizationId"
>;

export type WorkForClient = {
  readonly records: number;
  /** Attested by someone with standing other than the person themself, or independently verified. */
  readonly confirmed: number;
  readonly unconfirmed: number;
  /** Hours of dated single-day records. */
  readonly dayHours: number;
  /** Hours stated as period totals, kept apart. */
  readonly periodHours: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
};

const CONFIRMING = new Set<string>([
  ...ATTESTED_EVIDENCE_STATES.filter((s) => s !== "SELF_ATTESTED"),
  INDEPENDENTLY_VERIFIED,
]);

export const isConfirmedRecord = (r: Pick<EvidenceRecordView, "state">) => CONFIRMING.has(r.state);

const live = <R extends RecordFacts>(records: readonly R[]) => records.filter((r) => !r.withdrawn && !r.superseded);

function span(records: readonly RecordFacts[]): [string | null, string | null] {
  const ds = records
    .flatMap((r) => [r.activityDate, r.periodStart, r.periodEnd])
    .filter((d): d is string => !!d)
    .sort();
  return ds.length ? [ds[0]!, ds[ds.length - 1]!] : [null, null];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The aggregate a client sees of the work partners did for it. No names. */
export function summarizeWorkForClient(records: readonly RecordFacts[]): WorkForClient | null {
  const rows = live(records);
  if (rows.length === 0) return null;
  const confirmed = rows.filter(isConfirmedRecord).length;
  const [firstDate, lastDate] = span(rows);
  return {
    records: rows.length,
    confirmed,
    unconfirmed: rows.length - confirmed,
    dayHours: round(rows.filter((r) => !isPeriodRecord(r)).reduce((s, r) => s + (r.hours ?? 0), 0)),
    periodHours: round(rows.filter(isPeriodRecord).reduce((s, r) => s + (r.hours ?? 0), 0)),
    firstDate,
    lastDate,
  };
}

export type ClientOfRecords = {
  readonly organizationId: string;
  readonly records: number;
  /** The name the records themselves give the client (`party_label`), if any. */
  readonly label: string | null;
};

/** The organizations this organization's own records name as their client, most records first. */
export function clientsOfRecords(records: readonly RecordFacts[], ownOrganizationId: string): ClientOfRecords[] {
  const by = new Map<string, { records: number; label: string | null }>();
  for (const r of live(records)) {
    if (r.organizationId !== ownOrganizationId) continue;
    const seen = new Set<string>();
    for (const p of r.parties) {
      if (p.role !== "client" || !p.organizationId || p.organizationId === ownOrganizationId) continue;
      const entry = by.get(p.organizationId) ?? { records: 0, label: null };
      if (!seen.has(p.organizationId)) entry.records += 1;
      seen.add(p.organizationId);
      entry.label = entry.label ?? (p.label?.trim() || null);
      by.set(p.organizationId, entry);
    }
  }
  return [...by]
    .map(([organizationId, e]) => ({ organizationId, records: e.records, label: e.label }))
    .sort((a, b) => b.records - a.records);
}
