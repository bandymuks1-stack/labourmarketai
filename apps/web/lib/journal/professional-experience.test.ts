import { describe, expect, it } from "vitest";

import { deriveIndependentReviewResult } from "@/lib/journal/review-status";
import { organizationAllTime, organizationHoursBeyondJournal } from "@/lib/journal/organization-all-time";
import {
  deriveProfessionalExperience,
  type ExperienceRelationship,
} from "@/lib/journal/professional-experience";
import {
  deriveWorkIntelligence,
  type WorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkIntelligenceOrganizationPeriodRecord,
  type WorkIntelligenceOrganizationRecord,
} from "@/lib/journal/work-intelligence";

/**
 * ONE PERSON = ONE CONTINUOUS PROFESSIONAL HISTORY (decision 0025).
 *
 * The first block replays the owner's production rows (ids replaced, site
 * names and free text neutralised — public repository): 15 live journal
 * entries across three engagement contexts, ONE imported period record of
 * 800 h, ownership of the supplying organization with its earlier "Vivat
 * Rex" business period, and a manager membership in a second company with
 * no roster row and no records. Before this reading the product showed
 * "25.6 h" and "800 h" and refused a total.
 *
 * The second block pins the four owner scenarios (2026-10-17 §8): an owner
 * with no roster row, a director with a worker profile, a manager in several
 * companies, a manager who also does physical work.
 */

const TODAY = "2026-10-17";
const SUBJECT = "profile-owner";
const ORG_LM = "org-labour-market";
const ORG_NONSTOP = "org-nonstop";
const CTX_PERSONAL = "ctx-personal";
const CTX_LM_OWNER = "ctx-lm-owner";
const CTX_SHELL = "ctx-shell-ended";

type Metric = { metric_slug: string; value_numeric: number | null; value_text: string | null; unit_slug: string | null; source: string; created_at: string };
const m = (metric_slug: string, value_numeric: number | null, value_text: string | null, unit_slug: string | null, created_at: string): Metric => ({
  metric_slug,
  value_numeric,
  value_text,
  unit_slug,
  source: "worker_input",
  created_at,
});
const approvedByOther = [
  {
    confirmation_scope: { action: "confirm", decision: "approved" },
    created_at: "2026-05-30T09:10:01Z",
    confirmer_role: "owner",
    confirmer_id: "profile-other",
  },
];

/** The owner's 15 live entries as read back on 2026-10-17 (canonical rule → 25.58 h). */
const PRODUCTION_ENTRIES: { id: string; created_at: string; ctx: string; metrics: Metric[]; confirmations?: typeof approvedByOther }[] = [
  { id: "e01", created_at: "2026-05-23T03:51:45Z", ctx: CTX_PERSONAL, metrics: [m("work_date", null, "2026-05-23", null, "2026-05-23T03:51:45Z")] },
  { id: "e02", created_at: "2026-05-25T03:54:15Z", ctx: CTX_PERSONAL, metrics: [m("unresolved_fragment", null, "text", null, "2026-07-19T18:44:22Z")] },
  { id: "e03", created_at: "2026-05-25T04:42:01Z", ctx: CTX_PERSONAL, metrics: [m("unresolved_fragment", null, "text", null, "2026-07-19T18:44:21Z")] },
  {
    id: "e04",
    created_at: "2026-05-25T05:37:08Z",
    ctx: CTX_PERSONAL,
    metrics: [
      m("quantity", 4, null, "hours", "2026-05-25T05:37:08Z"),
      m("work_date", null, "2026-05-25", null, "2026-05-25T05:37:08Z"),
      m("parsed_fragment", null, "1|a", null, "2026-05-25T05:37:08Z"),
      m("fragment_time", 15, "1", "minutes", "2026-05-25T05:37:08Z"),
      m("parsed_fragment", null, "2|b", null, "2026-05-25T05:37:08Z"),
      m("fragment_time", 20, "2", "minutes", "2026-05-25T05:37:08Z"),
      m("parsed_fragment", null, "3|c", null, "2026-05-25T05:37:08Z"),
      m("fragment_time", 4, "3", "hours", "2026-05-25T05:37:08Z"),
      m("parsed_fragment", null, "4|d", null, "2026-05-25T05:37:08Z"),
      m("fragment_time", 2, "4", "hours", "2026-05-25T05:37:08Z"),
      m("parsed_fragment", null, "5|e", null, "2026-05-25T05:37:08Z"),
      m("fragment_time", 1, "5", "hours", "2026-05-25T05:37:08Z"),
    ],
  },
  { id: "e05", created_at: "2026-05-30T09:09:37Z", ctx: CTX_SHELL, metrics: [m("unresolved_fragment", null, "text", null, "2026-07-19T18:44:18Z")], confirmations: approvedByOther },
  { id: "e06", created_at: "2026-05-30T09:35:44Z", ctx: CTX_SHELL, metrics: [], confirmations: approvedByOther },
  {
    id: "e07",
    created_at: "2026-07-16T16:27:31Z",
    ctx: CTX_PERSONAL,
    metrics: [
      m("quantity", 5, null, "hours", "2026-07-16T16:27:31Z"),
      m("work_date", null, "2026-07-02", null, "2026-07-16T16:27:31Z"),
      m("parsed_fragment", null, "1|a", null, "2026-07-16T16:27:31Z"),
      m("fragment_time", 5, "1", "hours", "2026-07-16T16:27:31Z"),
      m("fragment_activity", null, "1|event_organizer", null, "2026-07-16T16:27:31Z"),
      m("parsed_fragment", null, "2|b", null, "2026-07-16T16:27:31Z"),
      m("fragment_time", 1, "2", "hours", "2026-07-16T16:27:31Z"),
      m("fragment_activity", null, "2|cleaner", null, "2026-07-16T16:27:31Z"),
      m("parsed_fragment", null, "3|c", null, "2026-07-16T16:27:31Z"),
      m("fragment_time", 3, "3", "hours", "2026-07-16T16:27:31Z"),
      m("fragment_activity", null, "3|Programavimas", null, "2026-07-16T16:27:31Z"),
    ],
  },
  { id: "e08", created_at: "2026-07-16T16:28:52Z", ctx: CTX_PERSONAL, metrics: [m("quantity", 9, null, "hours", "2026-07-16T16:28:52Z"), m("work_date", null, "2026-06-24", null, "2026-07-16T16:28:52Z")] },
  { id: "e09", created_at: "2026-07-16T16:29:16Z", ctx: CTX_PERSONAL, metrics: [m("quantity", 50, null, "square_meters", "2026-07-16T16:29:16Z"), m("work_date", null, "2026-06-02", null, "2026-07-16T16:29:16Z")] },
  { id: "e10", created_at: "2026-07-29T18:22:54Z", ctx: CTX_LM_OWNER, metrics: [m("site_name", null, "site-a", null, "2026-07-29T18:22:54Z"), m("work_date", null, "2026-07-29", null, "2026-07-29T18:22:54Z")] },
  { id: "e11", created_at: "2026-07-29T18:57:16Z", ctx: CTX_PERSONAL, metrics: [m("work_date", null, "2026-07-29", null, "2026-07-29T18:57:16Z")] },
  { id: "e12", created_at: "2026-08-30T13:16:41Z", ctx: CTX_LM_OWNER, metrics: [m("work_date", null, "2026-08-30", null, "2026-08-30T13:16:41Z")] },
  { id: "e13", created_at: "2026-09-11T03:11:13Z", ctx: CTX_LM_OWNER, metrics: [m("site_name", null, "site-b", null, "2026-09-11T03:11:13Z"), m("work_date", null, "2026-09-11", null, "2026-09-11T03:11:13Z"), m("unresolved_fragment", null, "text", null, "2026-09-11T03:11:13Z")] },
  { id: "e14", created_at: "2026-09-11T03:14:39Z", ctx: CTX_LM_OWNER, metrics: [m("site_name", null, "site-c", null, "2026-09-11T03:14:39Z"), m("work_date", null, "2026-09-11", null, "2026-09-11T03:14:39Z"), m("unresolved_fragment", null, "text 9 h", null, "2026-09-11T03:14:39Z")] },
  { id: "e15", created_at: "2026-09-13T03:07:08Z", ctx: CTX_LM_OWNER, metrics: [m("site_name", null, "site-d", null, "2026-09-13T03:07:08Z"), m("work_date", null, "2026-09-12", null, "2026-09-13T03:07:08Z"), m("unresolved_fragment", null, "text", null, "2026-09-13T03:07:08Z")] },
];

/** The ONE imported record about the owner: a period aggregate, as read back. */
const PRODUCTION_PERIOD: WorkIntelligenceOrganizationPeriodRecord = {
  id: "rec-800",
  periodStart: "2025-06-01",
  periodEnd: "2025-11-30",
  hours: 800,
  source: "import",
  organizationId: ORG_LM,
  provenance: "human_choice",
};

const OWNER_RELATIONSHIPS: ExperienceRelationship[] = [
  {
    engagementContextId: CTX_LM_OWNER,
    organizationId: ORG_LM,
    organizationName: "Labour market ai Sp. z o.o",
    relationship: "owner",
    title: null,
    startedAt: null,
    endedAt: null,
    current: true,
    source: "engagement",
    businessPeriods: [
      { id: "bp-vivat", label: "Vivat Rex", from: null, to: null, basis: "owner_statement", legalEntityRelation: "not_asserted" },
    ],
  },
  // The canonical Nonstop company: a manager MEMBERSHIP, no engagement row,
  // no roster row, no record — the director who never wrote themselves into
  // their own company's worker list.
  {
    engagementContextId: null,
    organizationId: ORG_NONSTOP,
    organizationName: "UAB Nonstop Group",
    relationship: "manager",
    title: null,
    startedAt: null,
    endedAt: null,
    current: true,
    source: "membership",
    businessPeriods: [],
  },
  // An ended employee engagement in an archived test shell with a name
  // (kept: an ended relationship is history).
  {
    engagementContextId: CTX_SHELL,
    organizationId: "org-shell",
    organizationName: "Test shell",
    relationship: "employee",
    title: null,
    startedAt: null,
    endedAt: "2026-09-23",
    current: false,
    source: "engagement",
    businessPeriods: [],
  },
];

function entriesOf(rows: typeof PRODUCTION_ENTRIES, projectByEntry: Record<string, string> = {}): WorkIntelligenceEntry[] {
  return rows.map((e) => ({
    entryId: e.id,
    createdAt: e.created_at,
    metrics: e.metrics,
    engagementContextId: e.ctx,
    projectId: projectByEntry[e.id] ?? null,
    reviewResult: deriveIndependentReviewResult(e.confirmations ?? null, SUBJECT),
    linkedSkillIds: [],
  }));
}

function model(input: {
  entries?: WorkIntelligenceEntry[];
  dayRecords?: WorkIntelligenceOrganizationRecord[] | null;
  periodRecords?: WorkIntelligenceOrganizationPeriodRecord[];
  focus?: "all" | "week";
}): WorkIntelligence {
  return deriveWorkIntelligence({
    entries: input.entries ?? [],
    skills: [],
    todayIso: TODAY,
    focus: input.focus ?? "all",
    organizationRecords: input.dayRecords === undefined ? [] : input.dayRecords,
    organizationPeriodRecords: input.periodRecords ?? [],
  });
}

describe("the owner's real history (production rows, 2026-10-17)", () => {
  const wi = model({ entries: entriesOf(PRODUCTION_ENTRIES), periodRecords: [PRODUCTION_PERIOD] });
  const exp = deriveProfessionalExperience({ wi, relationships: OWNER_RELATIONSHIPS });

  it("BEFORE: the two figures the product showed — 25.58 h journal, 800 h organization history", () => {
    expect(wi.totalHours).toBe(25.58);
    expect(organizationAllTime(wi)?.totalHours).toBe(800);
    expect(organizationHoursBeyondJournal(wi)).toBe(800);
  });

  it("AFTER: one total — 825.58 h — every work hour once, provenance kept apart", () => {
    expect(exp.hours).toEqual({
      total: 825.58,
      journal: 25.58,
      journalConfirmed: 0,
      organizationDays: 0,
      organizationPeriods: 800,
      notCounted: 0,
      organizationUnknown: false,
    });
    expect(exp.from).toBe("2025-06-01");
    expect(exp.to).toBe("2026-07-02");
  });

  it("the 800 h period keeps its span and its one figure — no invented days", () => {
    const period = exp.lines.find((l) => l.source === "organization_period")!;
    expect(period).toMatchObject({
      counted: true,
      hours: 800,
      from: "2025-06-01",
      to: "2025-11-30",
      organizationId: ORG_LM,
      organizationName: "Labour market ai Sp. z o.o",
      spanProvenance: "human_choice",
      evidence: "organization_reported",
    });
    // nothing in the reading spreads it: no journal day, no day record, no month row carries a share of it
    expect(wi.months.map((x) => x.hours).reduce((a, b) => a + b, 0)).toBe(25.58);
  });

  it("per organization: the company the owner leads holds the 800 h, the owner role and the Vivat Rex period; Nonstop is a role without hours; personal entries hold the journal hours", () => {
    const lm = exp.organizations.find((o) => o.organizationId === ORG_LM)!;
    expect(lm.totalHours).toBe(800);
    expect(lm.organizationHours).toBe(800);
    expect(lm.journalHours).toBe(0);
    expect(lm.entries).toBe(5); // five owner-context entries without a duration — still the person's record
    expect(lm.roles.map((r) => r.relationship)).toEqual(["owner"]);
    expect(lm.businessPeriods.map((p) => p.label)).toEqual(["Vivat Rex"]);

    const nonstop = exp.organizations.find((o) => o.organizationId === ORG_NONSTOP)!;
    expect(nonstop.totalHours).toBe(0);
    expect(nonstop.roles).toEqual([
      expect.objectContaining({ relationship: "manager", source: "membership", current: true }),
    ]);

    const personal = exp.organizations.find((o) => o.organizationId === null)!;
    expect(personal.journalHours).toBe(25.58);
    expect(personal.entries).toBe(8);
    expect(personal.roles).toEqual([]);
  });

  it("the ended shell engagement stays listed (history), with its two confirmed-but-untimed entries and no hours", () => {
    const shell = exp.organizations.find((o) => o.organizationId === "org-shell")!;
    expect(shell.totalHours).toBe(0);
    expect(shell.entries).toBe(2);
    expect(shell.roles[0]).toMatchObject({ relationship: "employee", current: false, endedAt: "2026-09-23" });
  });

  it("the total does not move with the period tab (all-time lines are not focus-scoped)", () => {
    const week = model({ entries: entriesOf(PRODUCTION_ENTRIES), periodRecords: [PRODUCTION_PERIOD], focus: "week" });
    expect(deriveProfessionalExperience({ wi: week, relationships: OWNER_RELATIONSHIPS }).hours?.total).toBe(825.58);
  });

  it("without the relationships read (null) the figures are identical; only the roles are missing", () => {
    const noRoles = deriveProfessionalExperience({ wi, relationships: null });
    expect(noRoles.hours).toEqual(exp.hours);
    expect(noRoles.roles).toEqual([]);
    expect(noRoles.organizations.every((o) => o.roles.length === 0)).toBe(true);
  });
});

describe("owner scenarios (2026-10-17 §8)", () => {
  const day = (id: string, org: string, workDate: string, hours: number, journalEntryId: string | null = null): WorkIntelligenceOrganizationRecord => ({
    id,
    workDate,
    hours,
    source: "import",
    status: "recorded",
    organizationId: org,
    journalEntryId,
  });
  const entry = (id: string, ctx: string | null, workDate: string, hours: number, approved = false): WorkIntelligenceEntry => ({
    entryId: id,
    createdAt: `${workDate}T10:00:00Z`,
    metrics: [m("quantity", hours, null, "hours", `${workDate}T10:00:00Z`), m("work_date", null, workDate, null, `${workDate}T10:00:00Z`)],
    engagementContextId: ctx,
    reviewResult: approved ? "approved" : "submitted",
    linkedSkillIds: [],
  });
  const rel = (p: Partial<ExperienceRelationship> & Pick<ExperienceRelationship, "organizationId" | "relationship">): ExperienceRelationship => ({
    engagementContextId: null,
    organizationName: `Org ${p.organizationId}`,
    title: null,
    startedAt: null,
    endedAt: null,
    current: true,
    source: "membership",
    businessPeriods: [],
    ...p,
  });

  it("an owner with no roster row and no records: the ownership is history, with zero hours and nothing invented", () => {
    const exp = deriveProfessionalExperience({
      wi: model({}),
      relationships: [rel({ organizationId: "org-a", relationship: "owner", startedAt: "2024-01-01" })],
    });
    expect(exp.hours).toMatchObject({ total: 0, journal: 0 });
    expect(exp.organizations).toHaveLength(1);
    expect(exp.organizations[0]).toMatchObject({ organizationId: "org-a", totalHours: 0, roles: [expect.objectContaining({ relationship: "owner" })] });
    expect(exp.lines).toEqual([]);
  });

  it("a director with a worker profile: the director role and the person's own recorded hours live in ONE history", () => {
    const wi = model({ entries: [entry("j1", "ctx-a", "2026-03-01", 6)] });
    const exp = deriveProfessionalExperience({
      wi,
      relationships: [
        rel({ organizationId: "org-a", relationship: "manager" }),
        rel({ organizationId: "org-a", relationship: "employee", engagementContextId: "ctx-a", source: "engagement" }),
      ],
    });
    const a = exp.organizations.find((o) => o.organizationId === "org-a")!;
    expect(a.roles.map((r) => r.relationship).sort()).toEqual(["employee", "manager"]);
    expect(a.journalHours).toBe(6);
    expect(exp.hours?.total).toBe(6);
  });

  it("a manager in several companies: each company is listed with its role; the companies' project hours never become the manager's", () => {
    // Day records about OTHER people never reach this reading (the reader is
    // keyed on the person's own linked roster rows); here the ledger holds
    // nothing about the manager, so both companies carry a role and 0 h.
    const exp = deriveProfessionalExperience({
      wi: model({}),
      relationships: [
        rel({ organizationId: "org-a", relationship: "manager" }),
        rel({ organizationId: "org-b", relationship: "owner", businessPeriods: [{ id: "p", label: "Earlier name", from: "2020-01-01", to: "2022-12-31", basis: "owner_statement", legalEntityRelation: "renamed" }] }),
      ],
    });
    expect(exp.organizations.map((o) => [o.organizationId, o.totalHours, o.roles[0]?.relationship])).toEqual([
      ["org-b", 0, "owner"],
      ["org-a", 0, "manager"],
    ].sort() as never);
    expect(exp.organizations.find((o) => o.organizationId === "org-b")?.businessPeriods[0]?.label).toBe("Earlier name");
    expect(exp.hours?.total).toBe(0);
  });

  it("a manager who also does physical work: management is a role; the physical work's hours count once, confirmed hours shown apart", () => {
    const wi = model({
      entries: [entry("j1", "ctx-a", "2026-03-01", 8, true), entry("j2", "ctx-a", "2026-03-02", 4)],
      dayRecords: [day("d1", "org-a", "2026-03-01", 8, "j1"), day("d2", "org-a", "2026-03-05", 5)],
    });
    const exp = deriveProfessionalExperience({
      wi,
      relationships: [
        rel({ organizationId: "org-a", relationship: "manager" }),
        rel({ organizationId: "org-a", relationship: "employee", engagementContextId: "ctx-a", source: "engagement" }),
      ],
    });
    // 12 h journal (8 confirmed) + 5 h organization day record; the 8 h day
    // record that describes j1 is listed, not added.
    expect(exp.hours).toEqual({
      total: 17,
      journal: 12,
      journalConfirmed: 8,
      organizationDays: 5,
      organizationPeriods: 0,
      notCounted: 8,
      organizationUnknown: false,
    });
    const listed = exp.lines.find((l) => !l.counted)!;
    expect(listed).toMatchObject({ source: "organization_day", hours: 8, notCountedReason: "describes_journal_entry" });
    // consistent with the pinned all-time organization rule
    expect(organizationHoursBeyondJournal(wi)).toBe(5);
  });
});

describe("dedup and honesty rules", () => {
  const entry = (id: string, ctx: string | null, workDate: string, hours: number): WorkIntelligenceEntry => ({
    entryId: id,
    createdAt: `${workDate}T10:00:00Z`,
    metrics: [m("quantity", hours, null, "hours", `${workDate}T10:00:00Z`), m("work_date", null, workDate, null, `${workDate}T10:00:00Z`)],
    engagementContextId: ctx,
    reviewResult: "submitted",
    linkedSkillIds: [],
  });
  const period = (id: string, org: string, from: string, to: string, hours: number): WorkIntelligenceOrganizationPeriodRecord => ({
    id,
    periodStart: from,
    periodEnd: to,
    hours,
    source: "import",
    organizationId: org,
    provenance: "source",
  });
  const relA: ExperienceRelationship = {
    engagementContextId: "ctx-a",
    organizationId: "org-a",
    organizationName: "A",
    relationship: "employee",
    title: null,
    startedAt: null,
    endedAt: null,
    current: true,
    source: "engagement",
    businessPeriods: [],
  };

  it("a period over the same organization's day records is listed, not added (the pinned all-time rule)", () => {
    const wi = model({
      dayRecords: [{ id: "d", workDate: "2025-07-01", hours: 8, source: "import", status: "recorded", organizationId: "org-a", journalEntryId: null }],
      periodRecords: [period("p", "org-a", "2025-06-01", "2025-11-30", 800)],
    });
    const exp = deriveProfessionalExperience({ wi, relationships: [relA] });
    expect(exp.hours).toMatchObject({ total: 8, organizationDays: 8, organizationPeriods: 0, notCounted: 800 });
    expect(exp.lines.find((l) => l.source === "organization_period")).toMatchObject({ counted: false, notCountedReason: "period_spans_day_records" });
  });

  it("journal days inside a counted same-organization period are listed, not added; days outside stay counted — split by the real days, never by guess", () => {
    const wi = model({
      entries: [entry("in", "ctx-a", "2025-07-01", 6), entry("out", "ctx-a", "2026-01-10", 3)],
      periodRecords: [period("p", "org-a", "2025-06-01", "2025-11-30", 800)],
    });
    const exp = deriveProfessionalExperience({ wi, relationships: [relA] });
    expect(exp.hours).toMatchObject({ total: 803, journal: 3, organizationPeriods: 800, notCounted: 6 });
    const listed = exp.lines.find((l) => l.source === "journal" && !l.counted)!;
    expect(listed).toMatchObject({ hours: 6, from: "2025-07-01", to: "2025-07-01", notCountedReason: "journal_within_organization_period" });
    // the SAME entries under a DIFFERENT organization's context are not inside that period
    const other = deriveProfessionalExperience({ wi, relationships: [{ ...relA, organizationId: "org-b" }] });
    expect(other.hours).toMatchObject({ total: 809, journal: 9, notCounted: 0 });
  });

  it("an unreadable organization ledger is UNKNOWN: the total holds the journal only and says so; an unreadable journal is null, never zero", () => {
    const wi = model({ entries: [entry("j", null, "2026-02-01", 5)], dayRecords: null });
    const exp = deriveProfessionalExperience({ wi, relationships: [] });
    expect(exp.hours).toMatchObject({ total: 5, organizationUnknown: true, organizationDays: 0, organizationPeriods: 0 });
    expect(deriveProfessionalExperience({ wi: null, relationships: [relA] }).hours).toBeNull();
  });

  it("a confirmation state never hides experience: unconfirmed hours count, the confirmed part is a sub-figure", () => {
    const wi = model({ entries: [entry("j", "ctx-a", "2026-02-01", 5)] });
    const exp = deriveProfessionalExperience({ wi, relationships: [relA] });
    expect(exp.hours).toMatchObject({ total: 5, journal: 5, journalConfirmed: 0 });
    expect(exp.lines[0]).toMatchObject({ evidence: "own_record", counted: true });
  });

  it("projects: counted hours per project the records name; journal entries split by their own project id", () => {
    const wi = model({
      entries: [
        { ...entry("j1", "ctx-a", "2026-02-01", 5), projectId: "proj-1" },
        { ...entry("j2", "ctx-a", "2026-02-02", 2), projectId: null },
      ],
      dayRecords: [
        {
          id: "d",
          workDate: "2025-07-01",
          hours: 8,
          source: "import",
          status: "recorded",
          organizationId: "org-a",
          journalEntryId: null,
          context: {
            project: { id: "proj-1", name: "Site one" },
            place: null,
            clients: [],
            otherParties: [],
            relationshipKind: "employee",
            activityKind: "work",
            effective: { kind: "day", date: "2025-07-01" },
            recordedAt: null,
            source: { kind: "csv", supplierRole: "employer", supplierOrganizationId: "org-a", supplierName: "A", reconstructed: false },
            proof: { concepts: [], attestedByRole: null, contested: false },
            hasDetail: true,
          },
        },
      ],
    });
    const exp = deriveProfessionalExperience({ wi, relationships: [relA], projectNames: new Map([["proj-1", "Site one"]]) });
    expect(exp.projects).toEqual([
      expect.objectContaining({ projectId: "proj-1", projectName: "Site one", journalHours: 5, organizationHours: 8, totalHours: 13, from: "2025-07-01", to: "2026-02-01" }),
    ]);
    expect(exp.hours?.total).toBe(15);
  });

  it("no score, rank or rating field exists on the reading", () => {
    const exp = deriveProfessionalExperience({ wi: model({}), relationships: [] });
    const keys = JSON.stringify(exp).toLowerCase();
    expect(keys).not.toMatch(/score|rating|"rank"|tier/);
  });
});
