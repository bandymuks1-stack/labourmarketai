import { describe, expect, it } from "vitest";

import type {
  FutureWorkEntry,
  WorkforcePlanV1,
  WorkforceRequirement,
} from "@/lib/workforce/future-work-model";
import type { WorkerCapacityInput } from "@/lib/workforce/capacity-model";
import type { RecommendedAction } from "@/lib/workforce/gap-timeline";
import type { WorkforceSources } from "@/lib/workforce/workforce";
import type { WorkforceCatalog } from "@/lib/workforce/work-breakdown";
import {
  buildPlanningZoneView,
  requirementsForEntry,
  resolveActionTarget,
} from "@/lib/workforce/planning-zone-view";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const CATALOG: WorkforceCatalog = {
  professions: ["electrician", "foreman"],
  professionSkills: {
    electrician: ["electrical-install", "cable-pulling"],
    foreman: ["site-supervision", "team-coordination"],
  },
};

const OK = { status: "ok", count: 0 } as const;

function sources(over: Partial<WorkforceSources> = {}): WorkforceSources {
  return {
    demand: OK,
    project: OK,
    assignments: OK,
    workers: OK,
    skills: OK,
    professions: OK,
    languages: OK,
    certificates: OK,
    brigades: OK,
    ...over,
  };
}

function demandEntry(over: Partial<FutureWorkEntry> = {}): FutureWorkEntry {
  return {
    id: "demand:d1",
    source: "demand",
    sourceId: "d1",
    title: "Elektrikai objekte",
    status: "submitted",
    startDate: "2026-08-03",
    endDate: "2026-08-28",
    location: { country: "LT", city: null },
    hoursPerWeek: 40,
    shifts: [],
    teamSize: 3,
    teamSizeSource: "payload_stated",
    teamShape: "team",
    requiredSkills: ["electrical-install"],
    requiredCertificates: [],
    requiredLanguages: [],
    minExperienceYears: null,
    partnerSupplyExpected: false,
    structuredCaptured: true,
    ...over,
  };
}

function projectEntry(over: Partial<FutureWorkEntry> = {}): FutureWorkEntry {
  return {
    id: "project:p1",
    source: "project",
    sourceId: "p1",
    title: "electrician needed",
    status: "live",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    location: { country: null, city: null },
    hoursPerWeek: null,
    shifts: [],
    teamSize: null,
    teamSizeSource: null,
    teamShape: null,
    requiredSkills: [],
    requiredCertificates: [],
    requiredLanguages: [],
    minExperienceYears: null,
    partnerSupplyExpected: false,
    structuredCaptured: false,
    ...over,
  };
}

function worker(over: Partial<WorkerCapacityInput> = {}): WorkerCapacityInput {
  return {
    workerId: "w1",
    availabilityStatus: "available",
    availableFrom: null,
    plannedCommitments: [],
    skills: ["electrical-install"],
    professions: ["electrician"],
    certificates: [],
    languages: [],
    locationCountry: "LT",
    preferences: {
      willingToRelocate: null,
      needsAccommodation: null,
      hasTransport: null,
      maxTripDays: null,
      teamAvailable: null,
      soloAvailable: null,
    },
    brigadeIds: [],
    confirmedWorkHistoryCount: 0,
    ...over,
  };
}

function requirement(
  over: Partial<WorkforceRequirement> = {},
): WorkforceRequirement {
  return {
    id: "demand:d1#crew#electrician",
    entryId: "demand:d1",
    kind: "crew",
    professionSlug: "electrician",
    roleTitle: null,
    headcount: 2,
    hoursPerWeek: 40,
    totalHours: null,
    skills: ["electrical-install"],
    certificates: [],
    languages: [],
    teamShape: "team",
    equipmentNeeded: false,
    partnerNeeded: false,
    undeterminedFields: [],
    source: "human",
    explanation: "test line",
    confidence: "high",
    status: "suggested",
    ...over,
  };
}

function build(input: {
  entries?: readonly FutureWorkEntry[];
  plans?: Readonly<Record<string, WorkforcePlanV1>>;
  workers?: readonly WorkerCapacityInput[];
  sources?: WorkforceSources;
}) {
  return buildPlanningZoneView({
    entries: input.entries ?? [],
    plans: input.plans ?? {},
    workers: input.workers ?? [],
    assignments: [],
    brigades: [],
    sources: input.sources ?? sources(),
    catalog: CATALOG,
  });
}

/* ------------------------------------------------------------------ */
/* Empty + degradation                                                  */
/* ------------------------------------------------------------------ */

describe("empty zone", () => {
  it("no entries → isEmpty, no months, no primary action, no risk", () => {
    const view = build({});
    expect(view.isEmpty).toBe(true);
    expect(view.months).toEqual([]);
    expect(view.undated).toEqual([]);
    expect(view.primaryAction).toBeNull();
    expect(view.risk).toEqual({ level: "ok", riskDate: null });
    expect(view.totals.requiredHeadcount).toBe(0);
    expect(view.totals.coveragePct).toBe(100); // nothing required = full bar
  });
});

describe("degradation notes", () => {
  it("maps per-source states to the closed note set", () => {
    const view = build({
      sources: sources({
        languages: { status: "needs-migration", count: 0 },
        brigades: { status: "needs-migration", count: 0 },
        workers: { status: "error", count: 0 },
        demand: { status: "error", count: 0 },
      }),
    });
    expect(view.notes).toEqual([
      "demandError",
      "languagesPending",
      "brigadesPending",
      "capacityError",
    ]);
  });

  it("all sources ok → no notes", () => {
    expect(build({}).notes).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Months, bars, shortfall, skills, risk                                */
/* ------------------------------------------------------------------ */

describe("month buckets + capacity numbers", () => {
  it("uncovered demand: full shortfall, critical risk at the need start", () => {
    const view = build({ entries: [demandEntry()] });
    expect(view.isEmpty).toBe(false);
    expect(view.months).toHaveLength(1);
    const month = view.months[0];
    expect(month.monthIso).toBe("2026-08");
    expect(month.requiredHeadcount).toBe(3);
    expect(month.coveredHeadcount).toBe(0);
    expect(month.shortfall).toBe(3);
    expect(month.coveragePct).toBe(0);
    expect(month.riskLevel).toBe("critical"); // 3/3 short > 0.2 ratio
    expect(view.risk.riskDate).toBe("2026-08-03");
    expect(view.risk.level).toBe("critical");
    expect(view.missingSkills).toEqual(["electrical-install"]);
    expect(view.totals.shortfall).toBe(3);
    // 40h/week × 3 people × 4 weeks = 480h required, nothing coverable.
    expect(view.totals.requiredHours).toBe(480);
    expect(view.totals.shortfallHours).toBe(480);
  });

  it("bar percentages stay within 0–100", () => {
    const view = build({
      entries: [demandEntry({ teamSize: 1 })],
      workers: [worker()],
    });
    expect(view.months[0].coveragePct).toBe(100);
    expect(view.totals.coveragePct).toBe(100);
    for (const m of view.months) {
      expect(m.coveragePct).toBeGreaterThanOrEqual(0);
      expect(m.coveragePct).toBeLessThanOrEqual(100);
    }
  });

  it("undated entries live outside the month timeline, honestly listed", () => {
    const view = build({
      entries: [demandEntry({ id: "demand:d2", sourceId: "d2", startDate: null, endDate: null })],
    });
    expect(view.months).toEqual([]);
    expect(view.undated).toHaveLength(1);
    expect(view.undated[0].id).toBe("demand:d2");
    expect(view.risk.riskDate).toBeNull();
  });

  it("project rows link their real detail page; demand rows carry no invented link", () => {
    const view = build({ entries: [demandEntry(), projectEntry()] });
    const all = view.months.flatMap((m) => m.entries);
    expect(all.find((e) => e.id === "project:p1")?.href).toBe(
      "/dashboard/projects/p1",
    );
    expect(all.find((e) => e.id === "demand:d1")?.href).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Recommendation → CTA resolution                                      */
/* ------------------------------------------------------------------ */

function action(over: Partial<RecommendedAction> = {}): RecommendedAction {
  return {
    type: "assign_existing_worker",
    requirementId: "r1",
    entryId: "demand:d1",
    reason: "test",
    evidence: { gapKind: "headcount", shortfall: 1, workerIds: [] },
    ...over,
  };
}

describe("resolveActionTarget — every kind maps to a real surface or honest status", () => {
  const entryById = new Map<string, FutureWorkEntry>([
    ["demand:d1", demandEntry()],
    ["project:p1", projectEntry()],
  ]);

  it("assign_existing_worker → the project page for project entries, the projects board otherwise", () => {
    expect(
      resolveActionTarget(action({ entryId: "project:p1" }), entryById),
    ).toEqual({ kind: "route", href: "/dashboard/projects/p1" });
    expect(resolveActionTarget(action(), entryById)).toEqual({
      kind: "route",
      href: "/dashboard/projects",
    });
  });

  it("transfer_from_project → projects board", () => {
    expect(
      resolveActionTarget(action({ type: "transfer_from_project" }), entryById),
    ).toEqual({ kind: "route", href: "/dashboard/projects" });
  });

  it("form_brigade → the company team section", () => {
    expect(
      resolveActionTarget(action({ type: "form_brigade" }), entryById),
    ).toEqual({ kind: "route", href: "/dashboard/company#company-team" });
  });

  it("train_existing_worker → plain status (no surface exists — never a dead button)", () => {
    expect(
      resolveActionTarget(action({ type: "train_existing_worker" }), entryById),
    ).toEqual({ kind: "status" });
  });

  it("create_position → the existing demand form", () => {
    expect(
      resolveActionTarget(action({ type: "create_position" }), entryById),
    ).toEqual({ kind: "demand-intake" });
  });

  it("engage_staffing_agency → company scouting; engage_partner → service requests", () => {
    expect(
      resolveActionTarget(action({ type: "engage_staffing_agency" }), entryById),
    ).toEqual({ kind: "route", href: "/dashboard/company/scouting" });
    expect(
      resolveActionTarget(action({ type: "engage_partner" }), entryById),
    ).toEqual({ kind: "route", href: "/dashboard/service-requests" });
  });
});

describe("primary + secondary actions", () => {
  it("eligible workers → assign_existing_worker is the single primary CTA", () => {
    const view = build({
      entries: [projectEntry()],
      workers: [worker()],
    });
    expect(view.primaryAction?.type).toBe("assign_existing_worker");
    expect(view.primaryAction?.target).toEqual({
      kind: "route",
      href: "/dashboard/projects/p1",
    });
  });

  it("large uncovered shortfall → staffing agency recommendation with a real route", () => {
    const view = build({ entries: [demandEntry()] });
    expect(view.primaryAction?.type).toBe("engage_staffing_agency");
    expect(view.primaryAction?.target).toEqual({
      kind: "route",
      href: "/dashboard/company/scouting",
    });
  });

  it("secondary list deduplicates kinds and never repeats the primary", () => {
    const view = build({
      entries: [
        demandEntry(),
        demandEntry({ id: "demand:d2", sourceId: "d2", startDate: "2026-10-05", endDate: "2026-10-30" }),
      ],
    });
    const kinds = view.secondaryActions.map((a) => a.type);
    expect(new Set(kinds).size).toBe(kinds.length);
    if (view.primaryAction) {
      expect(kinds).not.toContain(view.primaryAction.type);
    }
    expect(view.secondaryActions.length).toBeLessThanOrEqual(4);
  });
});

/* ------------------------------------------------------------------ */
/* Stored human plan (payload.workforce_plan)                           */
/* ------------------------------------------------------------------ */

describe("stored plan overrides derivation", () => {
  it("a confirmed short requirement gates create_position into the recommendations", () => {
    const plan: WorkforcePlanV1 = {
      version: 1,
      requirements: [requirement({ status: "confirmed" })],
    };
    const view = build({
      entries: [demandEntry({ teamSize: 2 })],
      plans: { "demand:d1": plan },
    });
    const kinds = [
      ...(view.primaryAction ? [view.primaryAction.type] : []),
      ...view.secondaryActions.map((a) => a.type),
    ];
    expect(kinds).toContain("create_position");
  });

  it("an all-rejected plan never resurrects the machine suggestion", () => {
    const plan: WorkforcePlanV1 = {
      version: 1,
      requirements: [requirement({ status: "rejected" })],
    };
    const view = build({
      entries: [demandEntry()],
      plans: { "demand:d1": plan },
    });
    expect(view.totals.requiredHeadcount).toBe(0);
    expect(view.primaryAction).toBeNull();
  });

  it("requirementsForEntry falls back to derivation only without stored lines", () => {
    const derived = requirementsForEntry(demandEntry(), {}, CATALOG);
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.every((r) => r.status === "suggested")).toBe(true);
    const stored = requirementsForEntry(
      demandEntry(),
      { "demand:d1": { version: 1, requirements: [requirement()] } },
      CATALOG,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].source).toBe("human");
  });
});

describe("derivationRouting — real task-router call site (P4)", () => {
  it("derived requirements carry an audit record proving no LLM ran", () => {
    const view = build({ entries: [demandEntry()] });
    expect(view.derivationRouting).not.toBeNull();
    expect(view.derivationRouting?.taskType).toBe("derive_workforce_requirements");
    expect(view.derivationRouting?.providerAdapter).toBe("none");
    expect(view.derivationRouting?.dataCategoriesSent).toEqual([]);
    expect(view.derivationRouting?.actualCostUsd).toBeNull();
    expect(view.derivationRouting?.blocked).toBeNull();
  });

  it("a stored human plan needs no derivation — no routing decision is recorded", async () => {
    const { deriveWorkforceRequirements, planFromDerived } = await import(
      "@/lib/workforce/work-breakdown"
    );
    const e = demandEntry();
    const reqs = deriveWorkforceRequirements(e, CATALOG);
    const plan = planFromDerived(reqs);
    const view = build({ entries: [e], plans: { [e.id]: plan } });
    expect(view.derivationRouting).toBeNull();
  });
});
