import { describe, expect, it } from "vitest";

import { reviewNote, runErasureSweep, type Rpc, type RpcResult } from "./erasure-runner";

type Call = { fn: string; args?: Record<string, unknown> };

function fakeRpc(handlers: Record<string, (args?: Record<string, unknown>) => unknown>, calls: Call[]): Rpc {
  return async (fn, args) => {
    calls.push({ fn, args });
    const h = handlers[fn];
    if (!h) return { data: null, error: null } satisfies RpcResult;
    const out = h(args);
    if (out instanceof Error) return { data: null, error: { message: out.message } };
    return { data: out, error: null };
  };
}

const REQ = "11111111-0000-4000-8000-000000000001";
const fns = (calls: Call[]) => calls.map((c) => c.fn);

describe("automated erasure runner", () => {
  it("erases a confirmed request the plan allows, then releases and sends the completion notice", async () => {
    const calls: Call[] = [];
    const sent: Array<{ to: string; subject: string }> = [];
    const rpc = fakeRpc(
      {
        privacy_erasure_due_v1: () => [{ request_id: REQ, status: "in_review", method: "owner_written_approval" }],
        privacy_erasure_mark_v1: () => ({ ok: true }),
        privacy_erasure_plan_v3: () => ({ executable: true, refusals: [], storage: [] }),
        privacy_erasure_notice_hold_v1: () => ({ ok: true }),
        privacy_erasure_authorize_v3: () => ({ authorized: true, token: "a".repeat(64) }),
        erase_user_account_v3: () => ({ erased: true }),
        privacy_erasure_notice_release_v1: () => ({ ok: true, released: 1 }),
        privacy_erasure_notices_due_v1: () => [
          { id: "n1", request_id: REQ, kind: "erasure_completed", recipient_email: "x@example.test", locale: "lt" },
        ],
        privacy_erasure_notice_result_v1: () => ({ ok: true }),
      },
      calls,
    );
    const s = await runErasureSweep({
      rpc,
      removeFiles: async () => true,
      sendMail: async (to, subject) => {
        sent.push({ to, subject });
        return { status: "sent", messageId: "<m1@labourmarket.ai>" };
      },
      mailboxConfigured: true,
    });
    expect(s).toMatchObject({ due: 1, erased: 1, review: 0, errors: 0, noticesSent: 1 });
    expect(fns(calls)).toEqual([
      "privacy_erasure_due_v1",
      "privacy_erasure_mark_v1",
      "privacy_erasure_plan_v3",
      "privacy_erasure_notice_hold_v1",
      "privacy_erasure_authorize_v3",
      "erase_user_account_v3",
      "privacy_erasure_notice_release_v1",
      "privacy_erasure_notice_release_v1",
      "privacy_erasure_notices_due_v1",
      "privacy_erasure_notice_result_v1",
    ]);
    // the address is captured BEFORE authorization (the account no longer exists afterwards)
    expect(calls.find((c) => c.fn === "privacy_erasure_notice_hold_v1")?.args).toEqual({ p_request_id: REQ, p_kind: "erasure_completed" });
    expect(calls.find((c) => c.fn === "privacy_erasure_authorize_v3")?.args?.p_external).toEqual({ notice: "queued" });
    expect(sent).toEqual([{ to: "x@example.test", subject: "Jūsų LabourMarket.ai paskyra ištrinta" }]);
    expect(calls.at(-1)?.args).toEqual({ p_id: "n1", p_ok: true, p_message_id: "<m1@labourmarket.ai>" });
  });

  it("a refused plan goes to human review with table names only, and never authorizes", async () => {
    const calls: Call[] = [];
    const rpc = fakeRpc(
      {
        privacy_erasure_due_v1: () => [{ request_id: REQ, status: "approved", method: "fresh_sign_in" }],
        privacy_erasure_plan_v3: () => ({
          executable: false,
          refusals: [{ table: "public.journal_entries", column: "worker_id", reason: "employer working-time" }],
        }),
        privacy_erasure_mark_v1: () => ({ ok: true }),
        privacy_erasure_notice_hold_v1: () => ({ ok: true }),
      },
      calls,
    );
    const s = await runErasureSweep({ rpc, removeFiles: async () => true, sendMail: async () => ({ status: "not_configured" }), mailboxConfigured: false });
    expect(s).toMatchObject({ due: 1, erased: 0, review: 1, errors: 0, mailbox: "not_configured" });
    expect(fns(calls)).not.toContain("privacy_erasure_authorize_v3");
    expect(fns(calls)).not.toContain("erase_user_account_v3");
    const mark = calls.find((c) => c.fn === "privacy_erasure_mark_v1");
    expect(mark?.args).toMatchObject({ p_status: "needs_followup" });
    expect(String(mark?.args?.p_note)).toBe("automatic erasure paused for human review: public.journal_entries.worker_id");
    expect(calls.find((c) => c.fn === "privacy_erasure_notice_hold_v1")?.args).toEqual({ p_request_id: REQ, p_kind: "erasure_review" });
    // already approved: no second approval mark
    expect(calls.filter((c) => c.fn === "privacy_erasure_mark_v1")).toHaveLength(1);
  });

  it("when only the person's files are open, deletes exactly the listed objects and plans again", async () => {
    const calls: Call[] = [];
    const removed: Array<[string, string[]]> = [];
    let planned = 0;
    const rpc = fakeRpc(
      {
        privacy_erasure_due_v1: () => [{ request_id: REQ, status: "approved", method: "fresh_sign_in" }],
        privacy_erasure_plan_v3: () =>
          planned++ === 0
            ? {
                executable: false,
                refusals: [{ table: "storage.objects", reason: "files" }],
                storage: [
                  { bucket: "profile-avatars", name: "u/a.jpg" },
                  { bucket: "journal-entry-photos", name: "u/e/p.jpg" },
                  { bucket: "profile-avatars", name: "u/b.jpg" },
                ],
              }
            : { executable: true, refusals: [], storage: [] },
        privacy_erasure_notice_hold_v1: () => ({ ok: true }),
        privacy_erasure_authorize_v3: () => ({ authorized: true, token: "b".repeat(64) }),
        erase_user_account_v3: () => ({ erased: true }),
      },
      calls,
    );
    const s = await runErasureSweep({
      rpc,
      removeFiles: async (bucket, paths) => {
        removed.push([bucket, paths]);
        return true;
      },
      sendMail: async () => ({ status: "not_configured" }),
      mailboxConfigured: false,
    });
    expect(removed).toEqual([
      ["profile-avatars", ["u/a.jpg", "u/b.jpg"]],
      ["journal-entry-photos", ["u/e/p.jpg"]],
    ]);
    expect(s).toMatchObject({ erased: 1, filesRemoved: 3, errors: 0 });
  });

  it("a failed file removal stops that request before any authorization", async () => {
    const calls: Call[] = [];
    const rpc = fakeRpc(
      {
        privacy_erasure_due_v1: () => [{ request_id: REQ, status: "approved", method: "fresh_sign_in" }],
        privacy_erasure_plan_v3: () => ({ executable: false, refusals: [{ table: "storage.objects" }], storage: [{ bucket: "b", name: "n" }] }),
      },
      calls,
    );
    const s = await runErasureSweep({ rpc, removeFiles: async () => false, sendMail: async () => ({ status: "not_configured" }), mailboxConfigured: false });
    expect(s).toMatchObject({ erased: 0, errors: 1, review: 0 });
    expect(fns(calls)).not.toContain("privacy_erasure_authorize_v3");
  });

  it("an execution that does not erase is an error, and the notice is not released", async () => {
    const calls: Call[] = [];
    const rpc = fakeRpc(
      {
        privacy_erasure_due_v1: () => [{ request_id: REQ, status: "approved", method: "fresh_sign_in" }],
        privacy_erasure_plan_v3: () => ({ executable: true, refusals: [] }),
        privacy_erasure_notice_hold_v1: () => ({ ok: true }),
        privacy_erasure_authorize_v3: () => ({ authorized: true, token: "c".repeat(64) }),
        erase_user_account_v3: () => ({ erased: false }),
      },
      calls,
    );
    const s = await runErasureSweep({ rpc, removeFiles: async () => true, sendMail: async () => ({ status: "not_configured" }), mailboxConfigured: false });
    expect(s).toMatchObject({ erased: 0, errors: 1 });
    expect(calls.filter((c) => c.fn === "privacy_erasure_notice_release_v1").map((c) => c.args)).toEqual([{ p_request_id: null }]);
  });

  it("no address for the completion notice -> human review, no authorization", async () => {
    const calls: Call[] = [];
    const rpc = fakeRpc(
      {
        privacy_erasure_due_v1: () => [{ request_id: REQ, status: "approved", method: "fresh_sign_in" }],
        privacy_erasure_plan_v3: () => ({ executable: true, refusals: [] }),
        privacy_erasure_notice_hold_v1: () => ({ ok: false, error: "no_address" }),
        privacy_erasure_mark_v1: () => ({ ok: true }),
      },
      calls,
    );
    const s = await runErasureSweep({ rpc, removeFiles: async () => true, sendMail: async () => ({ status: "not_configured" }), mailboxConfigured: false });
    expect(s).toMatchObject({ review: 1, erased: 0 });
    expect(fns(calls)).not.toContain("privacy_erasure_authorize_v3");
  });

  it("an unconfigured mailbox spends no send attempt; a failed send is recorded for retry", async () => {
    const calls: Call[] = [];
    const notices = [
      { id: "n1", request_id: REQ, kind: "erasure_completed", recipient_email: "a@example.test", locale: "en" },
      { id: "n2", request_id: REQ, kind: "erasure_review", recipient_email: "b@example.test", locale: "lt" },
    ];
    const rpc = fakeRpc({ privacy_erasure_due_v1: () => [], privacy_erasure_notices_due_v1: () => notices }, calls);
    const off = await runErasureSweep({ rpc, removeFiles: async () => true, sendMail: async () => ({ status: "not_configured" }), mailboxConfigured: false });
    expect(off.noticesSent + off.noticesFailed).toBe(0);
    expect(fns(calls)).not.toContain("privacy_erasure_notices_due_v1");

    const calls2: Call[] = [];
    const rpc2 = fakeRpc({ privacy_erasure_due_v1: () => [], privacy_erasure_notices_due_v1: () => notices }, calls2);
    const on = await runErasureSweep({
      rpc: rpc2,
      removeFiles: async () => true,
      sendMail: async (to) => (to.startsWith("a") ? { status: "failed", reason: "smtp_rcpt_to_550" } : { status: "sent", messageId: "<m2>" }),
      mailboxConfigured: true,
    });
    expect(on).toMatchObject({ noticesSent: 1, noticesFailed: 1 });
    expect(calls2.filter((c) => c.fn === "privacy_erasure_notice_result_v1").map((c) => c.args)).toEqual([
      { p_id: "n1", p_ok: false, p_error: "smtp_rcpt_to_550" },
      { p_id: "n2", p_ok: true, p_message_id: "<m2>" },
    ]);
  });

  it("the review note never carries a reason text (it may name a person) — only table names", () => {
    expect(
      reviewNote({ refusals: [{ table: "public.x", reason: "about Jane Doe jane@example.test" }, { table: "public.x" }] }),
    ).toBe("automatic erasure paused for human review: public.x");
  });
});
