import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompany: async () => ({ ok: false, reason: "personal-workspace" }),
  resolveEmployerCompanyContext: async () => ({ kind: "unavailable" }),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: () => {} }));

import { runScoutingCore, type ScoutingEmployer } from "@/lib/scouting/scouting";
import { createFakeSupabase, type FakeRow, type FakeTables } from "@/lib/test/fake-supabase";

/**
 * Owner decision 2026-10-22 — hand-raisers on a need that names NO trade.
 *
 * "When a worker expresses interest in an open need without a specified
 * trade, show that interest to the employer immediately, subject to existing
 * worker privacy and consent rules. Clearly label trade matching as not
 * assessed. Do not invent or imply verified qualifications."
 *
 * Runs the REAL scouting core and the REAL supply read over an in-memory
 * client, so the privacy gate under test is the production one: the worker
 * row answers only for a related viewer, and the discovery projection
 * (`list_discoverable_worker_profiles_v1`) answers only for a discoverable
 * worker. Nothing about visibility is mocked.
 */

const W_FOUND = "00000000-0000-4000-8000-00000000f001";
const W_HIDDEN = "00000000-0000-4000-8000-00000000f002";
const W_FIXTURE = "00000000-0000-4000-8000-00000000f003";
const W_ABE = "00000000-0000-4000-8000-00000000a001";
const W_ZED = "00000000-0000-4000-8000-00000000f999";
const W_RELATED = "00000000-0000-4000-8000-00000000b001";
const USER = "user-1";
const REQ = "req-unstructured";

const EMPLOYER: ScoutingEmployer = {
  companyId: "co-1",
  organizationId: "org-1",
  organizationName: "Real Builders UAB",
  role: "owner",
};

/** A need nothing can be derived from: no structure, no trade in the text. */
const UNSTRUCTURED_NEED: FakeRow = {
  id: REQ,
  title: "Ieškome žmonių",
  status: "submitted",
  need_summary: null,
  role_or_work_type: null,
  notes: null,
  country: null,
  location: null,
  language_requirement: null,
  payload: null,
  created_at: "2026-10-20T08:00:00.000Z",
  profile_id: USER,
};

/** Workers the employer already has a working relationship with — the raw
 *  row answers for them (RLS `caller_has_worker_relation_v1`). */
const RELATED: FakeRow[] = [
  {
    id: W_RELATED,
    profile_id: "p-related",
    display_name: "Ona Related",
    headline: "Tiler for 10 years",
    availability_status: "available",
    available_from: null,
    current_location_country: "LT",
    preferred_countries: ["LT"],
    salary_min_eur: 14,
    preferred_contract_type: null,
    experience_years: 10,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-10-19T00:00:00.000Z",
  },
];

/** Workers found through the employer-visibility consent — answered ONLY by
 *  the discovery projection, never by the table. */
function discoverable(id: string, over: Partial<FakeRow> = {}): FakeRow {
  return {
    id,
    experience_years: 3,
    current_location_country: "LT",
    preferred_countries: ["LT", "NO"],
    availability_status: "available",
    available_from: null,
    salary_min_eur: null,
    salary_max_eur: null,
    preferred_contract_type: null,
    pay_basis_preference: null,
    night_shifts_ok: null,
    weekend_shifts_ok: null,
    overtime_ok: null,
    driving_licence_categories: null,
    own_vehicle: null,
    own_tools: null,
    last_active_week: "2026-10-12",
    is_synthetic_fixture: false,
    has_available_from: false,
    detail_unlocked: true,
    ...over,
  };
}

function client(opts: {
  interest: FakeRow[];
  shortlist?: FakeRow[];
  discoverableRows?: FakeRow[];
  need?: FakeRow;
}) {
  const tables: FakeTables = {
    customer_requests: [opts.need ?? UNSTRUCTURED_NEED],
    agency_client_request_shares: [],
    skills: [],
    company_demand_locations: [],
    demand_interest_signals: opts.interest.map((r) => ({ request_id: REQ, ...r })),
    demand_shortlist: (opts.shortlist ?? []).map((r) => ({ owner_id: USER, request_id: REQ, ...r })),
    workers: RELATED,
    worker_skills: [],
    worker_professions: [],
  };
  const fake = createFakeSupabase(tables);
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const projection = opts.discoverableRows ?? [];
  const wrapped = {
    from(table: string) {
      const base = fake.client.from(table);
      return {
        select(cols?: string) {
          const q = base.select(cols);
          // The workspace/org filter is RLS's job and not under test here.
          q.or = () => q;
          return q;
        },
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "list_discoverable_worker_profiles_v1") {
        const want = new Set((args.p_worker_ids as string[]) ?? []);
        return { data: projection.filter((r) => want.has(r.id as string)), error: null };
      }
      return { data: null, error: { code: "42883", message: "function does not exist" } };
    },
  };
  return { supabase: wrapped, fake, rpcCalls };
}

async function scout(c: ReturnType<typeof client>, employer: ScoutingEmployer = EMPLOYER) {
  return runScoutingCore(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { supabase: c.supabase as any, userId: USER },
    employer,
    REQ,
  );
}

describe("hand-raisers on a need that names no trade (owner decision 2026-10-22)", () => {
  it("a visible hand-raiser is returned NOW — unscored, unranked, labelled not assessed", async () => {
    const c = client({
      interest: [{ worker_id: W_FOUND, status: "interested" }],
      discoverableRows: [discoverable(W_FOUND)],
    });
    const r = await scout(c);
    expect(r.kind).toBe("not-structured");
    if (r.kind !== "not-structured") return;
    expect(r.handRaisers).toHaveLength(1);
    const h = r.handRaisers[0]!;
    expect(h.workerId).toBe(W_FOUND);
    expect(h.matchAssessed).toBe(false);
    expect(h.interestStatus).toBe("interested");
    // Nothing a match would have said: no match, no readiness/fit, no score.
    expect(h).not.toHaveProperty("match");
    expect(h).not.toHaveProperty("readiness");
    expect(JSON.stringify(h)).not.toMatch(/"(score|status|pct|band|eligible|skillFit|rank)"/);
    // Same safe view as a scouted candidate: anonymized, contact-free.
    expect(h.preview.kind).toBe("worker_shortlist_safe_preview");
    expect(h.preview.anonymizedLabel).toMatch(/^Candidate /);
    expect(h.preview.headline).toBeNull();
    expect(Object.keys(h.preview)).not.toContain("displayName");
    // The SAME actions stay open: actionable, and contact may start.
    expect(h.actionability).toEqual({ kind: "actionable" });
    expect(h.canContact).toBe(true);
    // The demand itself is still reported as not structured.
    expect(r.demand.needSource).toBeNull();
  });

  it("a related worker's name and headline never reach the hand-raiser view", async () => {
    const r = await scout(
      client({ interest: [{ worker_id: W_RELATED, status: "reviewed" }] }),
    );
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers.map((h) => h.workerId)).toEqual([W_RELATED]);
    const text = JSON.stringify(r.handRaisers);
    expect(text).not.toContain("Ona Related");
    expect(text).not.toContain("Tiler for 10 years");
  });

  it("a withdrawn hand is not returned (and not even fetched)", async () => {
    const c = client({
      interest: [{ worker_id: W_FOUND, status: "withdrawn" }],
      discoverableRows: [discoverable(W_FOUND)],
    });
    const r = await scout(c);
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers).toEqual([]);
    expect(c.rpcCalls.filter((x) => x.name === "list_discoverable_worker_profiles_v1")).toEqual([]);
  });

  it("a hand-raiser the caller may not view stays invisible", async () => {
    // Not related (no table row) and not discoverable (the projection does
    // not answer for them): neither read returns the person.
    const c = client({
      interest: [
        { worker_id: W_HIDDEN, status: "interested" },
        { worker_id: W_FOUND, status: "interested" },
      ],
      discoverableRows: [discoverable(W_FOUND)],
    });
    const r = await scout(c);
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers.map((h) => h.workerId)).toEqual([W_FOUND]);
    expect(JSON.stringify(r)).not.toContain(W_HIDDEN);
  });

  it("a test account is not shown to a real organization (same fixture rule)", async () => {
    const r = await scout(
      client({
        interest: [{ worker_id: W_FIXTURE, status: "interested" }],
        discoverableRows: [discoverable(W_FIXTURE, { is_synthetic_fixture: true })],
      }),
    );
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers).toEqual([]);
  });

  it("the employer's own not_fit decision keeps the person off the current list", async () => {
    const r = await scout(
      client({
        interest: [{ worker_id: W_FOUND, status: "interested" }],
        shortlist: [{ worker_id: W_FOUND, status: "not_fit", note: "no" }],
        discoverableRows: [discoverable(W_FOUND)],
      }),
    );
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers).toEqual([]);
  });

  it("a closed need offers nobody", async () => {
    const r = await scout(
      client({
        need: { ...UNSTRUCTURED_NEED, status: "closed" },
        interest: [{ worker_id: W_FOUND, status: "interested" }],
        discoverableRows: [discoverable(W_FOUND)],
      }),
    );
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers).toEqual([]);
  });

  it("shortlist state and note ride along; order is the worker id, never a ranking", async () => {
    const r = await scout(
      client({
        interest: [
          { worker_id: W_ZED, status: "interested" },
          { worker_id: W_ABE, status: "contacted" },
        ],
        shortlist: [{ worker_id: W_ZED, status: "saved", note: "call Monday" }],
        discoverableRows: [discoverable(W_ZED), discoverable(W_ABE)],
      }),
    );
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers.map((h) => h.workerId)).toEqual([W_ABE, W_ZED]);
    const zed = r.handRaisers.find((h) => h.workerId === W_ZED)!;
    expect(zed.shortlistStatus).toBe("saved");
    expect(zed.shortlistNote).toBe("call Monday");
  });

  it("more hands than one pool batch: every visible one is returned (Codex review #2680)", async () => {
    // 501 > SUPPLY_POOL_BUDGET (500): the batch boundary must not drop anyone.
    const ids = Array.from({ length: 501 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    const r = await scout(
      client({
        interest: ids.map((worker_id) => ({ worker_id, status: "interested" })),
        discoverableRows: ids.map((id) => discoverable(id)),
      }),
    );
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers).toHaveLength(501);
    expect(new Set(r.handRaisers.map((h) => h.workerId)).size).toBe(501);
  });

  it("no hand-raisers → the plain not-structured state, as before", async () => {
    const c = client({ interest: [] });
    const r = await scout(c);
    expect(r).toEqual({
      kind: "not-structured",
      demand: expect.objectContaining({ id: REQ, needSource: null }),
      handRaisers: [],
    });
    // Nobody was looked up: no worker read and no discovery read.
    expect(c.fake.queries.some((q) => q.table === "workers")).toBe(false);
    expect(c.rpcCalls).toEqual([]);
  });
});
