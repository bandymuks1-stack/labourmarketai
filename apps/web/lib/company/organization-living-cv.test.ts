import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationLivingActivity } from "@/components/app/organization/organization-living-activity";
import { buildBusinessHistory } from "@/lib/organization-evidence/business-history";

const state = vi.hoisted(() => ({
  rosterRows: [] as {
    id: string;
    relationship_kind: string;
    linked_worker_id: string | null;
    link_state: string | null;
    link_method: string | null;
  }[],
  skillRows: [] as {
    worker_id: string;
    skill_id: string;
    verified: boolean;
    source: string | null;
    skills: { slug: string };
  }[],
  rosterFailure: false,
  rosterTruncated: false,
  skillFailure: false,
  skillQueries: [] as string[][],
  standingQueries: [] as string[][],
  rosterRanges: [] as [number, number][],
  historyPlaces: [] as {
    name: string | null;
    objectId: string | null;
    records: {
      id: string;
      organizationId: string;
      personId: string;
      personName: string | null;
      text: string;
      activityDate: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      hours: number | null;
      workObjectId: string | null;
      projectId: string | null;
      factFields: string[];
      derived: Record<string, unknown>;
      [key: string]: unknown;
    }[];
  }[],
  projectRows: [] as { id: string; title: string | null }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "member-1" } } }) },
    from: (table: string) => {
      let relationshipKinds: string[] = [];
      let workerIds: string[] = [];
      const query = {} as FakeQuery;
      query.select = () => query;
      query.eq = () => query;
      query.in = (column: string, values: string[]) => {
        if (table === "organization_people" && column === "relationship_kind") relationshipKinds = values;
        if (table === "worker_skills" && column === "worker_id") {
          workerIds = values;
          state.skillQueries.push(values);
        }
        return query;
      };
      query.order = () => query;
      query.then = (resolve, reject) => {
        if (table !== "worker_skills") {
          return Promise.reject(new Error("Unexpected non-paged query")).then(
            (value) => resolve?.(value),
            (reason) => reject?.(reason),
          );
        }
        const result: QueryResult = state.skillFailure
          ? { data: null, error: { message: "skills unavailable" } }
          : { data: state.skillRows.filter((row) => workerIds.includes(row.worker_id)), error: null };
        return Promise.resolve(result).then(
          (value) => resolve?.(value),
          (reason) => reject?.(reason),
        );
      };
      query.range = async (from: number, to: number) => {
        if (table === "organization_people") {
          state.rosterRanges.push([from, to]);
          if (state.rosterFailure) return { data: null, error: { message: "roster unavailable" } };
          if (state.rosterTruncated) {
            return {
              data: Array.from({ length: to - from + 1 }, (_, i) => ({
                id: "person-" + (from + i),
                relationship_kind: "employee",
                linked_worker_id: null,
                link_state: null,
                link_method: null,
              })),
              error: null,
            };
          }
          return {
            data: state.rosterRows
              .filter((row) => relationshipKinds.includes(row.relationship_kind))
              .slice(from, to + 1),
            error: null,
          };
        }
        if (table === "worker_skills") {
          if (state.skillFailure) return { data: null, error: { message: "skills unavailable" } };
          return {
            data: state.skillRows.filter((row) => workerIds.includes(row.worker_id)),
            error: null,
          };
        }
        throw new Error("Unexpected table " + table);
      };
      return query;
    },
  })),
}));
vi.mock("@/lib/company/active-organization", () => ({
  withSessionWorkspacePointer: vi.fn(async () => ({ userId: "member-1" })),
}));
vi.mock("@/lib/company/public-profile", () => ({
  getBusinessPublicSettings: vi.fn(async () => ({
    kind: "ok",
    settings: { tagline: null, description: null },
  })),
}));
vi.mock("@/lib/company/team-profile-model", () => ({
  buildOrganizationLivingCv: vi.fn((_identity, data) => data),
}));
vi.mock("@/lib/organizations/capability-read", () => ({
  readOrganizationCapabilities: vi.fn(async () => []),
}));
vi.mock("@/lib/organization-evidence/company-work-history-read", () => ({
  loadCompanyWorkHistory: vi.fn(async () => ({
    kind: "ready",
    organizationId: "org-1",
    organizationName: "Org",
    identity: { legalName: "Org Ltd", displayName: "Org Trading", ownStatementIds: ["statement-own"] },
    history: {
      places: state.historyPlaces,
      totalRecords: state.historyPlaces.reduce((sum, place) => sum + place.records.length, 0),
    },
    business: {
      ...buildBusinessHistory([], []),
      totals: { hours: 12, people: 3, places: 2, from: "2020-01-01", to: "2025-12-31" },
    },
    journal: null,
    projects: state.projectRows.length > 0 ? { items: state.projectRows } : null,
    clients: [],
    performedAsSubcontractor: false,
    linkedWorkers: { historicalPerson: "worker-former" },
    truncated: false,
    attributedCount: 0,
    partnerWorkUnreadable: false,
  })),
}));
vi.mock("@/lib/organization-evidence/evidence-media-read", () => ({
  readEvidenceMedia: vi.fn(async () => ({ kind: "ok", media: [] })),
}));
vi.mock("@/lib/organization-evidence/evidence-media-serve", () => ({
  signEvidenceMediaUrls: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/evidence/skill-confirmation-standing-read", () => ({
  readCrossPartyStandingStates: vi.fn(async (_supabase, workerIds: string[]) => {
    state.standingQueries.push(workerIds);
    return new Set(workerIds);
  }),
}));
vi.mock("@/lib/evidence/skill-confirmation-standing", () => ({
  withCrossPartyStandingConfirmation: vi.fn((rows, standing: Set<string>) =>
    rows.map((row: { worker_id: string; verified: boolean }) => ({
      ...row,
      verified: row.verified && standing.has(row.worker_id),
    })),
  ),
}));

import { buildOrganizationLivingCv } from "@/lib/company/team-profile-model";
import { loadOrganizationLivingCv } from "./organization-living-cv";

type QueryResult = { data: unknown[] | null; error: unknown | null };
type FakeQuery = {
  select: (columns: string, options?: { count?: string; head?: boolean }) => FakeQuery;
  eq: (column: string, value: string) => FakeQuery;
  in: (column: string, values: string[]) => FakeQuery;
  order: (column: string, options: { ascending: boolean }) => FakeQuery;
  range: (from: number, to: number) => Promise<QueryResult>;
  then: (
    onfulfilled?: ((result: QueryResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

const input = () => {
  const calls = vi.mocked(buildOrganizationLivingCv).mock.calls;
  return calls[calls.length - 1]?.[1];
};

const workRecord = (id: string, text: string, projectId: string | null, workObjectId: string | null) => ({
  id,
  organizationId: "org-1",
  personId: "private-person-id",
  personName: "Private Worker Name",
  text,
  activityDate: "2025-04-02",
  periodStart: null,
  periodEnd: null,
  hours: 8,
  workObjectId,
  projectId,
  factFields: ["activityDate"],
  derived: {},
  sourceFilename: "private-source.xlsx",
  importedBy: "private-importer-id",
});

const currentRows = () => [
  {
    id: "person-employee",
    relationship_kind: "employee",
    linked_worker_id: "worker-current",
    link_state: "linked",
    link_method: "worker_confirmed",
  },
  {
    id: "person-trainee",
    relationship_kind: "trainee",
    linked_worker_id: "worker-current",
    link_state: "linked",
    link_method: "worker_confirmed",
  },
  {
    id: "person-unconfirmed",
    relationship_kind: "contractor",
    linked_worker_id: "worker-unconfirmed",
    link_state: "pending",
    link_method: "worker_confirmed",
  },
  {
    id: "person-admin-linked",
    relationship_kind: "subcontractor",
    linked_worker_id: "worker-admin-linked",
    link_state: "linked",
    link_method: "organization_admin",
  },
  {
    id: "person-former",
    relationship_kind: "former_employee",
    linked_worker_id: "worker-former",
    link_state: "linked",
    link_method: "worker_confirmed",
  },
];

const setup = () => {
  state.rosterRows = currentRows();
  state.skillRows = [
    {
      worker_id: "worker-current",
      skill_id: "skill-current",
      verified: true,
      source: "work",
      skills: { slug: "current-skill" },
    },
    {
      worker_id: "worker-former",
      skill_id: "skill-former",
      verified: true,
      source: "work",
      skills: { slug: "former-skill" },
    },
  ];
  state.rosterFailure = false;
  state.rosterTruncated = false;
  state.skillFailure = false;
  state.skillQueries = [];
  state.standingQueries = [];
  state.rosterRanges = [];
  state.historyPlaces = [];
  state.projectRows = [];
};

const load = () => loadOrganizationLivingCv("en", "org-1", "LT");

describe("loadOrganizationLivingCv current-team capability source", () => {
  beforeEach(() => {
    setup();
    vi.mocked(buildOrganizationLivingCv).mockClear();
  });

  it("counts a confirmed current person once across roles and reads only current confirmed links", async () => {
    await load();
    const data = input();

    expect(data?.rosterSize).toBe(3);
    expect(data?.teamSkills).toEqual([{ slug: "current-skill", confirmed: true }]);
    expect(data?.historyDetail).toEqual({
      business: {
      ...buildBusinessHistory([], []),
        totals: { hours: 12, people: 3, places: 2, from: "2020-01-01", to: "2025-12-31" },
      },
      identity: {
        legalName: "Org Ltd",
        displayName: "Org Trading",
        ownStatementIds: ["statement-own"],
      },
      organizationId: "org-1",
      organizationName: "Org",
      clients: [],
      performedAsSubcontractor: false,
      recordsRead: 0,
      truncated: false,
      workDescriptions: [],
      workContexts: [],
      workEdges: [],
      workDescriptionCount: 0,
      workContextCount: 0,
      attributedCount: 0,
      partnerWorkUnreadable: false,
    });
    expect(state.skillQueries).toEqual([["worker-current"]]);
    expect(state.standingQueries).toEqual([["worker-current"]]);
    expect(state.rosterRanges).toEqual([[0, 999]]);
  });

  it("keeps exact record-to-context edges, even for duplicate labels, and projects only bounded safe fields", async () => {
    const longDescription = `Cleaned entrance ${"x".repeat(320)}`;
    state.historyPlaces = [
      { name: "Site A", objectId: "place-a", records: [workRecord("record-a", "Install tiles", "project-a", "place-a")] },
      { name: "Site B", objectId: "place-b", records: [workRecord("record-b", "Repair wall", "project-b", "place-b")] },
      { name: "Site A", objectId: null, records: [workRecord("record-unlinked", longDescription, null, null)] },
    ];
    state.projectRows = [
      { id: "project-a", title: "Same project" },
      { id: "project-b", title: "Same project" },
    ];

    await load();
    const detail = input()?.historyDetail;

    expect(detail?.workDescriptionCount).toBe(3);
    expect(detail?.workContextCount).toBe(4);
    expect(detail?.workDescriptions.map((item) => [item.id, item.label])).toEqual([
      ["work-0", expect.any(String)],
      ["work-1", "Install tiles"],
      ["work-2", "Repair wall"],
    ]);
    expect([...(detail?.workDescriptions[0]?.label ?? "")]).toHaveLength(90);
    expect(detail?.workContexts.map((item) => [item.id, item.label])).toEqual([
      ["context-0", "Same project"],
      ["context-1", "Same project"],
      ["context-2", "Site A"],
      ["context-3", "Site B"],
    ]);
    expect(detail?.workEdges).toEqual([
      { from: "work-1", to: "context-0" },
      { from: "work-1", to: "context-2" },
      { from: "work-2", to: "context-1" },
      { from: "work-2", to: "context-3" },
    ]);
    expect(detail?.workDescriptions[0]?.details[0]?.contexts).toEqual([]);
    const safe = JSON.stringify(detail);
    expect(safe).not.toContain("private-person-id");
    expect(safe).not.toContain("Private Worker Name");
    expect(safe).not.toContain("private-source.xlsx");
    expect(safe).not.toContain("private-importer-id");
    expect(Math.max(...(detail?.workDescriptions.flatMap((item) => item.details.map((entry) => [...(entry.description ?? "")].length)) ?? [0]))).toBeLessThanOrEqual(240);
    expect([...(detail?.workDescriptions[0]?.details[0]?.description ?? "")]).toHaveLength(240);
    const html = renderToStaticMarkup(createElement(OrganizationLivingActivity, {
      historyDetail: detail ?? null,
      locale: "en",
      t: (key) => key,
    }));
    expect(html).toContain("companyWorkHistory.timeline</h3>");
    expect(html).not.toContain("companyWorkHistory.timeline (3 / 3)");
    expect(html).not.toContain("analytics.contextLabel (4 / 4)");
  });

  it("labels the activity map counts only when the six/four node preview omits groups", async () => {
    const workPlaces = Array.from({ length: 7 }, (_, index) => ({
      name: `Place ${index + 1}`,
      objectId: `place-${index + 1}`,
      records: [workRecord(`record-${index + 1}`, `Work item ${index + 1}`, `project-${index + 1}`, `place-${index + 1}`)],
    }));
    state.historyPlaces = workPlaces;
    state.projectRows = workPlaces.map((place, index) => ({ id: `project-${index + 1}`, title: `Project ${index + 1}` }));

    await load();
    const detail = input()?.historyDetail;
    expect(detail?.workDescriptionCount).toBe(7);
    expect(detail?.workDescriptions).toHaveLength(6);
    expect(detail?.workContextCount).toBe(14);
    expect(detail?.workContexts).toHaveLength(4);

    const html = renderToStaticMarkup(createElement(OrganizationLivingActivity, {
      historyDetail: detail ?? null,
      locale: "en",
      t: (key) => key,
    }));
    expect(html).toContain("companyWorkHistory.timeline (6 / 7)");
    expect(html).toContain("cvExport.premium.analytics.contextLabel (4 / 14)");
  });

  it("returns unknown count and skills when the current roster read fails", async () => {
    state.rosterFailure = true;

    await load();
    const data = input();

    expect(data?.rosterSize).toBeNull();
    expect(data?.teamSkills).toBeNull();
    expect(state.skillQueries).toEqual([]);
  });

  it("returns unknown count and skills when the bounded roster read truncates", async () => {
    state.rosterTruncated = true;

    await load();
    const data = input();

    expect(data?.rosterSize).toBeNull();
    expect(data?.teamSkills).toBeNull();
    expect(state.skillQueries).toEqual([]);
    expect(state.rosterRanges).toHaveLength(20);
  });

  it("keeps the readable team count when worker skill rows fail", async () => {
    state.skillFailure = true;

    await load();
    const data = input();

    expect(data?.rosterSize).toBe(3);
    expect(data?.teamSkills).toBeNull();
  });
});
