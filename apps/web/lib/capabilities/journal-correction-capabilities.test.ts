import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P0-A parity (owner, 2026-10-30): a worker corrects their OWN Work Journal
 * entry through MCP / mobile exactly as on the web — draft → confirm, the
 * web's own `supersedeJournalEntry` (one write path), one-time token,
 * nothing re-invented. The supersede action, the worker read, the chain
 * head and the spend ledger are mocked; the token, the capability and the
 * FormData mapping are real.
 */

const h = vi.hoisted(() => ({
  head: "h0",
  spent: new Set<string>(),
  supersede: vi.fn(),
  entry: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("@/lib/security/confirmation-spend", () => ({
  spendConfirmationForRequest: async (token: string) => {
    if (h.spent.has(token)) return "already_spent";
    h.spent.add(token);
    return "spent";
  },
}));
vi.mock("@/lib/data/worker-core", () => ({
  readWorkerCoreRow: async () => ({ ok: true, value: { id: "worker-1" } }),
}));
vi.mock("@/lib/journal/journal-chain-fingerprint", () => ({
  journalChainFingerprint: async () => ({ ok: true, fingerprint: `journal-head:v1:worker-1:${h.head}` }),
}));
vi.mock("@/lib/journal/actions", () => ({
  supersedeJournalEntry: (...a: unknown[]) => h.supersede(...a),
}));

import { JOURNAL_CORRECTION_CAPABILITIES, correctionFields } from "./journal-correction-capabilities";
import type { CapabilityCaller } from "./contract";

const ENTRY_ID = "33333333-3333-4333-8333-333333333333";
const CTX = "22222222-2222-4222-8222-222222222222";

const supabase = {
  from: () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: h.entry, error: null });
    return chain;
  },
};
const caller: CapabilityCaller = {
  userId: "00000000-0000-4000-8000-0000000000aa",
  transport: "bearer",
  supabase: supabase as never,
  locale: "lt",
};
const byId = Object.fromEntries(JOURNAL_CORRECTION_CAPABILITIES.map((c) => [c.id, c]));
const run = (id: string, input: unknown) => byId[id]!.run(caller, byId[id]!.inputSchema.parse(input));

function storedEntry(over: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    worker_id: "worker-1",
    original_text: "Klijavau plyteles 6 val.",
    engagement_context_id: CTX,
    created_at: "2026-10-29T15:00:00Z",
    superseded_by: null,
    deleted_at: null,
    journal_entry_confirmations: [],
    journal_entry_metrics: [
      { metric_slug: "work_date", value_text: "2026-10-29", value_numeric: null, unit_slug: null, source: "worker_input" },
      { metric_slug: "site_name", value_text: "Vilnius A1", value_numeric: null, unit_slug: null, source: "worker_input" },
      { metric_slug: "work_direction", value_text: "tiling", value_numeric: null, unit_slug: null, source: "worker_input" },
      { metric_slug: "parsed_fragment", value_text: "1|Klijavau plyteles 6 val", value_numeric: null, unit_slug: null, source: "ai_extracted" },
      { metric_slug: "fragment_time", value_text: "1", value_numeric: 6, unit_slug: "hours", source: "ai_extracted" },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.head = "h0";
  h.spent.clear();
  h.entry = storedEntry();
  h.supersede.mockImplementation(async () => {
    h.head = "h1";
    return {
      ok: true,
      entryId: "e-new",
      skills: { status: "completed", added: 0, strengthened: 1, reviewNeeded: 0, claimsSaved: 0, cvUpdated: true },
    };
  });
});

describe("journal.correct_draft → journal.correct_confirm", () => {
  it("the draft shows before/after with canonical hours and WRITES nothing", async () => {
    const r = await run("journal.correct_draft", { entryId: ENTRY_ID, notes: "Klijavau plyteles 4 val." });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.preview).toMatchObject({
      entryId: ENTRY_ID,
      before: { notes: "Klijavau plyteles 6 val.", workDate: "2026-10-29", siteName: "Vilnius A1", hours: 6 },
      after: { notes: "Klijavau plyteles 4 val.", workDate: "2026-10-29", siteName: "Vilnius A1", hours: 4 },
      wasConfirmed: false,
    });
    expect(typeof r.data?.confirmationToken).toBe("string");
    expect(h.supersede).not.toHaveBeenCalled();
  });

  it("confirm runs the web's OWN supersede once, with the exact mapping; a replay is refused", async () => {
    const input = { entryId: ENTRY_ID, notes: "Klijavau plyteles 4 val." };
    const d = await run("journal.correct_draft", input);
    const token = d.ok ? (d.data?.confirmationToken as string) : "";
    const c = await run("journal.correct_confirm", { ...input, confirmationToken: token });
    expect(c).toMatchObject({ ok: true, data: { entryId: "e-new", correctedEntryId: ENTRY_ID } });
    expect(h.supersede).toHaveBeenCalledTimes(1);
    const [oldId, form] = h.supersede.mock.calls[0] as [string, FormData];
    expect(oldId).toBe(ENTRY_ID);
    const sent = Object.fromEntries(form.entries());
    expect(sent).toMatchObject({
      engagement_context_id: CTX,
      notes: "Klijavau plyteles 4 val.",
      work_date: "2026-10-29",
      site_name: "Vilnius A1",
      // untouched facts are re-sent, so the supersede never drops them
      work_direction: "tiling",
    });
    expect(JSON.parse(String(sent.fragments_json))[0]).toMatchObject({ timeValue: 4, timeUnit: "hours", source: "ai_extracted" });

    // the same token again: stale (the head moved) and spent — never a second write
    const again = await run("journal.correct_confirm", { ...input, confirmationToken: token });
    expect(again).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(h.supersede).toHaveBeenCalledTimes(1);
  });

  it("a token for another change, or a forged one, never reaches the write", async () => {
    const d = await run("journal.correct_draft", { entryId: ENTRY_ID, notes: "Klijavau plyteles 4 val." });
    const token = d.ok ? (d.data?.confirmationToken as string) : "";
    expect(
      await run("journal.correct_confirm", { entryId: ENTRY_ID, notes: "Klijavau plyteles 2 val.", confirmationToken: token }),
    ).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(
      await run("journal.correct_confirm", { entryId: ENTRY_ID, notes: "Klijavau plyteles 4 val.", confirmationToken: "not-a-real.token" }),
    ).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(h.supersede).not.toHaveBeenCalled();
  });

  it("only the caller's OWN live entry: another worker's reads as missing; a superseded one is refused", async () => {
    h.entry = storedEntry({ worker_id: "worker-2" });
    expect(await run("journal.correct_draft", { entryId: ENTRY_ID, workDate: "2026-10-28" })).toMatchObject({
      ok: false,
      code: "entry_not_found",
    });
    h.entry = storedEntry({ superseded_by: "44444444-4444-4444-8444-444444444444" });
    expect(await run("journal.correct_draft", { entryId: ENTRY_ID, workDate: "2026-10-28" })).toMatchObject({
      ok: false,
      code: "entry_superseded",
    });
  });

  it("a future day is refused; a change is required", async () => {
    expect(await run("journal.correct_draft", { entryId: ENTRY_ID, workDate: "2099-01-01" })).toMatchObject({
      ok: false,
      code: "work_date_invalid",
    });
    expect(byId["journal.correct_draft"]!.inputSchema.safeParse({ entryId: ENTRY_ID }).success).toBe(false);
  });

  it("a confirmed entry is corrected too (the RPC keeps its confirmation; the draft says so)", async () => {
    h.entry = storedEntry({ journal_entry_confirmations: [{ id: "c-1" }] });
    const r = await run("journal.correct_draft", { entryId: ENTRY_ID, siteName: "Kaunas B2" });
    expect(r.ok && (r.data?.preview as { wasConfirmed: boolean }).wasConfirmed).toBe(true);
  });
});

describe("correctionFields — only what the person changed changes", () => {
  const loaded = () => ({
    id: ENTRY_ID,
    originalText: "Klijavau plyteles 6 val.",
    engagementContextId: CTX,
    createdAt: "2026-10-29T15:00:00Z",
    confirmed: false,
    metrics: storedEntry().journal_entry_metrics,
  });

  it("same words, another day: the reviewed durations stay exactly as stored, with their provenance", () => {
    const f = correctionFields("lt", loaded(), { entryId: ENTRY_ID, workDate: "2026-10-28" });
    expect(f.work_date).toBe("2026-10-28");
    expect(f.site_name).toBe("Vilnius A1");
    expect(JSON.parse(f.fragments_json!)[0]).toMatchObject({ timeValue: 6, timeUnit: "hours", source: "ai_extracted" });
  });

  it("siteName null removes the site; absent keeps it", () => {
    expect(correctionFields("lt", loaded(), { entryId: ENTRY_ID, siteName: null }).site_name).toBe("");
    expect(correctionFields("lt", loaded(), { entryId: ENTRY_ID, workDate: "2026-10-28" }).site_name).toBe("Vilnius A1");
  });

  it("a stored clock span rides along unchanged", () => {
    const withSpan = {
      ...loaded(),
      originalText: "Dirbau nuo 22 iki 6",
      metrics: [
        { metric_slug: "work_date", value_text: "2026-10-29", value_numeric: null, unit_slug: null, source: "worker_input" },
        { metric_slug: "quantity", value_text: null, value_numeric: 480, unit_slug: "minutes", source: "ai_extracted" },
        { metric_slug: "work_start", value_text: "22:00", value_numeric: null, unit_slug: null, source: "ai_extracted" },
        { metric_slug: "work_end", value_text: "06:00", value_numeric: null, unit_slug: null, source: "ai_extracted" },
        { metric_slug: "break_minutes", value_text: null, value_numeric: 0, unit_slug: "minutes", source: "ai_extracted" },
      ],
    };
    const f = correctionFields("lt", withSpan, { entryId: ENTRY_ID, siteName: "Kaunas" });
    expect(f).toMatchObject({
      quantity: "480",
      unit_slug: "minutes",
      quantity_source: "ai_extracted",
      work_start: "22:00",
      work_end: "06:00",
      break_minutes: "0",
      work_time_source: "ai_extracted",
    });
  });
});
