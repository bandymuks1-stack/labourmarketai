import { describe, expect, it } from "vitest";

import {
  deriveWorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkIntelligenceOrganizationRecord,
} from "@/lib/journal/work-intelligence";
import {
  summarizeTeamMemberWork,
  summarizeTeamWork,
  TEAM_ROLLUP_MAX,
  TEAM_TOP_SKILLS,
} from "./team-work-summary";

/**
 * The roster roll-up is N × the ONE reader, reshaped — never a new sum over
 * journal lines. These tests build REAL models through `deriveWorkIntelligence`
 * (the same model the reader hands back) and assert the shaping only.
 *
 * NEGATIVE CONTROLS pinned here:
 *   · a `null` reader result for one member never becomes 0 h anywhere — it
 *     is `unknown`, counted beside the totals, absent from them;
 *   · a member the database showed no entries for is "no readable records",
 *     not 0 h;
 *   · the organization ledger and the journal figures are never added.
 */

const TODAY = "2026-09-13";

function entry(
  id: string,
  day: string,
  hours: number,
  linked: string[],
  approved = false,
): WorkIntelligenceEntry {
  return {
    entryId: id,
    createdAt: `${day}T12:00:00.000Z`,
    originalText: id,
    metrics: [
      { metric_slug: "work_date", value_text: day, value_numeric: null, unit_slug: null },
      { metric_slug: "quantity", value_text: null, value_numeric: hours, unit_slug: "hours", source: "worker_input" },
    ],
    engagementContextId: "ctx-org",
    reviewResult: approved ? "approved" : "submitted",
    linkedSkillIds: linked,
  };
}

const SKILLS = [
  { skillId: "s-tiling", slug: "tiling", verified: true, source: "manager_confirmed" },
  { skillId: "s-plaster", slug: "plastering", verified: false, source: "work_journal" },
  { skillId: "s-paint", slug: "painting", verified: false, source: null },
  { skillId: "s-idle", slug: "welding", verified: false, source: null },
];

function model(input: {
  entries: WorkIntelligenceEntry[];
  organizationRecords?: readonly WorkIntelligenceOrganizationRecord[] | null;
  truncated?: boolean;
}) {
  return deriveWorkIntelligence({
    todayIso: TODAY,
    focus: "month",
    entries: input.entries,
    skills: SKILLS,
    coverage: { entriesRead: input.entries.length, truncated: input.truncated ?? false },
    organizationRecords: input.organizationRecords === undefined ? null : input.organizationRecords,
  });
}

const ORG_ROWS: WorkIntelligenceOrganizationRecord[] = [
  { id: "o1", workDate: "2026-09-10", hours: 8, source: "import", status: "recorded", organizationId: "org-1", journalEntryId: null },
  { id: "o2", workDate: "2026-09-11", hours: 6, source: "manual", status: "approved", organizationId: "org-1", journalEntryId: null },
];

describe("summarizeTeamMemberWork — one member, every figure the model's own", () => {
  it("a measured member carries the focus period's hours, entries, confirmed share and top skills by share", () => {
    const wi = model({
      entries: [
        entry("a", "2026-09-10", 6, ["s-tiling"], true),
        entry("b", "2026-09-08", 3, ["s-plaster"]),
        entry("c", "2026-09-05", 1, ["s-paint"]),
        entry("d", "2026-06-01", 40, ["s-tiling"]), // outside the 30-day focus
      ],
      organizationRecords: ORG_ROWS,
    });
    const row = summarizeTeamMemberWork({ workerId: "w1", name: "Jonas", wi });
    expect(row.period).toBe("month");
    expect(row.journal.state).toBe("measured");
    if (row.journal.state !== "measured") return;
    const month = wi.periods.find((p) => p.key === "month")!;
    expect(row.journal.hours).toBe(month.hours);
    expect(row.journal.hours).toBe(10);
    expect(row.journal.entries).toBe(3);
    expect(row.journal.confirmedHours).toBe(6);
    expect(row.journal.confirmedShare).toBe(0.6);
    expect(row.journal.topSkills.map((s) => s.slug)).toEqual(["tiling", "plastering", "painting"]);
    expect(row.journal.topSkills[0]).toEqual({ slug: "tiling", attributedHours: 6, share: 0.6 });
    expect(row.journal.topSkills.length).toBeLessThanOrEqual(TEAM_TOP_SKILLS);
    // a declared skill with nothing recorded is not a "top skill"
    expect(row.journal.topSkills.some((s) => s.slug === "welding")).toBe(false);
    expect(row.journal.coverageTruncated).toBe(false);
    // the organization's ledger for the SAME period, beside — not inside
    expect(row.organization).toEqual({
      state: "measured",
      hours: 14,
      rows: 2,
      daysWorked: 2,
      importedHours: 8,
      approvedHours: 6,
      linkedHours: 0,
      rejectedHours: 0,
    });
    // the journal figure did not absorb the ledger's 14 h
    expect(row.journal.hours).toBe(10);
  });

  it("NEGATIVE CONTROL · a null reader result is UNKNOWN — never 0 h, and the ledger is unknown too", () => {
    const row = summarizeTeamMemberWork({ workerId: "w2", name: "Ona", wi: null });
    expect(row.journal).toEqual({ state: "unknown" });
    expect(row.organization).toEqual({ state: "unknown" });
    expect(JSON.stringify(row)).not.toMatch(/"hours":0/);
  });

  it("a member the caller may read no entries for is 'no readable records', not 0 h", () => {
    const wi = model({ entries: [], organizationRecords: [] });
    const row = summarizeTeamMemberWork({ workerId: "w3", name: "Petras", wi });
    expect(row.journal).toEqual({ state: "no_readable_records" });
    // the ledger was read and holds nothing: NONE, distinct from UNKNOWN
    expect(row.organization).toEqual({ state: "none" });
  });

  it("the ledger can be measured while the journal has no readable entries — the two states are independent", () => {
    const wi = model({ entries: [], organizationRecords: ORG_ROWS });
    const row = summarizeTeamMemberWork({ workerId: "w4", name: "Rasa", wi });
    expect(row.journal.state).toBe("no_readable_records");
    expect(row.organization.state).toBe("measured");
  });

  it("a ledger the reader could not read is UNKNOWN beside a measured journal", () => {
    const wi = model({ entries: [entry("a", "2026-09-10", 2, ["s-tiling"])], organizationRecords: null });
    const row = summarizeTeamMemberWork({ workerId: "w5", name: "Tomas", wi });
    expect(row.journal.state).toBe("measured");
    expect(row.organization).toEqual({ state: "unknown" });
  });

  it("a confirmed share of no hours is null, not 0 %", () => {
    const wi = model({
      entries: [
        {
          ...entry("a", "2026-09-10", 0, ["s-tiling"]),
          metrics: [{ metric_slug: "work_date", value_text: "2026-09-10", value_numeric: null, unit_slug: null }],
        },
      ],
      organizationRecords: [],
    });
    const row = summarizeTeamMemberWork({ workerId: "w6", name: "Eglė", wi });
    expect(row.journal.state).toBe("measured");
    if (row.journal.state !== "measured") return;
    expect(row.journal.hours).toBe(0);
    expect(row.journal.confirmedShare).toBeNull();
  });

  it("a capped read is said — the row carries the model's coverage", () => {
    const wi = model({ entries: [entry("a", "2026-09-10", 2, ["s-tiling"])], truncated: true });
    const row = summarizeTeamMemberWork({ workerId: "w7", name: "A", wi });
    expect(row.journal.state).toBe("measured");
    if (row.journal.state !== "measured") return;
    expect(row.journal.coverageTruncated).toBe(true);
    expect(row.journal.entriesRead).toBe(1);
  });
});

describe("summarizeTeamWork — N × the reader, counted by state, totals per ledger", () => {
  const measuredA = model({ entries: [entry("a", "2026-09-10", 6, ["s-tiling"], true)], organizationRecords: ORG_ROWS });
  const measuredB = model({ entries: [entry("b", "2026-09-09", 4, ["s-plaster"])], organizationRecords: [] });
  const nothingReadable = model({ entries: [], organizationRecords: [] });

  it("NEGATIVE CONTROL · an UNKNOWN member stays UNKNOWN in the roll-up: counted, excluded from every total, never a 0", () => {
    const team = summarizeTeamWork(
      [
        { workerId: "w1", name: "A", wi: measuredA },
        { workerId: "w2", name: "B", wi: null },
        { workerId: "w3", name: "C", wi: measuredB },
      ],
      { period: "month" },
    );
    expect(team.unknown).toBe(1);
    expect(team.measured).toBe(2);
    expect(team.noReadableRecords).toBe(0);
    expect(team.journalHours).toEqual({ hours: 10, members: 2 });
    expect(team.members[1]).toMatchObject({ workerId: "w2", journal: { state: "unknown" } });
    // the unknown member's ledger is unknown as well — the ledger base is 2, not 3
    expect(team.organizationHours).toEqual({ hours: 14, members: 2 });
  });

  it("NEGATIVE CONTROL · the organization ledger is never added to the journal total — two totals, two bases", () => {
    const team = summarizeTeamWork([{ workerId: "w1", name: "A", wi: measuredA }], { period: "month" });
    expect(team.journalHours).toEqual({ hours: 6, members: 1 });
    expect(team.organizationHours).toEqual({ hours: 14, members: 1 });
    expect(team.journalHours!.hours + team.organizationHours!.hours).toBe(20); // arithmetic that must appear NOWHERE in the summary
    expect(JSON.stringify(team)).not.toContain("20");
  });

  it("no readable records is counted as its own state, and contributes no hours", () => {
    const team = summarizeTeamWork(
      [
        { workerId: "w1", name: "A", wi: nothingReadable },
        { workerId: "w2", name: "B", wi: nothingReadable },
      ],
      { period: "month" },
    );
    expect(team.noReadableRecords).toBe(2);
    expect(team.measured).toBe(0);
    expect(team.journalHours).toBeNull();
    // both ledgers were read (none) — the ledger base is honest about that
    expect(team.organizationHours).toEqual({ hours: 0, members: 2 });
  });

  it("when nothing was readable at all, both totals are null — nothing to total is not 0 h", () => {
    const team = summarizeTeamWork([{ workerId: "w1", name: "A", wi: null }], { period: "month" });
    expect(team.journalHours).toBeNull();
    expect(team.organizationHours).toBeNull();
    expect(team.unknown).toBe(1);
  });

  it("the bound is the roster rows already on the page, capped at TEAM_ROLLUP_MAX, and stated", () => {
    const many = Array.from({ length: TEAM_ROLLUP_MAX + 5 }, (_, i) => ({
      workerId: `w${i}`,
      name: `M${i}`,
      wi: measuredB,
    }));
    const team = summarizeTeamWork(many, { period: "month", rosterTotal: many.length });
    expect(team.members).toHaveLength(TEAM_ROLLUP_MAX);
    expect(team.bound).toEqual({ shown: TEAM_ROLLUP_MAX, total: TEAM_ROLLUP_MAX + 5 });
  });

  it("the period is the one the caller asked the reader for", () => {
    const team = summarizeTeamWork([{ workerId: "w1", name: "A", wi: measuredA }], { period: "month" });
    expect(team.period).toBe("month");
    expect(team.members[0]!.period).toBe("month");
  });
});
