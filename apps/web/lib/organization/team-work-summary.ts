/**
 * TEAM RECORDED-WORK SUMMARY — the organization's compact roll-up over its
 * roster, shaped from N results of THE one work-intelligence reader. Pure:
 * no IO, no persistence, no AI, no arithmetic over journal lines of its own.
 *
 * ── WHY THIS IS NOT A SECOND LEDGER (owner requirements 15–17, #1724) ─────
 * The organization side reuses the same reader the person's own "work in
 * numbers", the Living CV, the chat and the person page compose:
 * `loadWorkIntelligence(caller, workerId, { focus })`, called AS THE MANAGER,
 * once per roster row. RLS — not this module — decides what each call
 * returns: a manager reads exactly the entries logged against their own
 * organization's engagements (`journal_entries_select`: own worker OR admin
 * OR manager of the entry's engagement organization) and the organization's
 * own hour records (`work_hour_allocations_select`: own worker OR manages
 * the organization). No aggregate query, no team table, no admin client.
 *
 * ── WHAT THIS MODULE DOES ─────────────────────────────────────────────────
 * It only RESHAPES one model per member into the few figures a roster row
 * can carry, and counts the members by state. Every figure is copied from a
 * `WorkPeriodTotals` / `SkillWorkTime` / `OrganizationRecordTotals` row the
 * model already derived; nothing here re-derives an hour.
 *
 * ── THE STATES IT KEEPS APART (SEP-7 / SEP-8) ─────────────────────────────
 *   UNKNOWN              the reader returned `null` — a read failed. The
 *                        member shows "could not be read", never 0 h, and is
 *                        excluded from (and counted beside) every total.
 *   NO_READABLE_RECORDS  the reader answered, but the database let this
 *                        caller see NO journal entries for the member
 *                        (`coverage.entriesRead === 0`). For the
 *                        organization this is not "did no work": the
 *                        member's personal or other-employer entries never
 *                        enter a manager's model (DATA EXISTS ≠ VISIBLE). It
 *                        is said as "no readable records", never as 0 h.
 *   MEASURED             at least one readable entry; the period figures are
 *                        the model's own.
 * The organization's own ledger (`organizationRecords`) has the same three
 * states of its own — `null` = unknown, no rows = none, rows = measured —
 * and is carried BESIDE the journal figures. The two are never added: the
 * team totals below are one per ledger, each naming the members it rests on.
 */

import type {
  OrganizationRecordTotals,
  WorkIntelligence,
  WorkPeriodKey,
  WorkPeriodTotals,
} from "@/lib/journal/work-intelligence";

/** How many skills a roster row names (by share of the member's own
 *  attributed hours — a fraction of THEIR hours, never a rank of people). */
export const TEAM_TOP_SKILLS = 3;

/** How many roster rows the roll-up reads — the bound the page states. The
 *  roster read itself is capped at 50; this keeps the hub to at most
 *  TEAM_ROLLUP_MAX × the reader's own bounded reads per page load. */
export const TEAM_ROLLUP_MAX = 12;

export type TeamMemberInput = {
  readonly workerId: string;
  /** What the roster already shows for the person (display name or email). */
  readonly name: string;
  /** THE reader's answer for this member, called as the manager. `null` =
   *  a read failed (UNKNOWN). */
  readonly wi: WorkIntelligence | null;
};

export type TeamMemberJournal =
  | { readonly state: "unknown" }
  | { readonly state: "no_readable_records" }
  | {
      readonly state: "measured";
      readonly hours: number;
      readonly dayUnits: number;
      readonly entries: number;
      readonly daysWorked: number;
      readonly confirmedHours: number;
      /** `confirmedHours / hours`, 0..1 — `null` when there are no hours
       *  to take a share of (a share of nothing is not 0 %). */
      readonly confirmedShare: number | null;
      /** Top skills by share of the member's own attributed hours in the
       *  period; only skills that actually claim hours. */
      readonly topSkills: readonly {
        readonly slug: string;
        readonly attributedHours: number;
        readonly share: number;
      }[];
      /** The read stopped at a ceiling — figures rest on the last N entries. */
      readonly coverageTruncated: boolean;
      readonly entriesRead: number;
    };

export type TeamMemberOrganizationLedger =
  | { readonly state: "unknown" }
  | { readonly state: "none" }
  | {
      readonly state: "measured";
      readonly hours: number;
      readonly rows: number;
      readonly daysWorked: number;
      readonly importedHours: number;
      readonly approvedHours: number;
      readonly linkedHours: number;
      readonly rejectedHours: number;
    };

export type TeamMemberWorkSummary = {
  readonly workerId: string;
  readonly name: string;
  /** The period the figures describe (the model's own `focus`). */
  readonly period: WorkPeriodKey;
  readonly journal: TeamMemberJournal;
  /** The organization's own hour ledger for the same period — beside the
   *  journal, never inside it. */
  readonly organization: TeamMemberOrganizationLedger;
};

export type TeamWorkSummary = {
  readonly period: WorkPeriodKey;
  readonly members: readonly TeamMemberWorkSummary[];
  /** Members by journal state — the counts a roll-up line names. */
  readonly measured: number;
  readonly noReadableRecords: number;
  readonly unknown: number;
  /** Journal hours in the period, summed over MEASURED members only, with
   *  the base it rests on. `null` when no member was measured (nothing to
   *  total is not 0 h). Never includes the organization ledger. */
  readonly journalHours: { readonly hours: number; readonly members: number } | null;
  /** The organization ledger's hours in the period over the members whose
   *  ledger was read (`measured` or `none`), with its own base. `null` when
   *  no member's ledger was read. Never includes journal hours. */
  readonly organizationHours: { readonly hours: number; readonly members: number } | null;
  /** How many roster rows were read against how many the roster holds. */
  readonly bound: { readonly shown: number; readonly total: number };
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function periodRow(wi: WorkIntelligence): WorkPeriodTotals | null {
  return wi.periods.find((p) => p.key === wi.scope) ?? null;
}

function organizationRow(wi: WorkIntelligence): OrganizationRecordTotals | null {
  if (wi.organizationRecords === null) return null;
  return wi.organizationRecords.find((p) => p.key === wi.scope) ?? null;
}

/** One member's row — every figure copied from the model, none derived. */
export function summarizeTeamMemberWork(input: TeamMemberInput): TeamMemberWorkSummary {
  const { workerId, name, wi } = input;
  if (wi === null) {
    return {
      workerId,
      name,
      period: "all",
      journal: { state: "unknown" },
      organization: { state: "unknown" },
    };
  }
  const period = wi.focus;
  const row = periodRow(wi);

  let journal: TeamMemberJournal;
  if (wi.coverage.entriesRead === 0 || row === null) {
    journal = { state: "no_readable_records" };
  } else {
    const topSkills = wi.skills
      .filter((s) => s.attributedHours > 0 && s.share > 0)
      .slice()
      .sort((a, b) => b.share - a.share || b.attributedHours - a.attributedHours)
      .slice(0, TEAM_TOP_SKILLS)
      .map((s) => ({ slug: s.slug, attributedHours: s.attributedHours, share: s.share }));
    journal = {
      state: "measured",
      hours: row.hours,
      dayUnits: row.dayUnits,
      entries: row.entries,
      daysWorked: row.daysWorked,
      confirmedHours: row.confirmedHours,
      confirmedShare: row.hours > 0 ? round2(row.confirmedHours / row.hours) : null,
      topSkills,
      coverageTruncated: wi.coverage.truncated,
      entriesRead: wi.coverage.entriesRead,
    };
  }

  let organization: TeamMemberOrganizationLedger;
  const org = organizationRow(wi);
  if (wi.organizationRecords === null || org === null) {
    organization = { state: "unknown" };
  } else if (org.rows === 0 && org.rejectedHours === 0) {
    organization = { state: "none" };
  } else {
    organization = {
      state: "measured",
      hours: org.hours,
      rows: org.rows,
      daysWorked: org.daysWorked,
      importedHours: org.importedHours,
      approvedHours: org.approvedHours,
      linkedHours: org.linkedHours,
      rejectedHours: org.rejectedHours,
    };
  }

  return { workerId, name, period, journal, organization };
}

/**
 * The roster roll-up: the first `TEAM_ROLLUP_MAX` rows of `members` (the
 * page states the bound), each through `summarizeTeamMemberWork`. Totals are
 * one per ledger, over the members whose ledger was actually read, and an
 * UNKNOWN member is counted as unknown — it never becomes a 0 in a total.
 */
export function summarizeTeamWork(
  members: readonly TeamMemberInput[],
  opts: { readonly period: WorkPeriodKey; readonly rosterTotal?: number } ,
): TeamWorkSummary {
  const shown = members.slice(0, TEAM_ROLLUP_MAX);
  const rows = shown.map(summarizeTeamMemberWork);

  let measured = 0;
  let noReadableRecords = 0;
  let unknown = 0;
  let journalHours = 0;
  let journalMembers = 0;
  let orgHours = 0;
  let orgMembers = 0;
  for (const m of rows) {
    if (m.journal.state === "measured") {
      measured += 1;
      journalMembers += 1;
      journalHours += m.journal.hours;
    } else if (m.journal.state === "no_readable_records") {
      noReadableRecords += 1;
    } else {
      unknown += 1;
    }
    if (m.organization.state === "measured") {
      orgMembers += 1;
      orgHours += m.organization.hours;
    } else if (m.organization.state === "none") {
      orgMembers += 1;
    }
  }

  return {
    period: opts.period,
    members: rows,
    measured,
    noReadableRecords,
    unknown,
    journalHours:
      journalMembers > 0 ? { hours: round2(journalHours), members: journalMembers } : null,
    organizationHours:
      orgMembers > 0 ? { hours: round2(orgHours), members: orgMembers } : null,
    bound: { shown: rows.length, total: opts.rosterTotal ?? members.length },
  };
}
