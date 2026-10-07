/**
 * LIVING CV - ORGANIZATION-BACKED WORK HISTORY. Pure: no IO, no clock.
 *
 * WHY: an organization's imported history reached the Living CV as ONE total
 * ("N h recorded by organizations"). The evidence rows already say which
 * project / site, which client, in what capacity, from which source and with
 * what standing (professional-history-context, #2153). This module groups the
 * records the work model already read into CV entries that carry that
 * context, and invents nothing.
 *
 * RULES (pinned by organization-history.test.ts)
 *  - ORGANIZATION-PROVIDED, not self-attested. Every entry is "the
 *    organization says"; nothing here marks it SELF_DECLARED unless the
 *    record itself does.
 *  - KNOWN HOURS ONLY (SEP-7). `dayHours` is the sum of day records that
 *    stated hours; `periodHours` is the figure a period record stated, kept
 *    SEPARATE (a period total is never spread onto days and never added to a
 *    day sum). No day count is derived from either. Absent != zero: a group
 *    with no day records has `dayHours: null`, not 0.
 *  - PROOF IS THE INTERSECTION. A proof concept is shown for a group only
 *    when EVERY record in it holds that fact - a group never borrows the
 *    strongest fact of one record. `contested` is the union (any dispute
 *    shows).
 *  - A client / project / capacity that the records disagree on splits the
 *    group; it is never merged into a "mixed" value or guessed.
 *  - Rejected / withdrawn rows never arrive (the reader dropped withdrawn;
 *    the model drops rejected).
 */

import type {
  HistoryClient,
  ProofConcept,
} from "@/lib/organization-evidence/professional-history-context";
import type {
  WorkIntelligenceOrganizationPeriodRecord,
  WorkIntelligenceOrganizationRecord,
} from "@/lib/journal/work-intelligence";

export interface CvOrganizationHistoryEntry {
  /** Stable key for React lists and tests. */
  readonly key: string;
  /** The supplying organisation's name when it resolved; else null. */
  readonly organizationName: string | null;
  readonly project: string | null;
  readonly place: string | null;
  readonly clients: readonly HistoryClient[];
  /** Roster relationship slug (employee, subcontractor, ...) - the renderer
   *  localizes it. */
  readonly relationshipKind: string | null;
  readonly sourceKind: string | null;
  readonly reconstructed: boolean;
  /** Sum of DAY records' stated hours; null = no day record in the group. */
  readonly dayHours: number | null;
  readonly dayRecords: number;
  /** Sum of PERIOD records' stated figures; null = none. Never a day sum. */
  readonly periodHours: number | null;
  readonly periodRecords: number;
  /** Earliest / latest date the group's records name (work dates, period
   *  bounds). null when no record carries a usable date. */
  readonly from: string | null;
  readonly to: string | null;
  /** Proof facts that hold for EVERY record in the group. */
  readonly proof: readonly ProofConcept[];
  readonly attestedByRole: string | null;
  readonly contested: boolean;
}

const norm = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFKC").trim().toLocaleLowerCase();

type Ctx = NonNullable<WorkIntelligenceOrganizationRecord["context"]>;

function groupKey(c: Ctx): string {
  return [
    c.source.supplierOrganizationId ?? norm(c.source.supplierName),
    c.project?.id ?? "",
    norm(c.place?.name),
    c.clients.map((x) => `${x.role}:${norm(x.label)}`).sort().join(","),
    norm(c.relationshipKind),
  ].join("|");
}

interface Acc {
  key: string;
  ctx: Ctx;
  dayHours: number;
  dayRecords: number;
  periodHours: number;
  periodRecords: number;
  from: string | null;
  to: string | null;
  proof: Set<ProofConcept> | null;
  attestedByRole: string | null;
  attestedConsistent: boolean;
  contested: boolean;
  reconstructed: boolean;
}

function widen(acc: Acc, start: string | null, end: string | null): void {
  if (start && (acc.from === null || start < acc.from)) acc.from = start;
  const e = end ?? start;
  if (e && (acc.to === null || e > acc.to)) acc.to = e;
}

function fold(acc: Acc, c: Ctx): void {
  const concepts = new Set<ProofConcept>(c.proof.concepts);
  acc.proof =
    acc.proof === null
      ? concepts
      : new Set([...acc.proof].filter((x) => concepts.has(x)));
  if (acc.dayRecords + acc.periodRecords === 0) {
    acc.attestedByRole = c.proof.attestedByRole;
  } else if (acc.attestedByRole !== c.proof.attestedByRole) {
    acc.attestedConsistent = false;
  }
  if (c.proof.contested) acc.contested = true;
  if (c.source.reconstructed) acc.reconstructed = true;
}

function accFor(map: Map<string, Acc>, c: Ctx): Acc {
  const key = groupKey(c);
  let a = map.get(key);
  if (!a) {
    a = {
      key,
      ctx: c,
      dayHours: 0,
      dayRecords: 0,
      periodHours: 0,
      periodRecords: 0,
      from: null,
      to: null,
      proof: null,
      attestedByRole: null,
      attestedConsistent: true,
      contested: false,
      reconstructed: false,
    };
    map.set(key, a);
  }
  return a;
}

/** Order the proof facts the way the context module does. */
const PROOF_ORDER: readonly ProofConcept[] = [
  "SELF_DECLARED",
  "EVIDENCE_SUPPORTED",
  "EMPLOYER_CONFIRMED",
  "CLIENT_ACCEPTED",
  "SUPERVISOR_CONFIRMED",
  "INDEPENDENTLY_VERIFIED",
];

/**
 * Group the model's context-carrying records into CV entries, most hours
 * first (day + period stated hours, only to ORDER - never displayed as a
 * total). Returns [] when nothing carries context. Callers pass `null`
 * through themselves: an unreadable ledger is UNKNOWN, not "no history".
 */
export function buildCvOrganizationHistory(
  dayRecords: readonly WorkIntelligenceOrganizationRecord[],
  periodRecords: readonly WorkIntelligenceOrganizationPeriodRecord[],
): CvOrganizationHistoryEntry[] {
  const map = new Map<string, Acc>();
  for (const r of dayRecords) {
    if (!r.context || !(Number.isFinite(r.hours) && r.hours > 0)) continue;
    const a = accFor(map, r.context);
    fold(a, r.context);
    a.dayHours += r.hours;
    a.dayRecords += 1;
    widen(a, r.workDate, r.workDate);
  }
  for (const r of periodRecords) {
    if (!r.context || !(Number.isFinite(r.hours) && r.hours > 0)) continue;
    const a = accFor(map, r.context);
    fold(a, r.context);
    a.periodHours += r.hours;
    a.periodRecords += 1;
    widen(a, r.periodStart, r.periodEnd);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const entries = [...map.values()].map((a): CvOrganizationHistoryEntry => {
    const c = a.ctx;
    const proof = a.proof ? PROOF_ORDER.filter((x) => a.proof!.has(x)) : [];
    return {
      key: a.key,
      organizationName: c.source.supplierName,
      project: c.project?.name ?? null,
      place: c.place?.name ?? null,
      clients: c.clients,
      relationshipKind: c.relationshipKind,
      sourceKind: c.source.kind,
      reconstructed: a.reconstructed,
      dayHours: a.dayRecords > 0 ? round(a.dayHours) : null,
      dayRecords: a.dayRecords,
      periodHours: a.periodRecords > 0 ? round(a.periodHours) : null,
      periodRecords: a.periodRecords,
      from: a.from,
      to: a.to,
      proof,
      attestedByRole: a.attestedConsistent ? a.attestedByRole : null,
      contested: a.contested,
    };
  });
  const weight = (e: CvOrganizationHistoryEntry) => (e.dayHours ?? 0) + (e.periodHours ?? 0);
  return entries.sort((x, y) => weight(y) - weight(x) || (y.to ?? "").localeCompare(x.to ?? ""));
}
