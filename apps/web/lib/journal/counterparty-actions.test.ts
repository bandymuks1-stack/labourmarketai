import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getUser = vi.fn();
const emit = vi.fn();
const revalidatePath = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitJournalReviewDecisionNotification: (f: unknown) => emit(f),
}));

import {
  decideCounterpartyEntry,
  registerCounterpartyLink,
  revokeCounterpartyLink,
  submitEntryForReview,
} from "./counterparty-actions";

const P = "90000000-0000-0000-0000-00000000000c";
const W = "aaaaf000-0000-0000-0000-000000000f01";
const E = "f1000000-0000-0000-0000-000000000001";
const L = "d5093154-7924-4cde-94c8-d3c4c67cf012";
const U = "c1111111-1111-1111-1111-111111111111";

function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  emit.mockReset();
  revalidatePath.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: U } } });
});

describe("registerCounterpartyLink", () => {
  it("calls the database function with ONLY ids and a role - never an actor", async () => {
    rpc.mockResolvedValue({ data: "registered", error: null });
    const r = await registerCounterpartyLink(null, fd({ project_id: P, worker_id: W, party_role: "customer", locale: "lt" }));
    expect(r).toEqual({ ok: true, code: "registered" });
    expect(rpc).toHaveBeenCalledWith("register_work_counterparty_link_v1", {
      p_project_id: P,
      p_worker_id: W,
      p_party_role: "customer",
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/lt/dashboard/projects/${P}`);
  });

  it("surfaces the database refusal; never turns it into success", async () => {
    for (const code of ["no_work_relationship", "not_authorized", "subject_cannot_register_own_counterparty", "counterparty_not_independent"]) {
      rpc.mockResolvedValue({ data: code, error: null });
      const r = await registerCounterpartyLink(null, fd({ project_id: P, worker_id: W, party_role: "client" }));
      expect(r).toEqual({ ok: false, code });
    }
  });

  it("rejects malformed ids and unknown roles before any database call", async () => {
    expect(await registerCounterpartyLink(null, fd({ project_id: "x", worker_id: W }))).toEqual({ ok: false, code: "error" });
    expect(await registerCounterpartyLink(null, fd({ project_id: P, worker_id: W, party_role: "owner" }))).toEqual({
      ok: false,
      code: "invalid_party_role",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller without calling the database", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await registerCounterpartyLink(null, fd({ project_id: P, worker_id: W, party_role: "client" }));
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a missing function to needs_migration, other errors to error", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "missing" } });
    expect(await registerCounterpartyLink(null, fd({ project_id: P, worker_id: W, party_role: "client" }))).toEqual({ ok: false, code: "needs_migration" });
    rpc.mockResolvedValue({ data: null, error: { code: "XX", message: "boom" } });
    expect(await registerCounterpartyLink(null, fd({ project_id: P, worker_id: W, party_role: "client" }))).toEqual({ ok: false, code: "error" });
  });
});

describe("revokeCounterpartyLink", () => {
  it("revokes through the function and refreshes the project and the journal", async () => {
    rpc.mockResolvedValue({ data: "revoked", error: null });
    const r = await revokeCounterpartyLink(null, fd({ link_id: L, project_id: P, locale: "en" }));
    expect(r).toEqual({ ok: true, code: "revoked" });
    expect(rpc).toHaveBeenCalledWith("revoke_work_counterparty_link_v1", { p_link_id: L });
    expect(revalidatePath).toHaveBeenCalledWith(`/en/dashboard/projects/${P}`);
    expect(revalidatePath).toHaveBeenCalledWith("/en/dashboard/journal");
  });

  it("returns the refusal for a non-party", async () => {
    rpc.mockResolvedValue({ data: "not_authorized", error: null });
    expect(await revokeCounterpartyLink(null, fd({ link_id: L }))).toEqual({ ok: false, code: "not_authorized" });
  });
});

describe("submitEntryForReview", () => {
  it("submits only on an explicit call and passes the picked link (or null)", async () => {
    rpc.mockResolvedValue({ data: "submitted", error: null });
    expect(await submitEntryForReview(null, fd({ entry_id: E, link_id: L }))).toEqual({ ok: true, code: "submitted" });
    expect(rpc).toHaveBeenLastCalledWith("submit_journal_entry_for_review_v1", { p_entry_id: E, p_link_id: L });
    await submitEntryForReview(null, fd({ entry_id: E, link_id: "" }));
    expect(rpc).toHaveBeenLastCalledWith("submit_journal_entry_for_review_v1", { p_entry_id: E, p_link_id: null });
  });

  it("treats an already-submitted entry as idempotent success and refusals as failures", async () => {
    rpc.mockResolvedValue({ data: "already_submitted", error: null });
    expect((await submitEntryForReview(null, fd({ entry_id: E }))).ok).toBe(true);
    rpc.mockResolvedValue({ data: "no_counterparty_registered", error: null });
    expect(await submitEntryForReview(null, fd({ entry_id: E }))).toEqual({ ok: false, code: "no_counterparty_registered" });
  });

  it("rejects a malformed link id", async () => {
    expect(await submitEntryForReview(null, fd({ entry_id: E, link_id: "nope" }))).toEqual({ ok: false, code: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("decideCounterpartyEntry", () => {
  const queue = [
    {
      entry_id: E,
      submission_id: "5b000000-0000-0000-0000-000000000001",
      link_id: L,
      worker_id: W,
      party_role: "client",
      original_text: "x",
      latest_decision: null,
    },
  ];
  function wire(decideResult: unknown, q: unknown = queue) {
    rpc.mockImplementation(async (name: string) => {
      if (name === "list_counterparty_review_queue_v1") return { data: q, error: null };
      if (name === "review_journal_entry") return { data: decideResult, error: null };
      return { data: null, error: { message: "unexpected" } };
    });
  }

  it("maps accept -> approved, re-derives the caller's queue first, notifies the worker", async () => {
    wire("approved");
    const r = await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "accept", note: "", locale: "lt" }));
    expect(r).toEqual({ ok: true, decision: "approved" });
    expect(rpc).toHaveBeenNthCalledWith(1, "list_counterparty_review_queue_v1");
    expect(rpc).toHaveBeenNthCalledWith(2, "review_journal_entry", { p_entry_id: E, p_decision: "approved", p_note: null });
    expect(emit).toHaveBeenCalledWith({ entryId: E, workerId: W, actorProfileId: U, decision: "approved" });
  });

  it("requires a note for a correction request and a dispute", async () => {
    wire("changes_requested");
    expect(await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "request_correction", note: " " }))).toEqual({ ok: false, code: "note_required" });
    expect(await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "dispute", note: "" }))).toEqual({ ok: false, code: "note_required" });
    expect(rpc).not.toHaveBeenCalled();
    const r = await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "request_correction", note: "Wall B is wrong" }));
    expect(r).toEqual({ ok: true, decision: "changes_requested" });
    expect(rpc).toHaveBeenLastCalledWith("review_journal_entry", { p_entry_id: E, p_decision: "changes_requested", p_note: "Wall B is wrong" });
  });

  it("NEVER trusts the browser: an entry outside the caller's counterparty queue is refused before the decision call", async () => {
    wire("approved", []);
    const r = await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "accept" }));
    expect(r).toEqual({ ok: false, code: "review_authority_not_established" });
    expect(rpc).not.toHaveBeenCalledWith("review_journal_entry", expect.anything());
    expect(emit).not.toHaveBeenCalled();
  });

  it("ignores any identity or worker the browser might send", async () => {
    wire("approved");
    await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "accept", worker_id: "evil", confirmer_id: "evil", actor: "evil" }));
    const decideCall = rpc.mock.calls.find((c) => c[0] === "review_journal_entry");
    expect(Object.keys(decideCall?.[1] ?? {}).sort()).toEqual(["p_decision", "p_entry_id", "p_note"]);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ workerId: W, actorProfileId: U }));
  });

  it("returns the database refusal (final acceptance, superseded) and never notifies", async () => {
    wire("already_accepted");
    expect(await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "dispute", note: "late dispute" }))).toEqual({ ok: false, code: "already_accepted" });
    expect(emit).not.toHaveBeenCalled();
    wire("entry_superseded");
    expect(await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "accept" }))).toEqual({ ok: false, code: "entry_superseded" });
  });

  it("maps trigger errors raised by the choke point to stable codes", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "list_counterparty_review_queue_v1"
        ? { data: queue, error: null }
        : { data: null, error: { code: "42501", message: "review_authority_not_established" } },
    );
    expect(await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "accept" }))).toEqual({ ok: false, code: "review_authority_not_established" });
  });

  it("rejects an unknown decision word", async () => {
    expect(await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "approved" }))).toEqual({ ok: false, code: "invalid_decision" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a notification failure never fails the committed decision", async () => {
    wire("approved");
    emit.mockImplementation(() => {
      throw new Error("mail down");
    });
    expect(await decideCounterpartyEntry(null, fd({ entry_id: E, decision: "accept" }))).toEqual({ ok: true, decision: "approved" });
  });
});
