import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompany: async () => ({ ok: false, reason: "personal-workspace" }),
  resolveEmployerCompanyContext: async () => ({ kind: "unavailable" }),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: () => {} }));
vi.mock("@/lib/telemetry/actions", () => ({ recordTelemetryEvent: async () => {} }));
vi.mock("@/lib/telemetry/server-locale", () => ({ serverEventLocale: async () => "en" }));
vi.mock("@/lib/billing/open-needs-gate", () => ({
  gateOpenNeeds: async () => ({ allowed: true }),
}));

const runScoutingCore = vi.fn();
vi.mock("@/lib/scouting/scouting", () => ({
  runScoutingCore: (...a: unknown[]) => runScoutingCore(...a),
}));

import { runAutoMatchForDemand } from "./auto-match";
import {
  AUTO_MATCH_MATCHER_VERSION,
  anonymisedResultRef,
  autoMatchInputHash,
  readAutoMatchReceipt,
} from "./auto-match-receipt";
import { submitDemandRequestCore } from "@/lib/demand/demand-request";

type Row = Record<string, unknown>;

const ORG = "org-1";
const USER = "user-1";
const REQ = "req-1";

function baseRow(over: Row = {}): Row {
  return {
    id: REQ,
    title: "Welder",
    status: "submitted",
    kind: "company_request",
    need_summary: "Need 3 welders",
    role_or_work_type: "welder",
    notes: null,
    country: "NL",
    location: "Rotterdam",
    language_requirement: null,
    payload: { skills: "welding" },
    profile_id: USER,
    organization_id: ORG,
    ...over,
  };
}

/** Minimal in-memory customer_requests with the RLS-shaped filters the
 *  module uses (eq on id / profile_id), recording every update. */
function fakeDb(rows: Row[], opts: { updateDenied?: boolean } = {}) {
  const updates: Row[] = [];
  const supabase = {
    from(table: string) {
      expect(table).toBe("customer_requests");
      const filters: [string, unknown][] = [];
      let patch: Row | null = null;
      const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return chain;
        },
        update: (p: Row) => {
          patch = p;
          return chain;
        },
        maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (patch && !opts.updateDenied) {
            const hit = match();
            for (const r of hit) Object.assign(r, patch);
            updates.push(patch);
            return resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };
  return { supabase: supabase as never, updates, rows };
}

const employer = {
  companyId: "comp-1",
  organizationId: ORG,
  organizationName: "Org One",
  role: "owner" as const,
};

function okResult(n: number, relevant: number) {
  const candidates = Array.from({ length: n }, (_, i) => ({
    workerId: `worker-${i}`,
    match: { status: i < relevant ? "strong" : "weak" },
  }));
  return {
    kind: "ok",
    candidates,
    retrieval: { poolSize: 40, capped: false, truncatedStages: [], unreadableFacts: [] },
  };
}

beforeEach(() => runScoutingCore.mockReset());

describe("runAutoMatchForDemand", () => {
  it("runs the existing scouting core on publish and writes a receipt", async () => {
    runScoutingCore.mockResolvedValue(okResult(5, 3));
    const db = fakeDb([baseRow()]);
    const out = await runAutoMatchForDemand({ supabase: db.supabase, userId: USER }, employer, REQ, "submit");
    expect(runScoutingCore).toHaveBeenCalledTimes(1);
    expect(out.kind).toBe("ran");
    if (out.kind !== "ran") return;
    expect(out.stored).toBe(true);
    const stored = readAutoMatchReceipt(db.rows[0].payload);
    expect(stored).toMatchObject({
      demandId: REQ,
      organizationId: ORG,
      matcherVersion: AUTO_MATCH_MATCHER_VERSION,
      status: "completed",
      poolSize: 40,
      matchCount: 5,
      relevantCount: 3,
      trigger: "submit",
    });
    expect(stored?.startedAt).toBeTruthy();
    expect(stored?.finishedAt).toBeTruthy();
    // existing payload preserved
    expect((db.rows[0].payload as Row).skills).toBe("welding");
  });

  it("receipt holds anonymised refs only, never worker ids or contact data", async () => {
    runScoutingCore.mockResolvedValue(okResult(4, 2));
    const db = fakeDb([baseRow()]);
    await runAutoMatchForDemand({ supabase: db.supabase, userId: USER }, employer, REQ, "submit");
    const raw = JSON.stringify(db.rows[0].payload);
    expect(raw).not.toContain("worker-0");
    const r = readAutoMatchReceipt(db.rows[0].payload)!;
    expect(r.topRefs).toEqual([anonymisedResultRef(REQ, "worker-0"), anonymisedResultRef(REQ, "worker-1")]);
  });

  it("is idempotent: re-publishing an unchanged need does not re-run", async () => {
    runScoutingCore.mockResolvedValue(okResult(2, 1));
    const db = fakeDb([baseRow()]);
    const c = { supabase: db.supabase, userId: USER };
    await runAutoMatchForDemand(c, employer, REQ, "submit");
    const again = await runAutoMatchForDemand(c, employer, REQ, "reopen");
    expect(again).toEqual({ kind: "skipped", reason: "unchanged" });
    expect(runScoutingCore).toHaveBeenCalledTimes(1);
  });

  it("re-runs when a matching-relevant field changes, not for unrelated payload keys", async () => {
    runScoutingCore.mockResolvedValue(okResult(2, 1));
    const db = fakeDb([baseRow()]);
    const c = { supabase: db.supabase, userId: USER };
    await runAutoMatchForDemand(c, employer, REQ, "submit");
    db.rows[0].location = "Utrecht";
    const rerun = await runAutoMatchForDemand(c, employer, REQ, "confirm");
    expect(rerun.kind).toBe("ran");
    expect(runScoutingCore).toHaveBeenCalledTimes(2);
  });

  it("the receipt key itself never changes the fingerprint", () => {
    const a = autoMatchInputHash(baseRow() as never);
    const b = autoMatchInputHash(
      baseRow({ payload: { skills: "welding", auto_match_receipt: { x: 1 } } }) as never,
    );
    expect(a).toBe(b);
  });

  it("publish-class result is unaffected when the matcher throws; failure is recorded and retried next event", async () => {
    runScoutingCore.mockRejectedValueOnce(new TypeError("boom"));
    const db = fakeDb([baseRow()]);
    const c = { supabase: db.supabase, userId: USER };
    const out = await runAutoMatchForDemand(c, employer, REQ, "submit");
    expect(out.kind).toBe("ran");
    const r = readAutoMatchReceipt(db.rows[0].payload)!;
    expect(r.status).toBe("failed");
    expect(r.matchCount).toBeNull();
    expect(r.errorCode).toBe("TypeError");
    runScoutingCore.mockResolvedValue(okResult(1, 1));
    const retry = await runAutoMatchForDemand(c, employer, REQ, "reopen");
    expect(retry.kind).toBe("ran");
  });

  it("submitDemandRequestCore still succeeds when the matcher throws", async () => {
    runScoutingCore.mockRejectedValueOnce(new Error("matcher down"));
    const db = fakeDb([baseRow()]);
    const supabase = {
      rpc: async () => ({ data: REQ, error: null }),
      from: (t: string) => (db.supabase as never as { from: (t: string) => unknown }).from(t),
    };
    const res = await submitDemandRequestCore(
      { supabase: supabase as never, userId: USER } as never,
      employer,
      "hire_workers",
      { description: "Need 3 welders", role: "Welder" },
    );
    expect(res).toEqual({ ok: true, requestId: REQ });
    // the matcher was attempted and the failure was recorded on the row
    expect(readAutoMatchReceipt(db.rows[0].payload)?.status).toBe("failed");
  });

  it("tenant isolation: another organization's need is never searched", async () => {
    const db = fakeDb([baseRow({ profile_id: "other-user", organization_id: "org-2" })]);
    const out = await runAutoMatchForDemand({ supabase: db.supabase, userId: USER }, employer, REQ, "submit");
    expect(out).toEqual({ kind: "skipped", reason: "not-found" });
    expect(runScoutingCore).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it("does not search for drafts, closed needs or agency offers", async () => {
    for (const over of [{ status: "draft" }, { status: "closed" }]) {
      const out = await runAutoMatchForDemand(
        { supabase: fakeDb([baseRow(over)]).supabase, userId: USER },
        employer,
        REQ,
        "submit",
      );
      expect(out).toEqual({ kind: "skipped", reason: "not-active" });
    }
    const offer = await runAutoMatchForDemand(
      { supabase: fakeDb([baseRow({ kind: "agency_offer" })]).supabase, userId: USER },
      employer,
      REQ,
      "submit",
    );
    expect(offer).toEqual({ kind: "skipped", reason: "not-a-demand" });
    expect(runScoutingCore).not.toHaveBeenCalled();
  });

  it("reports honestly when the receipt cannot be stored (colleague without update right)", async () => {
    runScoutingCore.mockResolvedValue(okResult(1, 0));
    const db = fakeDb([baseRow()], { updateDenied: true });
    const out = await runAutoMatchForDemand({ supabase: db.supabase, userId: USER }, employer, REQ, "reopen");
    expect(out.kind === "ran" && out.stored).toBe(false);
    if (out.kind === "ran") expect(out.receipt.status).toBe("no_candidates");
  });

  it("not-structured needs get an honest not_structured receipt, no counts", async () => {
    runScoutingCore.mockResolvedValue({ kind: "not-structured", demand: {} });
    const db = fakeDb([baseRow()]);
    await runAutoMatchForDemand({ supabase: db.supabase, userId: USER }, employer, REQ, "submit");
    const r = readAutoMatchReceipt(db.rows[0].payload)!;
    expect(r).toMatchObject({ status: "not_structured", poolSize: null, matchCount: null });
  });

  it("never throws on missing employer context or id", async () => {
    const db = fakeDb([baseRow()]);
    const c = { supabase: db.supabase, userId: USER };
    expect(await runAutoMatchForDemand(c, null, REQ, "submit")).toEqual({
      kind: "skipped",
      reason: "no-employer-context",
    });
    expect(await runAutoMatchForDemand(c, employer, null, "submit")).toEqual({
      kind: "skipped",
      reason: "not-found",
    });
  });
});
