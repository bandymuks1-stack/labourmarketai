import { beforeEach, describe, expect, it, vi } from "vitest";

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
    history: { places: [] },
    business: {
      totals: { hours: 12, people: 3, places: 2, from: "2020-01-01", to: "2025-12-31" },
    },
    journal: null,
    projects: null,
    clients: [],
    performedAsSubcontractor: false,
    linkedWorkers: { historicalPerson: "worker-former" },
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
    });
    expect(state.skillQueries).toEqual([["worker-current"]]);
    expect(state.standingQueries).toEqual([["worker-current"]]);
    expect(state.rosterRanges).toEqual([[0, 999]]);
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
