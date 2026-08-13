import { describe, expect, it } from "vitest";

import { companyStillSeesWorkerViaAssignment } from "./end-engagement-visibility";

/**
 * F2 (#1097 follow-up) — behaviour tests for the retained-visibility check.
 *
 * The three-valued contract is the point under test:
 *   true  — active assignment on THIS company's project (the measured F2 gap);
 *   false — nothing readable keeps the view alive;
 *   null  — a read failed; unknown must stay unknown, never become a claim.
 *
 * The fake answers the three reads the module makes (engagement row, the
 * worker's active assignments, the company-scoped project match) and records
 * the filters applied, so the company-scoping assertion is about what was
 * ASKED of the database, not about implementation strings.
 */

const ENGAGEMENT_ID = "e-1";
const COMPANY = "c-1";
const WORKER = "w-1";

interface TableResult {
  data: unknown;
  error: { code?: string } | null;
}

function fakeClient(results: {
  engagement?: TableResult;
  assignments?: TableResult;
  projects?: TableResult;
}) {
  const filters: Record<string, Record<string, unknown>> = {};

  const client = {
    from(table: string) {
      const recorded: Record<string, unknown> = {};
      filters[table] = recorded;
      const result: TableResult =
        table === "company_worker_engagements"
          ? results.engagement ?? { data: null, error: null }
          : table === "project_worker_assignments"
            ? results.assignments ?? { data: [], error: null }
            : results.projects ?? { data: [], error: null };

      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        recorded[`eq:${col}`] = val;
        return chain;
      };
      chain.is = (col: string, val: unknown) => {
        recorded[`is:${col}`] = val;
        return chain;
      };
      chain.in = (col: string, vals: unknown) => {
        recorded[`in:${col}`] = vals;
        return chain;
      };
      chain.limit = () => chain;
      chain.maybeSingle = () => Promise.resolve(result);
      chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr);
      return chain as never;
    },
  };

  return { client: client as never, filters };
}

const engagementRow = { data: { company_id: COMPANY, worker_id: WORKER }, error: null };

describe("companyStillSeesWorkerViaAssignment", () => {
  it("TRUE when an active assignment sits on this company's project — the measured F2 gap", async () => {
    const { client, filters } = fakeClient({
      engagement: engagementRow,
      assignments: { data: [{ project_id: "p-1" }, { project_id: "p-2" }], error: null },
      projects: { data: [{ id: "p-2" }], error: null },
    });

    await expect(
      companyStillSeesWorkerViaAssignment(client, ENGAGEMENT_ID),
    ).resolves.toBe(true);

    // The assignment read mirrors the predicate branch: active AND not ended.
    expect(filters["project_worker_assignments"]["eq:status"]).toBe("active");
    expect(filters["project_worker_assignments"]["is:ended_at"]).toBe(null);
    // The project match is scoped to THE engagement's company — an assignment
    // elsewhere must not produce a warning about this company.
    expect(filters["projects"]["eq:company_id"]).toBe(COMPANY);
  });

  it("FALSE when the only active assignment belongs to a different company's project", async () => {
    const { client } = fakeClient({
      engagement: engagementRow,
      assignments: { data: [{ project_id: "p-9" }], error: null },
      projects: { data: [], error: null }, // company-scoped match comes back empty
    });

    await expect(
      companyStillSeesWorkerViaAssignment(client, ENGAGEMENT_ID),
    ).resolves.toBe(false);
  });

  it("FALSE when the worker has no active assignments at all", async () => {
    const { client } = fakeClient({
      engagement: engagementRow,
      assignments: { data: [], error: null },
    });

    await expect(
      companyStillSeesWorkerViaAssignment(client, ENGAGEMENT_ID),
    ).resolves.toBe(false);
  });

  it("FALSE for a GDPR-detached engagement — no worker, nothing to warn about", async () => {
    const { client } = fakeClient({
      engagement: { data: { company_id: COMPANY, worker_id: null }, error: null },
    });

    await expect(
      companyStillSeesWorkerViaAssignment(client, ENGAGEMENT_ID),
    ).resolves.toBe(false);
  });

  it("NULL when the engagement row is unreadable — unknown stays unknown", async () => {
    const unreadable = fakeClient({
      engagement: { data: null, error: { code: "42501" } },
    });
    await expect(
      companyStillSeesWorkerViaAssignment(unreadable.client, ENGAGEMENT_ID),
    ).resolves.toBe(null);

    const absent = fakeClient({ engagement: { data: null, error: null } });
    await expect(
      companyStillSeesWorkerViaAssignment(absent.client, ENGAGEMENT_ID),
    ).resolves.toBe(null);
  });

  it("NULL when the assignment or project read fails — an error never becomes a claim", async () => {
    const assignmentsFail = fakeClient({
      engagement: engagementRow,
      assignments: { data: null, error: { code: "500" } },
    });
    await expect(
      companyStillSeesWorkerViaAssignment(assignmentsFail.client, ENGAGEMENT_ID),
    ).resolves.toBe(null);

    const projectsFail = fakeClient({
      engagement: engagementRow,
      assignments: { data: [{ project_id: "p-1" }], error: null },
      projects: { data: null, error: { code: "500" } },
    });
    await expect(
      companyStillSeesWorkerViaAssignment(projectsFail.client, ENGAGEMENT_ID),
    ).resolves.toBe(null);
  });
});
