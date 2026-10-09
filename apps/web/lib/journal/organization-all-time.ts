import type {
  WorkIntelligence,
  WorkIntelligenceOrganizationPeriodRecord,
} from "@/lib/journal/work-intelligence";

/**
 * ALL-TIME WORK THE ORGANIZATIONS RECORDED ABOUT THE PERSON — day records AND
 * period records, one figure (owner correction 2026-10-09, #2169).
 *
 * A period record ("800 h, 2025-06-01 → 2025-11-30" from an imported
 * document) stays out of every day/week/month/year sum: it has no days, and
 * splitting it would invent a distribution (owner rule 2026-09-23). But
 * "all time" contains every span by definition, so an all-time total that
 * leaves it out under-states the person's recorded work — on the Living CV
 * the 800 h counted nowhere.
 *
 * Recognition depends ONLY on the canonical record (dates, hours, provenance).
 * No invoice, payment, settlement or counterparty confirmation is consulted
 * or required. What is stated stays separate from what is confirmed: this is
 * RECORDED work; `approvedHours` (day records only) remains its own fact.
 *
 * Double counting is refused, not guessed: a period record whose span holds a
 * day record of the SAME organization may be a summary of those days, so it is
 * listed (`overlapping`) and not added to `totalHours`.
 *
 * `null` = the organization ledger could not be read (UNKNOWN, never zero).
 */
export type OrganizationAllTime = {
  /** Sum of day records, all time (the model's `organizationRecords.all`). */
  readonly dayHours: number;
  readonly days: number;
  /** Sum of period records counted into `totalHours`. */
  readonly periodHours: number;
  readonly periodRecords: number;
  /** Period records not added because a same-organization day record lies in their span. */
  readonly overlapping: readonly WorkIntelligenceOrganizationPeriodRecord[];
  /** dayHours + periodHours — the person's all-time organization-recorded work. */
  readonly totalHours: number;
  readonly importedHours: number;
  readonly approvedHours: number;
  /** Earliest and latest day covered by any counted record, ISO; null when none. */
  readonly from: string | null;
  readonly to: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function organizationAllTime(wi: WorkIntelligence | null): OrganizationAllTime | null {
  const all = wi?.organizationRecords?.find((p) => p.key === "all") ?? null;
  if (!wi || !all) return null;
  const periods = wi.organizationPeriodRecords ?? [];
  const dayRecords = (wi.organizationDayRecords ?? wi.organizationContextRecords ?? []).filter(
    (r) => r.status !== "rejected" && Number.isFinite(r.hours) && r.hours > 0,
  );

  let periodHours = 0;
  let periodRecords = 0;
  let from: string | null = null;
  let to: string | null = null;
  const widen = (a: string, b: string) => {
    if (from === null || a < from) from = a;
    if (to === null || b > to) to = b;
  };
  for (const r of dayRecords) widen(r.workDate, r.workDate);

  const overlapping: WorkIntelligenceOrganizationPeriodRecord[] = [];
  for (const p of periods) {
    const overlaps = dayRecords.some(
      (d) =>
        d.organizationId === p.organizationId &&
        d.workDate >= p.periodStart &&
        d.workDate <= p.periodEnd,
    );
    if (overlaps) {
      overlapping.push(p);
      continue;
    }
    periodHours += p.hours;
    periodRecords += 1;
    widen(p.periodStart, p.periodEnd);
  }

  return {
    dayHours: all.hours,
    days: all.daysWorked,
    periodHours: round2(periodHours),
    periodRecords,
    overlapping,
    totalHours: round2(all.hours + periodHours),
    importedHours: round2(all.importedHours + periodHours),
    approvedHours: all.approvedHours,
    from,
    to,
  };
}
