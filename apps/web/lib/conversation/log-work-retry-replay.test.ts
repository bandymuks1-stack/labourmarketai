import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P0-A (owner, 2026-10-30) — the web chat's `worker.log-work` confirm,
 * retried after its response was lost, answers with the entry the first
 * call recorded instead of `stale_confirmation` (which led the person to
 * confirm a fresh card and record the day twice). Exercised through the
 * REAL dispatcher, the REAL HMAC token and the REAL spend helper; the
 * journal head, the executor and the "already recorded" lookup are mocked.
 */

const h = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  spent: new Set<string>(),
  head: "h0",
  logWork: vi.fn(),
  lookup: vi.fn(),
}));

function query() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  chain.insert = async (row: { token_digest: string }) => {
    await new Promise((r) => setTimeout(r, 0));
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
    from: () => query(),
  }),
}));
vi.mock("@/lib/auth/profile-roles", () => ({ readActiveProfileRoles: async () => [{ role: "worker" }] }));
vi.mock("@/lib/conversation/worker-executors", () => ({
  WORKER_EXECUTORS: { "worker.log-work": h.logWork },
  logWorkFields: (locale: string, i: { engagementContextId: string; notes: string; workDate: string }) => ({
    locale,
    engagement_context_id: i.engagementContextId,
    notes: i.notes,
    work_date: i.workDate,
  }),
  logWorkResultData: (entryId: string, _skills: unknown, _day: unknown, already?: boolean) => ({
    entryId,
    ...(already ? { alreadyRecorded: true } : {}),
  }),
}));
vi.mock("@/lib/journal/confirmed-draft-replay", () => ({
  alreadyRecordedJournalEntry: (...a: unknown[]) => h.lookup(...a),
}));
vi.mock("@/lib/journal/journal-chain-fingerprint", () => ({
  journalChainFingerprint: async () => ({ ok: true, fingerprint: `journal-head:v1:w:${h.head}` }),
}));
vi.mock("@/lib/engagements/engagement-executors", () => ({ ENGAGEMENT_EXECUTORS: {} }));
vi.mock("@/lib/conversation/company-executors", () => ({ COMPANY_EXECUTORS: {} }));
vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: async () => ({ activeWorkspaceId: "personal", workspaces: [] }),
}));
vi.mock("@/lib/opportunities/interest", () => ({ interestStateFingerprint: vi.fn() }));
vi.mock("@/lib/invitations/attention", () => ({ invitationStateFingerprint: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

import { dispatchWorkerAction, prepareConfirmationAction } from "./dispatch";

const ACTION = "worker.log-work";
const INPUT = {
  engagementContextId: "22222222-2222-4222-8222-222222222222",
  notes: "Klijavau plyteles 6 val.",
  workDate: "2026-10-29",
};

async function mint(input: unknown = INPUT): Promise<string> {
  const prep = await prepareConfirmationAction(ACTION, input);
  expect(prep.ok, JSON.stringify(prep)).toBe(true);
  return prep.ok ? prep.token : "";
}
const run = (token: string, input: unknown = INPUT) =>
  dispatchWorkerAction(ACTION, input, { locale: "lt", confirmationToken: token });

beforeEach(() => {
  vi.clearAllMocks();
  h.spent.clear();
  h.head = "h0";
  h.logWork.mockImplementation(async () => {
    h.head = "h1"; // the write moves the chain head
    return { ok: true, data: { entryId: "e-first" } };
  });
  h.lookup.mockResolvedValue(null);
});

describe("worker.log-work — a retried confirm never records the day twice", () => {
  it("first confirm writes once; the retry answers with that entry and writes nothing", async () => {
    const token = await mint();
    expect(await run(token)).toEqual({ ok: true, data: { entryId: "e-first" } });
    h.lookup.mockResolvedValueOnce({ entryId: "e-first", skills: {} });
    expect(await run(token)).toEqual({ ok: true, data: { entryId: "e-first", alreadyRecorded: true } });
    expect(h.logWork).toHaveBeenCalledTimes(1);
    // the lookup gets the executor's OWN FormData mapping of this draft
    const [, fields, issuedAtMs] = h.lookup.mock.calls[0] as [unknown, Record<string, unknown>, number];
    expect(fields).toMatchObject({
      engagement_context_id: INPUT.engagementContextId,
      notes: INPUT.notes,
      work_date: INPUT.workDate,
    });
    expect(typeof issuedAtMs).toBe("number");
  });

  it("a spent token whose state did not move asks the same lookup (concurrent second submission)", async () => {
    h.logWork.mockResolvedValue({ ok: true, data: { entryId: "e-first" } }); // head stays h0
    const token = await mint();
    expect((await run(token)).ok).toBe(true);
    h.lookup.mockResolvedValueOnce({ entryId: "e-first", skills: {} });
    expect(await run(token)).toEqual({ ok: true, data: { entryId: "e-first", alreadyRecorded: true } });
    expect(h.logWork).toHaveBeenCalledTimes(1);
  });

  it("no recorded entry for the draft → still stale_confirmation (the person confirms again)", async () => {
    const token = await mint();
    await run(token);
    expect(await run(token)).toEqual({ ok: false, code: "stale_confirmation" });
    expect(h.logWork).toHaveBeenCalledTimes(1);
  });

  it("a token for other words or a forged token never reaches the lookup", async () => {
    const token = await mint();
    await run(token);
    expect(await run(token, { ...INPUT, notes: "Visai kiti žodžiai čia" })).toEqual({
      ok: false,
      code: "confirmation_invalid",
    });
    expect(await run(`${token}x`)).toEqual({ ok: false, code: "confirmation_invalid" });
    expect(h.lookup).not.toHaveBeenCalled();
  });
});
