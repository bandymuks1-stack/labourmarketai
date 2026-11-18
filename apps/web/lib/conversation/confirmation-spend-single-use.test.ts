import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A CONFIRMATION IS SPENT ONCE — sequentially AND concurrently — exercised
 * through the REAL dispatcher, the REAL HMAC token and the REAL spend helper.
 *
 * Mocked: the session, the role read, the workspace read, the executors (spies)
 * and the database (an in-memory `confirmation_spends` with primary-key
 * semantics, plus the rows the fingerprints read). Real: dispatch.ts,
 * confirmation-token.ts, confirmation-spend.ts, the registry and the schemas.
 *
 * The fingerprint alone could not stop two of these: a replay whose write did
 * not move the state the fingerprint reads, and two submissions at the same
 * moment (both read the old state before either writes).
 */

const h = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  spent: new Set<string>(),
  ledger: "ok" as "ok" | "missing" | "broken",
  rows: {} as Record<string, unknown[]>,
  createProgramme: vi.fn(),
  proposeBooking: vi.fn(),
}));

function query(table: string) {
  const result = { data: h.rows[table] ?? [], error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  chain.insert = async (row: { token_digest: string }) => {
    // Yield first, so concurrent callers interleave exactly like requests do.
    await new Promise((r) => setTimeout(r, 0));
    if (h.ledger === "missing") return { error: { code: "42P01" } };
    if (h.ledger === "broken") return { error: { code: "42501" } };
    if (h.spent.has(row.token_digest)) return { error: { code: "23505" } };
    h.spent.add(row.token_digest);
    return { error: null };
  };
  return chain;
}

vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("@/lib/auth/actions", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: h.userId } } }) },
    from: (table: string) => query(table),
  }),
}));
vi.mock("@/lib/auth/profile-roles", () => ({ readActiveProfileRoles: async () => [{ role: "company" }] }));
vi.mock("@/lib/conversation/worker-executors", () => ({ WORKER_EXECUTORS: {} }));
vi.mock("@/lib/engagements/engagement-executors", () => ({ ENGAGEMENT_EXECUTORS: {} }));
vi.mock("@/lib/conversation/company-executors", () => ({
  COMPANY_EXECUTORS: { "company.create-programme": h.createProgramme, "company.propose-booking": h.proposeBooking },
}));
vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: async () => ({ activeWorkspaceId: "2e3a4744-0000-4000-8000-000000000001", workspaces: [] }),
}));
vi.mock("@/lib/opportunities/interest", () => ({ interestStateFingerprint: vi.fn() }));
vi.mock("@/lib/invitations/attention", () => ({ invitationStateFingerprint: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

import { dispatchWorkerAction, prepareConfirmationAction } from "./dispatch";

const PROGRAMME = "company.create-programme";
const P_INPUT = { name: "Welding basics" };
const BOOKING = "company.propose-booking";
const B_INPUT = { requestId: "44444444-4444-4444-8444-444444444444", workerId: "55555555-5555-4555-8555-555555555555" };

async function mint(actionId: string, input: unknown): Promise<string> {
  const prep = await prepareConfirmationAction(actionId, input);
  expect(prep.ok, JSON.stringify(prep)).toBe(true);
  return prep.ok ? prep.token : "";
}
const run = (actionId: string, input: unknown, token: string) =>
  dispatchWorkerAction(actionId, input, { locale: "lt", confirmationToken: token });

beforeEach(() => {
  vi.clearAllMocks();
  h.spent.clear();
  h.ledger = "ok";
  h.rows = {};
  h.createProgramme.mockResolvedValue({ ok: true, data: { programId: "p-1" } });
  h.proposeBooking.mockResolvedValue({ ok: true, data: { status: "proposed" } });
});

describe("confirmation spend — single use", () => {
  it("POSITIVE: a fresh genuine token executes exactly once", async () => {
    const token = await mint(PROGRAMME, P_INPUT);
    expect(await run(PROGRAMME, P_INPUT, token)).toEqual({ ok: true, data: { programId: "p-1" } });
    expect(h.createProgramme).toHaveBeenCalledTimes(1);
    expect(h.spent.size).toBe(1);
  });

  it("NEGATIVE: a tampered token, or one for other input, never runs and spends nothing", async () => {
    const token = await mint(PROGRAMME, P_INPUT);
    expect(await run(PROGRAMME, P_INPUT, `${token}x`)).toEqual({ ok: false, code: "confirmation_invalid" });
    expect(await run(PROGRAMME, { name: "Another programme" }, token)).toEqual({ ok: false, code: "confirmation_invalid" });
    expect(await run(PROGRAMME, P_INPUT, "")).toEqual({ ok: false, code: "confirmation_required" });
    expect(h.createProgramme).not.toHaveBeenCalled();
    expect(h.spent.size).toBe(0);
  });

  it("REPLAY: the same token again is refused even when the state did not move", async () => {
    const token = await mint(PROGRAMME, P_INPUT);
    expect((await run(PROGRAMME, P_INPUT, token)).ok).toBe(true);
    // The write is not visible to the fingerprint read (h.rows unchanged).
    expect(await run(PROGRAMME, P_INPUT, token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.createProgramme).toHaveBeenCalledTimes(1);
  });

  it("CONCURRENT: of five simultaneous submissions exactly one executes", async () => {
    const token = await mint(PROGRAMME, P_INPUT);
    const results = await Promise.all(Array.from({ length: 5 }, () => run(PROGRAMME, P_INPUT, token)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "stale_confirmation")).toHaveLength(4);
    expect(h.createProgramme).toHaveBeenCalledTimes(1);
  });

  it("a NEW prepare gives a new token that works once (the person can always act again)", async () => {
    const first = await mint(PROGRAMME, P_INPUT);
    expect((await run(PROGRAMME, P_INPUT, first)).ok).toBe(true);
    h.rows.education_programs = [{ id: "p-1" }];
    const second = await mint(PROGRAMME, P_INPUT);
    expect((await run(PROGRAMME, P_INPUT, second)).ok).toBe(true);
    expect(h.createProgramme).toHaveBeenCalledTimes(2);
  });

  it("FAIL CLOSED: a ledger that refuses the insert for another reason runs nothing", async () => {
    h.ledger = "broken";
    const token = await mint(PROGRAMME, P_INPUT);
    expect(await run(PROGRAMME, P_INPUT, token)).toEqual({ ok: false, code: "error" });
    expect(h.createProgramme).not.toHaveBeenCalled();
  });

  it("DEGRADED: without the ledger table the fingerprint still refuses a replay whose write moved the state", async () => {
    h.ledger = "missing";
    const token = await mint(PROGRAMME, P_INPUT);
    expect((await run(PROGRAMME, P_INPUT, token)).ok).toBe(true);
    h.rows.education_programs = [{ id: "p-1" }];
    expect(await run(PROGRAMME, P_INPUT, token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.createProgramme).toHaveBeenCalledTimes(1);
  });
});

describe("propose-booking cannot overwrite the worker's answer", () => {
  it("a token minted before the worker declined is refused after the decline — even without the ledger", async () => {
    h.ledger = "missing"; // prove the fingerprint layer on its own
    h.rows.booking_requests = [{ id: "b-1", status: "proposed", updated_at: "2026-10-13T10:00:00Z" }];
    const token = await mint(BOOKING, B_INPUT);
    // The worker declines inside the TTL.
    h.rows.booking_requests = [{ id: "b-1", status: "declined", updated_at: "2026-10-13T10:01:00Z" }];
    expect(await run(BOOKING, B_INPUT, token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.proposeBooking).not.toHaveBeenCalled();
  });

  it("the first proposal moves the booking, so the replay is stale", async () => {
    h.ledger = "missing";
    const token = await mint(BOOKING, B_INPUT);
    expect((await run(BOOKING, B_INPUT, token)).ok).toBe(true);
    h.rows.booking_requests = [{ id: "b-1", status: "proposed", updated_at: "2026-10-13T10:00:00Z" }];
    expect(await run(BOOKING, B_INPUT, token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.proposeBooking).toHaveBeenCalledTimes(1);
  });
});
