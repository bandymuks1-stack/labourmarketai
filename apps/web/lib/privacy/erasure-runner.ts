/**
 * AUTOMATED ACCOUNT ERASURE — the system runner (owner decision 2026-10-19:
 * "Sistema turi pati vykdyti patikrintus ištrynimo prašymus be mano rankinio
 * SQL paleidimo. Neaiškius atvejus perduok peržiūrai.").
 *
 * PURE orchestration over injected doors, so it is unit-tested without a
 * database. The decisions live in the database (privacy_erasure_executor_v3):
 * this file never decides what may be deleted — it only walks the gates.
 *
 * Per confirmed request (privacy_erasure_due_v1 — confirmed by the holder
 * with a fresh sign-in, or by the owner's written approval):
 *   1. mark it approved (system review-log entry);
 *   2. dry-run plan; if the only open point is the person's files, delete
 *      exactly the listed objects through the Storage API and plan again;
 *   3. still refused -> needs_followup with the refused classes (table names
 *      only), and a review notice to the person -> STOP (human review);
 *   4. executable -> capture the completion address (held notice) ->
 *      single-use authorization -> execute (one transaction: all or nothing)
 *      -> release the notice once the receipt exists.
 * Then every queued notice is sent through the one mailbox (SMTP). An
 * unconfigured mailbox spends no attempt: notices wait in the queue.
 *
 * Idempotent: a closed request is never due again, a consumed token never
 * works twice, a released notice is released once, a sent notice is sent once.
 * Output is counts only — no id, no address, no name.
 */
import { noticeFor } from "@/lib/privacy/erasure-notice-copy";

export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
export type RemoveFiles = (bucket: string, paths: string[]) => Promise<boolean>;
export type SendMail = (
  to: string,
  subject: string,
  text: string,
) => Promise<{ status: "sent"; messageId: string } | { status: "not_configured" } | { status: "failed"; reason: string }>;

export type SweepSummary = {
  due: number;
  erased: number;
  review: number;
  errors: number;
  filesRemoved: number;
  noticesSent: number;
  noticesFailed: number;
  mailbox: "configured" | "not_configured";
};

type Plan = {
  executable?: boolean;
  refusals?: Array<{ table?: string; column?: string; reason?: string }>;
  storage?: Array<{ bucket: string; name: string }>;
};

type DueRow = { request_id: string; status: string; method: string };
type NoticeRow = { id: string; request_id: string; kind: string; recipient_email: string | null; locale: string };

const EXTERNAL = { notice: "queued" } as const;

function obj<T>(r: RpcResult): T | null {
  return r.error ? null : ((r.data ?? null) as T | null);
}

/** Table names only — what a reviewer needs, nothing about the person. */
export function reviewNote(plan: Plan): string {
  const parts = (plan.refusals ?? []).map((r) => `${r.table ?? "?"}${r.column ? "." + r.column : ""}`);
  const unique = Array.from(new Set(parts)).slice(0, 20);
  return `automatic erasure paused for human review: ${unique.join(", ") || "plan refused"}`;
}

function onlyFilesOpen(plan: Plan): boolean {
  const refusals = plan.refusals ?? [];
  return refusals.length > 0 && refusals.every((r) => r.table === "storage.objects") && (plan.storage ?? []).length > 0;
}

async function processRequest(
  rpc: Rpc,
  removeFiles: RemoveFiles,
  row: DueRow,
  s: SweepSummary,
): Promise<void> {
  const req = row.request_id;
  if (row.status !== "approved") {
    const m = obj<{ ok?: boolean }>(await rpc("privacy_erasure_mark_v1", { p_request_id: req, p_status: "approved" }));
    if (!m?.ok) {
      s.errors += 1;
      return;
    }
  }
  let plan = obj<Plan>(await rpc("privacy_erasure_plan_v3", { p_request_id: req, p_external: EXTERNAL }));
  if (!plan) {
    s.errors += 1;
    return;
  }
  if (!plan.executable && onlyFilesOpen(plan)) {
    const byBucket = new Map<string, string[]>();
    for (const f of plan.storage ?? []) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.name]);
    for (const [bucket, names] of byBucket) {
      if (!(await removeFiles(bucket, names))) {
        s.errors += 1;
        return;
      }
      s.filesRemoved += names.length;
    }
    plan = obj<Plan>(await rpc("privacy_erasure_plan_v3", { p_request_id: req, p_external: EXTERNAL }));
    if (!plan) {
      s.errors += 1;
      return;
    }
  }
  if (!plan.executable) {
    await rpc("privacy_erasure_mark_v1", { p_request_id: req, p_status: "needs_followup", p_note: reviewNote(plan) });
    await rpc("privacy_erasure_notice_hold_v1", { p_request_id: req, p_kind: "erasure_review" });
    s.review += 1;
    return;
  }
  const hold = obj<{ ok?: boolean }>(await rpc("privacy_erasure_notice_hold_v1", { p_request_id: req, p_kind: "erasure_completed" }));
  if (!hold?.ok) {
    // no address to confirm to: a human decides how to tell the person
    await rpc("privacy_erasure_mark_v1", {
      p_request_id: req,
      p_status: "needs_followup",
      p_note: "automatic erasure paused for human review: no address for the completion notice",
    });
    s.review += 1;
    return;
  }
  const auth = obj<{ authorized?: boolean; token?: string }>(
    await rpc("privacy_erasure_authorize_v3", { p_request_id: req, p_issued_by: null, p_external: EXTERNAL }),
  );
  if (!auth?.authorized || !auth.token) {
    s.errors += 1; // state moved between plan and authorize: the next sweep plans again
    return;
  }
  const done = obj<{ erased?: boolean }>(
    await rpc("erase_user_account_v3", { p_request_id: req, p_token: auth.token, p_executed_by: null }),
  );
  if (!done?.erased) {
    s.errors += 1;
    return;
  }
  s.erased += 1;
  await rpc("privacy_erasure_notice_release_v1", { p_request_id: req });
}

export async function runErasureSweep(deps: {
  rpc: Rpc;
  removeFiles: RemoveFiles;
  sendMail: SendMail;
  mailboxConfigured: boolean;
  limit?: number;
}): Promise<SweepSummary> {
  const s: SweepSummary = {
    due: 0,
    erased: 0,
    review: 0,
    errors: 0,
    filesRemoved: 0,
    noticesSent: 0,
    noticesFailed: 0,
    mailbox: deps.mailboxConfigured ? "configured" : "not_configured",
  };
  const due = obj<DueRow[]>(await deps.rpc("privacy_erasure_due_v1", { p_limit: deps.limit ?? 5 })) ?? [];
  s.due = due.length;
  for (const row of due) {
    try {
      await processRequest(deps.rpc, deps.removeFiles, row, s);
    } catch {
      s.errors += 1;
    }
  }
  // a crash between erase and release can never strand a notice
  await deps.rpc("privacy_erasure_notice_release_v1", { p_request_id: null });
  if (!deps.mailboxConfigured) return s;

  const notices = obj<NoticeRow[]>(await deps.rpc("privacy_erasure_notices_due_v1", { p_limit: 10 })) ?? [];
  for (const n of notices) {
    if (!n.recipient_email) continue;
    const copy = noticeFor(n.kind, n.locale);
    let result: Awaited<ReturnType<SendMail>>;
    try {
      result = await deps.sendMail(n.recipient_email, copy.subject, copy.text);
    } catch {
      result = { status: "failed", reason: "send_threw" };
    }
    if (result.status === "not_configured") break;
    if (result.status === "sent") {
      await deps.rpc("privacy_erasure_notice_result_v1", { p_id: n.id, p_ok: true, p_message_id: result.messageId });
      s.noticesSent += 1;
    } else {
      await deps.rpc("privacy_erasure_notice_result_v1", { p_id: n.id, p_ok: false, p_error: result.reason });
      s.noticesFailed += 1;
    }
  }
  return s;
}
