import { describe, expect, it, vi } from "vitest";

/**
 * F1/F2 (counter-canonical v1): the weekly card's "confirmed" count.
 * Before: an entry counted as confirmed when it had ANY decision row - a
 * rejection and the person's own approval included - and a corrected original
 * was counted beside its correction.
 */
const SUBJECT = "profile-subject";

const entries = [
  { id: "ok", created_at: "2026-09-10T08:00:00Z", correction_of: null },
  { id: "rej", created_at: "2026-09-10T09:00:00Z", correction_of: null },
  { id: "own", created_at: "2026-09-10T10:00:00Z", correction_of: null },
  { id: "orig", created_at: "2026-09-10T11:00:00Z", correction_of: null },
  { id: "fix", created_at: "2026-09-10T12:00:00Z", correction_of: "orig" },
];
const conf = (entry_id: string, decision: string, by: string) => ({
  entry_id,
  confirmation_scope: { decision },
  created_at: "2026-09-10T13:00:00Z",
  confirmer_id: by,
});
const confirmations = [
  conf("ok", "approved", "manager"),
  conf("rej", "rejected", "manager"),
  conf("own", "approved", SUBJECT),
  conf("orig", "approved", "manager"),
  // decision 0018: a CLIENT acceptance on an entry is a separate figure
  {
    entry_id: "rej",
    confirmation_scope: { action: "client_accept", decision: "approved", authority: { basis: "counterparty" } },
    created_at: "2026-09-10T14:00:00Z",
    confirmer_id: "client-user",
  },
];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lt", "is", "in", "order", "limit"]) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({
      data: table === "journal_entries" ? entries : confirmations,
      error: null,
    }).then(ok, err);
  return b;
}

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: (t: string) => builder(t) })) }));
vi.mock("@/lib/data/worker-core", () => ({
  getWorkerCoreRow: vi.fn(async () => ({ id: "w1", profile_id: SUBJECT })),
  getWorkerSkillRows: vi.fn(async () => []),
}));
vi.mock("@/lib/journal/entry-skill-link-read", () => ({
  readWorkerEntrySkillLinks: vi.fn(async () => ({ ok: true, rows: [], provenanceByEntry: new Map(), truncated: false })),
}));
vi.mock("@/lib/opportunities/recommendations", () => ({
  getWorkerJobRecommendations: vi.fn(async () => ({ kind: "none" })),
}));

import { getWeeklyPersonalIntelligence } from "@/lib/worker/weekly-intelligence";

describe("weekly personal intelligence - confirmed count", () => {
  it("counts independent approvals on counted-once entries only", async () => {
    const res = await getWeeklyPersonalIntelligence();
    if (res.kind !== "ready") throw new Error("expected ready");
    const active = res.intelligence.signals.find((s) => s.code === "journal_active");
    expect(active).toBeDefined();
    // 5 rows, the corrected original replaced by its correction -> 4 entries
    // (the client_accept on 'rej' adds nothing - decision 0018)
    // pre-fix: 5 entries / 4 "confirmed" (any decision row, orig counted twice)
    expect(active).toMatchObject({ entries: 4, confirmed: 1 });
  });
});
