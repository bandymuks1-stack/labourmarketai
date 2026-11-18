import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { sendSmtp, smtpConfigFromEnv } from "@/lib/email/smtp";
import { runErasureSweep, type Rpc } from "@/lib/privacy/erasure-runner";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AUTOMATED ACCOUNT ERASURE SWEEP (owner decision 2026-10-19) — erases every
 * CONFIRMED account-deletion request the database's own plan allows, sends
 * the completion / review notices through the one mailbox (Hostinger SMTP,
 * LM_SMTP_*), and leaves everything else to human review.
 *
 * AUTH: `authorizeCronRequest` — CRON_SECRET; refused while unset. Scheduled
 * every 10 minutes by the VPS cron (ops/vps/labourmarket.cron). All decisions
 * live in privacy_erasure_executor_v3; see lib/privacy/erasure-runner.ts.
 * Responses carry counts only — no ids, no addresses, no names.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const admin = createAdminClient();
  const rpc: Rpc = async (fn, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).rpc(fn, args ?? {});
    return { data, error: error ? { code: error.code, message: error.message } : null };
  };
  const smtp = smtpConfigFromEnv();
  try {
    const summary = await runErasureSweep({
      rpc,
      removeFiles: async (bucket, paths) => {
        const { error } = await admin.storage.from(bucket).remove(paths);
        return !error;
      },
      sendMail: async (to, subject, text) =>
        smtp ? sendSmtp(smtp, { to, subject, text }) : { status: "not_configured" },
      mailboxConfigured: smtp !== null,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
