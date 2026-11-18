/**
 * THE ORGANIZATION'S RECORDED JOURNAL WORK — one part of its CV (#3354,
 * organization side; Lane G's data contract, rule 2).
 *
 * Pure. A journal entry belongs to an organization ONLY through its
 * engagement (`journal_entries.engagement_context_id` →
 * `engagement_contexts.organization_id`); the reader passes the rows of this
 * organization's engagements and nothing else. The figures come from THE one
 * work-time model (`deriveWorkIntelligence`), each person's entries apart and
 * then summed, every correction chain counted once (`countedOnce`), and
 * "confirmed" is the one independent-review rule (the subject's own decision
 * never confirms).
 *
 * It is an aggregate of the organization's own records: no name, no per-person
 * line, no skill. The imported history is a separate ledger and is never
 * added to these hours (owner §19: bridged, never merged). Nothing here ever
 * reaches a personal CV (lib/guards/organization-cv-one-way.test.ts), and no
 * hour is attributed to an owner or a manager by their role.
 */
import { countedOnce } from "@/lib/journal/counted-once";
import { deriveIndependentReviewResult } from "@/lib/journal/review-status";
import { deriveWorkIntelligence } from "@/lib/journal/work-intelligence";
import type { WorkTimeMetricRow } from "@/lib/journal/work-time";

export type OrganizationJournalRow = {
  readonly id: string;
  readonly worker_id: string | null;
  readonly created_at: string;
  readonly correction_of?: string | null;
  readonly engagement_context_id: string | null;
  readonly subject?: { readonly profile_id: string | null } | null;
  readonly journal_entry_confirmations:
    | readonly {
        confirmation_scope: unknown;
        created_at?: string | null;
        confirmer_role?: string | null;
        confirmer_id?: string | null;
      }[]
    | null;
  readonly journal_entry_metrics: readonly WorkTimeMetricRow[] | null;
};

export type OrganizationJournal = {
  /** Live entries, each correction chain once. */
  readonly entries: number;
  /** Distinct people who recorded them. */
  readonly people: number;
  readonly hours: number;
  /** Hours on entries the organization independently APPROVED. */
  readonly confirmedHours: number;
  /** `days`-unit durations — never converted into hours. */
  readonly dayUnits: number;
  /** First and last work month (`YYYY-MM`) with an entry; null when none. */
  readonly firstMonth: string | null;
  readonly lastMonth: string | null;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function summarizeOrganizationJournal(
  rows: readonly OrganizationJournalRow[],
  todayIso: string,
  horizonIso?: string,
): OrganizationJournal {
  const unique = [...new Map(rows.map((r) => [r.id, r] as const)).values()];
  const counted = countedOnce(unique);
  const byPerson = new Map<string, OrganizationJournalRow[]>();
  for (const r of counted) {
    const key = r.worker_id ?? `entry:${r.id}`;
    byPerson.set(key, [...(byPerson.get(key) ?? []), r]);
  }
  let hours = 0;
  let confirmedHours = 0;
  let dayUnits = 0;
  let firstMonth: string | null = null;
  let lastMonth: string | null = null;
  for (const personRows of byPerson.values()) {
    const wi = deriveWorkIntelligence({
      entries: personRows.map((r) => ({
        entryId: r.id,
        createdAt: r.created_at,
        metrics: r.journal_entry_metrics ?? [],
        engagementContextId: r.engagement_context_id,
        reviewResult: deriveIndependentReviewResult(
          r.journal_entry_confirmations,
          r.subject?.profile_id ?? null,
        ),
        linkedSkillIds: [],
      })),
      skills: [],
      todayIso,
      horizonIso,
      focus: "all",
    });
    const all = wi.periods.find((p) => p.key === "all");
    hours += wi.totalHours;
    confirmedHours += all?.confirmedHours ?? 0;
    dayUnits += all?.dayUnits ?? 0;
    for (const m of wi.months) {
      if (m.entries <= 0) continue;
      if (!firstMonth || m.month < firstMonth) firstMonth = m.month;
      if (!lastMonth || m.month > lastMonth) lastMonth = m.month;
    }
  }
  const people = new Set(counted.map((r) => r.worker_id).filter((w): w is string => !!w));
  return {
    entries: counted.length,
    people: people.size,
    hours: round2(hours),
    confirmedHours: round2(confirmedHours),
    dayUnits: round2(dayUnits),
    firstMonth,
    lastMonth,
  };
}
