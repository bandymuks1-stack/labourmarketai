import { describe, expect, it } from "vitest";

import { managerMembershipIsAccessOnly } from "@/lib/journal/professional-experience-read";
import { deriveIndependentReviewResult } from "@/lib/journal/review-status";
import {
  deriveProfessionalExperience,
  periodForDates,
  type ExperienceBusinessPeriod,
  type ExperienceRelationship,
} from "@/lib/journal/professional-experience";
import {
  deriveWorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkIntelligenceOrganizationPeriodRecord,
} from "@/lib/journal/work-intelligence";
import type { HistoryContext } from "@/lib/organization-evidence/professional-history-context";

/**
 * STAGE 3 — history reconstruction over the ONE professional history
 * (decision 0025) and the ONE hours ledger (owner order 2026-10-24).
 * Roles only, no real names or ids (public repository): "org A" is the
 * continuing company, "entity V" the earlier, separate legal entity it
 * continues (sold to other owners, the activity continued by the new company),
 * "org N" a third company where the person consults.
 */

const ORG_A = "org-a";
const ORG_N = "org-n";
const CTX_A = "ctx-a-owner";
const TODAY = "2026-10-24";

const ENTITY_V_DATED: ExperienceBusinessPeriod = {
  id: "period-v",
  label: "Entity V",
  from: "2022-01-11",
  to: "2026-01-31",
  toPrecision: "month",
  basis: "registry_extract",
  legalEntityRelation: "sold_and_continued_by_new_entity",
  legalEntityLabel: "Entity V",
  sourceLabels: ["Entity V PL"],
};
const ENTITY_V_UNDATED: ExperienceBusinessPeriod = { ...ENTITY_V_DATED, from: null, to: null, toPrecision: null };

const ownerOf = (periods: ExperienceBusinessPeriod[]): ExperienceRelationship[] => [
  {
    engagementContextId: CTX_A,
    organizationId: ORG_A,
    organizationName: "Org A",
    relationship: "owner",
    title: null,
    startedAt: "2026-01-21",
    endedAt: null,
    current: true,
    source: "engagement",
    businessPeriods: periods,
  },
];

/** A period record's proof as the evidence read builds it. */
const proof = (over: Partial<HistoryContext["proof"]>): HistoryContext =>
  ({
    project: null,
    place: null,
    clients: [],
    otherParties: [],
    relationshipKind: "employee",
    activityKind: "work",
    effective: null,
    recordedAt: null,
    source: { kind: "csv", supplierRole: "employer", supplierOrganizationId: ORG_A, supplierName: null, reconstructed: true, label: null },
    proof: { concepts: [], attestedByRole: null, contested: false, ...over },
    hasDetail: false,
  }) as HistoryContext;

/** The owner's management/HR period as a correction restates it: the source's
 *  own estimate (16 months × 50 h), self-attested, no source label. */
const MANAGEMENT_ESTIMATE: WorkIntelligenceOrganizationPeriodRecord = {
  id: "rec-mgmt",
  periodStart: "2024-08-01",
  periodEnd: "2025-11-30",
  hours: 800,
  source: "import",
  organizationId: ORG_A,
  provenance: "human_choice",
  hoursBasis: { value: "estimated", method: "months_x_monthly_rate", note: "16 months x 50 h, the source's own rate" },
  context: proof({ concepts: ["SELF_DECLARED"] }),
};

const entry = (id: string, day: string, hours: number): WorkIntelligenceEntry => ({
  entryId: id,
  createdAt: `${day}T08:00:00Z`,
  metrics: [
    { metric_slug: "quantity", value_numeric: hours, value_text: null, unit_slug: "hours", source: "worker_input", created_at: `${day}T08:00:00Z` },
    { metric_slug: "work_date", value_numeric: null, value_text: day, unit_slug: null, source: "worker_input", created_at: `${day}T08:00:00Z` },
  ],
  engagementContextId: CTX_A,
  projectId: null,
  reviewResult: deriveIndependentReviewResult(null, "profile-owner"),
  linkedSkillIds: [],
});

function wiOf(periods: WorkIntelligenceOrganizationPeriodRecord[], entries: WorkIntelligenceEntry[] = []) {
  return deriveWorkIntelligence({
    entries,
    skills: [],
    todayIso: TODAY,
    focus: "all",
    organizationRecords: [],
    organizationPeriodRecords: periods,
  });
}

describe("performer at the time, by date (succession entity V → org A)", () => {
  it("with a DATED period statement, a record no label places lands on the earlier legal entity", () => {
    const exp = deriveProfessionalExperience({ wi: wiOf([MANAGEMENT_ESTIMATE]), relationships: ownerOf([ENTITY_V_DATED]) });
    const line = exp.lines.find((l) => l.key === "period:rec-mgmt")!;
    expect(line).toMatchObject({ periodLabel: "Entity V", periodPlacement: "date_within_period", counted: true });
    const v = exp.organizations.find((o) => o.kind === "earlier_legal_entity")!;
    expect(v).toMatchObject({
      organizationName: "Entity V",
      legalEntityRelation: "sold_and_continued_by_new_entity",
      basis: "registry_extract",
      administeredBy: { organizationId: ORG_A, organizationName: "Org A" },
      totalHours: 800,
      byState: { actual: 0, reported: 0, estimated: 800, confirmed: 0 },
    });
    // The owner led entity V — a DERIVED role dated by the period, never hours of its own.
    expect(v.roles).toEqual([expect.objectContaining({ relationship: "owner", derived: true, startedAt: "2022-01-11", endedAt: "2026-01-31" })]);
    // Org A keeps its own work and says which entity it continues; no project, hour or result moves.
    const a = exp.organizations.find((o) => o.organizationId === ORG_A && o.kind === "organization")!;
    expect(a.totalHours).toBe(0);
    expect(a.earlierEntities).toEqual([{ periodId: "period-v", label: "Entity V" }]);
  });

  it("an UNDATED statement places nothing by date — today's production state renders as before", () => {
    const exp = deriveProfessionalExperience({ wi: wiOf([MANAGEMENT_ESTIMATE]), relationships: ownerOf([ENTITY_V_UNDATED]) });
    const line = exp.lines.find((l) => l.key === "period:rec-mgmt")!;
    expect(line.periodLabel).toBeNull();
    expect(line.periodPlacement).toBeNull();
    expect(exp.organizations.find((o) => o.kind === "organization")!.totalHours).toBe(800);
  });

  it("a bound known only to the month places only work CERTAINLY inside it", () => {
    // End "January 2026" (month precision): the inner end is 2026-01-01.
    expect(periodForDates("2025-12-01", "2025-12-31", [ENTITY_V_DATED])?.id).toBe("period-v");
    expect(periodForDates("2026-01-10", "2026-01-12", [ENTITY_V_DATED])).toBeNull();
    // Work after the takeover belongs to the continuing company.
    expect(periodForDates("2026-02-02", "2026-03-29", [ENTITY_V_DATED])).toBeNull();
    // Two statements that both hold a span: none is chosen.
    expect(periodForDates("2023-01-01", "2023-01-31", [ENTITY_V_DATED, { ...ENTITY_V_DATED, id: "other" }])).toBeNull();
  });
});

describe("the one total is the ledger's total", () => {
  it("the owner's 800 h estimate and own journal hours: one total, states kept apart, 0 h independently confirmed", () => {
    const exp = deriveProfessionalExperience({
      wi: wiOf([MANAGEMENT_ESTIMATE], [entry("e1", "2026-07-02", 9), entry("e2", "2026-06-24", 5)]),
      relationships: ownerOf([ENTITY_V_DATED]),
    });
    expect(exp.hours?.total).toBe(814);
    expect(exp.ledger.total).toBe(exp.hours?.total);
    expect(exp.hours?.capacityExcess).toBe(0);
    expect(exp.ledger.byState).toEqual({ actual: 14, reported: 0, estimated: 800, confirmed: 0 });
    const est = exp.ledger.lines.find((l) => l.key === "period:rec-mgmt")!;
    expect(est.confirmation).toBe("self_attested");
  });

  it("two overlapping period figures for the same person never double count beyond the calendar", () => {
    const a: WorkIntelligenceOrganizationPeriodRecord = {
      ...MANAGEMENT_ESTIMATE,
      id: "p1",
      periodStart: "2025-01-01",
      periodEnd: "2025-01-10",
      hours: 150,
      hoursBasis: null,
      context: proof({}),
    };
    const b: WorkIntelligenceOrganizationPeriodRecord = { ...a, id: "p2", organizationId: ORG_N };
    const exp = deriveProfessionalExperience({ wi: wiOf([a, b]), relationships: ownerOf([]) });
    expect(exp.hours?.organizationPeriods).toBe(300);
    expect(exp.hours?.capacityExcess).toBe(140);
    expect(exp.hours?.total).toBe(160);
    expect(exp.ledger.total).toBe(160);
    const sum = exp.organizations.reduce((s, o) => s + o.totalHours, 0);
    expect(sum).toBe(160);
  });

  it("a role carries no hours: an owner with no records of their own has 0 h, whatever the company did", () => {
    const exp = deriveProfessionalExperience({ wi: wiOf([]), relationships: ownerOf([ENTITY_V_DATED]) });
    expect(exp.hours?.total).toBe(0);
    expect(exp.organizations.every((o) => o.totalHours === 0)).toBe(true);
  });
});

describe("access is not a professional role", () => {
  const consultant = { organizationId: ORG_N, relationship: "consultant", source: "engagement" as const };
  it("a manager MEMBERSHIP is not printed as 'manager' where the person's engagement says what they are", () => {
    expect(managerMembershipIsAccessOnly("manager", ORG_N, [consultant])).toBe(true);
  });
  it("without such an engagement the membership stays a role (appointed by membership only)", () => {
    expect(managerMembershipIsAccessOnly("manager", ORG_N, [])).toBe(false);
    expect(managerMembershipIsAccessOnly("manager", ORG_N, [{ ...consultant, organizationId: ORG_A }])).toBe(false);
  });
  it("an owner membership is never dropped — ownership is a legal fact", () => {
    expect(managerMembershipIsAccessOnly("owner", ORG_N, [consultant])).toBe(false);
  });
});
