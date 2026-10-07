import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
const emit = vi.fn(async (_f?: unknown) => ({ delivered: true }));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitJournalReviewDecisionNotification: (f: unknown) => emit(f),
}));

import { COUNTERPARTY_REVIEW_CAPABILITIES } from "./counterparty-review-capabilities";
import type { CapabilityCaller } from "./contract";

const E = "f1000000-0000-4000-8000-000000000001";
const L = "d5093154-7924-4cde-94c8-d3c4c67cf012";
const L2 = "d5093154-7924-4cde-94c8-d3c4c67cf013";
const W = "aaaaf000-0000-4000-8000-000000000f01";

const cap = (id: string) => {
  const c = COUNTERPARTY_REVIEW_CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

const queueRow = (latest: string | null = null) => ({
  entry_id: E, submission_id: "5b000000-0000-4000-8000-000000000001", link_id: L, project_id: null,
  worker_id: W, party_organization_id: null, party_role: "client", original_text: "Installed fence",
  original_language: "lt", entry_created_at: null, submitted_at: "2026-10-04T10:00:00Z",
  resubmission_of_entry_id: null, latest_decision: latest,
});

type Script = Record<string, (args: Record<string, unknown>) => { data: unknown; error: { code?: string; message: string } | null }>;
function makeCaller(script: Script, userId = "c1111111-1111-4111-8111-111111111111") {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      calls.push({ fn, args });
      const h = script[fn];
      return h ? h(args) : { data: null, error: { message: `unscripted ${fn}` } };
    },
  } as unknown as CapabilityCaller["supabase"];
  const caller: CapabilityCaller = { userId, transport: "bearer", supabase, locale: "en" };
  return { caller, calls };
}

beforeEach(() => emit.mockClear());

describe("counterparty review capabilities - shape", () => {
  it("every write is a draft -> confirm pair; drafts and reads are read-only; nothing is destructive", () => {
    const ids = COUNTERPARTY_REVIEW_CAPABILITIES.map((c) => c.id);
    for (const c of COUNTERPARTY_REVIEW_CAPABILITIES) {
      expect(c.exposed).toBe(true);
      expect(c.annotations.destructiveHint).toBe(false);
      if (c.kind === "draft") {
        expect(ids).toContain(c.id.replace(/_draft$/, "_confirm"));
        expect(c.annotations.readOnlyHint).toBe(true);
      }
      if (c.kind === "confirm") expect(c.annotations.readOnlyHint).toBe(false);
      expect(c.description).toBeTruthy();
    }
  });

  it("no input schema accepts an identity, organization, worker or authority argument", () => {
    for (const c of COUNTERPARTY_REVIEW_CAPABILITIES) {
      const shape = JSON.stringify((c.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ? Object.keys((c.inputSchema as unknown as { shape: Record<string, unknown> }).shape) : []);
      expect(shape).not.toMatch(/userId|profileId|workerId|organizationId|confirmerId|basis|authority/i);
    }
  });

  it("the decision and queue descriptions say a client acceptance is none of the other proof concepts", () => {
    for (const id of ["counterparty_review.queue.get", "counterparty_review.decide_draft", "counterparty_review.decide_confirm", "counterparty_review.entry.get"]) {
      expect(cap(id).description).toMatch(/NOT an employer confirmation/);
      expect(cap(id).description).toMatch(/NOT a payment confirmation/);
    }
  });
});

describe("queue.get / entry.get", () => {
  it("returns only what the queue returns, with the offered decisions, and re-derives the caller (no arguments)", async () => {
    const { caller, calls } = makeCaller({ list_counterparty_review_queue_v1: () => ({ data: [queueRow(), queueRow("approved")], error: null }) });
    const r = await cap("counterparty_review.queue.get").run(caller, {});
    expect(r.ok).toBe(true);
    const data = (r as unknown as { data: { total: number; entries: { state: string; decisionsStillOffered: string[]; text: string }[] } }).data;
    expect(data.total).toBe(2);
    expect(data.entries[0]).toMatchObject({ state: "to_decide", decisionsStillOffered: ["accept", "request_correction", "dispute"] });
    expect(data.entries[1]).toMatchObject({ state: "accepted", decisionsStillOffered: [] });
    expect(calls.map((c) => c.fn)).toEqual(["list_counterparty_review_queue_v1"]);
    expect(calls[0].args).toEqual({});
  });

  it("a failed read is a failure, not an empty queue; a non-party gets an empty list", async () => {
    const bad = makeCaller({ list_counterparty_review_queue_v1: () => ({ data: null, error: { message: "boom" } }) });
    const r = await cap("counterparty_review.queue.get").run(bad.caller, {});
    expect(r.ok).toBe(false);
    const none = makeCaller({ list_counterparty_review_queue_v1: () => ({ data: [], error: null }) });
    const r2 = await cap("counterparty_review.queue.get").run(none.caller, {});
    expect(r2.ok && (r2.data as { total: number }).total).toBe(0);
  });

  it("entry.get refuses a non-party (null from the database door) and never returns photo links", async () => {
    const denied = makeCaller({ counterparty_review_entry_detail_v1: () => ({ data: null, error: null }) });
    const r = await cap("counterparty_review.entry.get").run(denied.caller, { entryId: E });
    expect(r).toMatchObject({ ok: false, code: "review_authority_not_established" });
    const ok = makeCaller({
      counterparty_review_entry_detail_v1: () => ({
        data: { entry_id: E, subject_display_name: "Free Lancer", original_text: "x", metrics: [{ metric_slug: "area_done", value_numeric: 40, unit_slug: "m2" }], photos: [{ id: "p", file_name: "a.jpg", storage_path: "SECRET/a.jpg" }], history: [] },
        error: null,
      }),
    });
    const r2 = await cap("counterparty_review.entry.get").run(ok.caller, { entryId: E });
    expect(JSON.stringify(r2)).not.toContain("SECRET");
    expect(r2.ok && (r2.data as { photos: string[] }).photos).toEqual(["a.jpg"]);
  });
});

describe("decide: draft -> confirm", () => {
  const scriptFor = (latest: string | null = null, decideResult: string = "approved"): Script => ({
    list_counterparty_review_queue_v1: () => ({ data: [queueRow(latest)], error: null }),
    review_journal_entry: () => ({ data: decideResult, error: null }),
  });

  it("the draft writes nothing and mints a token; confirm with it records the decision through the shared core and notifies the worker", async () => {
    const s = makeCaller(scriptFor());
    const d = await cap("counterparty_review.decide_draft").run(s.caller, { entryId: E, decision: "accept" });
    expect(d.ok).toBe(true);
    expect(s.calls.some((c) => c.fn === "review_journal_entry")).toBe(false);
    const token = (d as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const c = await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision: "accept", confirmationToken: token });
    expect(c).toEqual({ ok: true, data: { decision: "approved", entryId: E } });
    expect(s.calls.find((x) => x.fn === "review_journal_entry")?.args).toEqual({ p_entry_id: E, p_decision: "approved", p_note: null });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ entryId: E, workerId: W, decision: "approved" }));
  });

  it("confirm without a valid draft token never reaches the database write", async () => {
    const s = makeCaller(scriptFor());
    const r = await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision: "accept", confirmationToken: "not-a-real-token" });
    expect(r).toMatchObject({ ok: false, code: "confirmation_invalid" });
    expect(s.calls.some((c) => c.fn === "review_journal_entry")).toBe(false);
  });

  it("a token minted for a different decision or note cannot be replayed", async () => {
    const s = makeCaller(scriptFor());
    const d = await cap("counterparty_review.decide_draft").run(s.caller, { entryId: E, decision: "dispute", note: "Wrong wall" });
    const token = (d as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const swapped = await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision: "accept", confirmationToken: token });
    expect(swapped).toMatchObject({ ok: false, code: "confirmation_invalid" });
    const edited = await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision: "dispute", note: "Different", confirmationToken: token });
    expect(edited).toMatchObject({ ok: false, code: "confirmation_invalid" });
    expect(s.calls.some((c) => c.fn === "review_journal_entry")).toBe(false);
  });

  it("a state change between draft and confirm voids the token (the entry got decided meanwhile)", async () => {
    const s = makeCaller(scriptFor(null));
    const d = await cap("counterparty_review.decide_draft").run(s.caller, { entryId: E, decision: "accept" });
    const token = (d as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const moved = makeCaller(scriptFor("changes_requested"));
    const r = await cap("counterparty_review.decide_confirm").run(moved.caller, { entryId: E, decision: "accept", confirmationToken: token });
    expect(r).toMatchObject({ ok: false, code: "confirmation_invalid" });
  });

  it("a token minted for one caller is refused for another", async () => {
    const a = makeCaller(scriptFor());
    const d = await cap("counterparty_review.decide_draft").run(a.caller, { entryId: E, decision: "accept" });
    const token = (d as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const b = makeCaller(scriptFor(), "c2222222-2222-4222-8222-222222222222");
    const r = await cap("counterparty_review.decide_confirm").run(b.caller, { entryId: E, decision: "accept", confirmationToken: token });
    expect(r).toMatchObject({ ok: false, code: "confirmation_invalid" });
  });

  it("the NOTE is required for a correction request and a dispute, in the draft and in the confirm", async () => {
    const s = makeCaller(scriptFor());
    for (const decision of ["request_correction", "dispute"]) {
      expect(await cap("counterparty_review.decide_draft").run(s.caller, { entryId: E, decision })).toMatchObject({ ok: false, code: "note_required" });
      expect(await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision, note: " ", confirmationToken: "x".repeat(20) })).toMatchObject({ ok: false, code: "note_required" });
    }
    expect(s.calls).toEqual([]);
  });

  it("the WRONG PARTY (entry not in the caller's own queue) is denied before any write", async () => {
    const s = makeCaller({ ...scriptFor(), list_counterparty_review_queue_v1: () => ({ data: [], error: null }) });
    const d = await cap("counterparty_review.decide_draft").run(s.caller, { entryId: E, decision: "accept" });
    expect(d).toMatchObject({ ok: false, code: "review_authority_not_established" });
    const c = await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision: "accept", confirmationToken: "x".repeat(20) });
    expect(c).toMatchObject({ ok: false, code: "review_authority_not_established" });
    expect(s.calls.some((x) => x.fn === "review_journal_entry")).toBe(false);
  });

  it("acceptance is final: no decision is offered after it, and a withdrawn dispute is accept-only", async () => {
    const acc = makeCaller(scriptFor("approved"));
    expect(await cap("counterparty_review.decide_draft").run(acc.caller, { entryId: E, decision: "dispute", note: "late" })).toMatchObject({ ok: false, code: "already_accepted" });
    const disp = makeCaller(scriptFor("rejected"));
    expect(await cap("counterparty_review.decide_draft").run(disp.caller, { entryId: E, decision: "request_correction", note: "x y z" })).toMatchObject({ ok: false, code: "not_offered" });
    expect((await cap("counterparty_review.decide_draft").run(disp.caller, { entryId: E, decision: "accept" })).ok).toBe(true);
  });

  it("an identity smuggled in arguments is rejected by the strict schema", () => {
    const schema = cap("counterparty_review.decide_draft").inputSchema;
    expect(schema.safeParse({ entryId: E, decision: "accept", confirmerId: "evil" }).success).toBe(false);
    expect(schema.safeParse({ entryId: E, decision: "accept", workerId: W }).success).toBe(false);
    expect(schema.safeParse({ entryId: E, decision: "approved" }).success).toBe(false);
  });

  it("database refusals surface as codes, never as success, and do not notify", async () => {
    const s = makeCaller(scriptFor(null, "already_accepted"));
    const d = await cap("counterparty_review.decide_draft").run(s.caller, { entryId: E, decision: "accept" });
    const token = (d as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const r = await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision: "accept", confirmationToken: token });
    expect(r).toMatchObject({ ok: false, code: "already_accepted" });
    expect(emit).not.toHaveBeenCalled();
  });

  it("no parallel logic: the confirm calls the same RPCs as the web core and no table", async () => {
    const s = makeCaller(scriptFor());
    const d = await cap("counterparty_review.decide_draft").run(s.caller, { entryId: E, decision: "accept" });
    const token = (d as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    await cap("counterparty_review.decide_confirm").run(s.caller, { entryId: E, decision: "accept", confirmationToken: token });
    expect([...new Set(s.calls.map((c) => c.fn))].sort()).toEqual(["list_counterparty_review_queue_v1", "review_journal_entry"]);
  });
});

describe("submit (worker): draft -> confirm", () => {
  const state = (over: Record<string, unknown> = {}) => ({
    [E]: { submission: null, latest: null, candidates: [{ link_id: L, party_name: "Client C", party_role: "client" }], ...over },
  });
  const script = (st: unknown, submitResult = "submitted"): Script => ({
    entry_review_states_v1: () => ({ data: st, error: null }),
    submit_journal_entry_for_review_v1: () => ({ data: submitResult, error: null }),
  });

  it("explicit two-step; the draft submits nothing", async () => {
    const s = makeCaller(script(state()));
    const d = await cap("counterparty_review.submit_draft").run(s.caller, { entryId: E });
    expect(d.ok).toBe(true);
    expect(s.calls.some((c) => c.fn === "submit_journal_entry_for_review_v1")).toBe(false);
    const { confirmationToken, linkId } = (d as unknown as { data: { confirmationToken: string; linkId: string } }).data;
    expect(linkId).toBe(L);
    const c = await cap("counterparty_review.submit_confirm").run(s.caller, { entryId: E, linkId, confirmationToken });
    expect(c).toEqual({ ok: true, data: { submitted: "submitted", entryId: E } });
    expect(s.calls.find((x) => x.fn === "submit_journal_entry_for_review_v1")?.args).toEqual({ p_entry_id: E, p_link_id: L });
  });

  it("refuses without a registered counterparty, when already submitted, and asks to choose when ambiguous", async () => {
    const none = makeCaller(script(state({ candidates: [] })));
    expect(await cap("counterparty_review.submit_draft").run(none.caller, { entryId: E })).toMatchObject({ ok: false, code: "no_counterparty_registered" });
    const done = makeCaller(script(state({ submission: { link_id: L } })));
    expect(await cap("counterparty_review.submit_draft").run(done.caller, { entryId: E })).toMatchObject({ ok: false, code: "already_submitted" });
    const two = makeCaller(script(state({ candidates: [{ link_id: L }, { link_id: L2 }] })));
    expect(await cap("counterparty_review.submit_draft").run(two.caller, { entryId: E })).toMatchObject({ ok: false, code: "counterparty_ambiguous" });
    expect(await cap("counterparty_review.submit_draft").run(two.caller, { entryId: E, linkId: "d5093154-7924-4cde-94c8-d3c4c67cf099" })).toMatchObject({ ok: false, code: "counterparty_not_valid" });
  });

  it("someone else's entry is simply not found (the state door answers only for the author)", async () => {
    const s = makeCaller(script({}));
    expect(await cap("counterparty_review.submit_draft").run(s.caller, { entryId: E })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("confirm with a forged token or changed counterparty set never submits", async () => {
    const s = makeCaller(script(state()));
    expect(await cap("counterparty_review.submit_confirm").run(s.caller, { entryId: E, linkId: L, confirmationToken: "x".repeat(20) })).toMatchObject({ ok: false, code: "confirmation_invalid" });
    const d = await cap("counterparty_review.submit_draft").run(s.caller, { entryId: E });
    const token = (d as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const moved = makeCaller(script(state({ candidates: [{ link_id: L }, { link_id: L2 }] })));
    expect(await cap("counterparty_review.submit_confirm").run(moved.caller, { entryId: E, linkId: L, confirmationToken: token })).toMatchObject({ ok: false, code: "confirmation_invalid" });
    expect(moved.calls.some((c) => c.fn === "submit_journal_entry_for_review_v1")).toBe(false);
  });
});
