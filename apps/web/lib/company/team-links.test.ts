import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listMyTeamLinks } from "./team-links";

type Answer = { data: unknown[] | null; error: { code?: string; message: string } | null };

/** Minimal chainable fake: every builder call returns itself; awaiting it yields the table's answer. */
function fakeClient(answers: Record<string, Answer>) {
  const from = (table: string) => {
    const answer = answers[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
    chain.then = (resolve: (v: Answer) => unknown) => resolve(answer);
    return chain;
  };
  return { from } as never;
}

const companyRow = {
  company_id: "c1",
  worker_id: "w1",
  status: "active",
  created_at: "2026-09-01T00:00:00Z",
  companies: { display_name: "Alfa UAB", legal_name: null },
  workers: { profile_id: "p1" },
};

describe("listMyTeamLinks — the legacy agency source may not poison the live answer", () => {
  it("company link + legacy agency_workers 42501 (no API grant, production 2026-09-21) → ok with the company row", async () => {
    const res = await listMyTeamLinks(
      fakeClient({
        company_workers: { data: [companyRow], error: null },
        agency_workers: { data: null, error: { code: "42501", message: "permission denied for table agency_workers" } },
      }),
      "p1",
    );
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ kind: "company", orgLegacyId: "c1", organizationName: "Alfa UAB" });
  });

  it("no company link + legacy source denied → ok with zero rows (never 'could not read your teams')", async () => {
    const res = await listMyTeamLinks(
      fakeClient({
        company_workers: { data: [], error: null },
        agency_workers: { data: null, error: { code: "42501", message: "permission denied" } },
      }),
      "p1",
    );
    expect(res).toEqual({ kind: "ok", rows: [] });
  });

  it("legacy table absent (42P01) contributes nothing; company answer stands", async () => {
    const res = await listMyTeamLinks(
      fakeClient({
        company_workers: { data: [companyRow], error: null },
        agency_workers: { data: null, error: { code: "42P01", message: "relation does not exist" } },
      }),
      "p1",
    );
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.rows).toHaveLength(1);
  });

  it("the LIVE source failing is still an error (a failed read is never 'no teams')", async () => {
    const res = await listMyTeamLinks(
      fakeClient({
        company_workers: { data: null, error: { code: "PGRST301", message: "boom" } },
        agency_workers: { data: [], error: null },
      }),
      "p1",
    );
    expect(res).toEqual({ kind: "error", message: "boom" });
  });

  it("the live source absent (42P01) → needs-migration", async () => {
    const res = await listMyTeamLinks(
      fakeClient({
        company_workers: { data: null, error: { code: "42P01", message: "relation does not exist" } },
        agency_workers: { data: [], error: null },
      }),
      "p1",
    );
    expect(res).toEqual({ kind: "needs-migration" });
  });

  it("a legacy-source failure that is NOT a privilege/absence answer is still surfaced", async () => {
    const res = await listMyTeamLinks(
      fakeClient({
        company_workers: { data: [companyRow], error: null },
        agency_workers: { data: null, error: { code: "57014", message: "statement timeout" } },
      }),
      "p1",
    );
    expect(res).toEqual({ kind: "error", message: "statement timeout" });
  });

  it("legacy rows are still merged when the source IS exposed", async () => {
    const res = await listMyTeamLinks(
      fakeClient({
        company_workers: { data: [companyRow], error: null },
        agency_workers: {
          data: [
            {
              agency_id: "a1",
              worker_id: "w1",
              status: "active",
              created_at: "2026-08-01T00:00:00Z",
              agencies: { legal_name: "Legacy Agency" },
              workers: { profile_id: "p1" },
            },
          ],
          error: null,
        },
      }),
      "p1",
    );
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.rows.map((r) => r.kind)).toEqual(["company", "agency"]);
  });
});
