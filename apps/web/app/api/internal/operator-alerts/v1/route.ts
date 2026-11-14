import { NextResponse } from "next/server";

import { authorizeOperatorAlertsTrigger } from "@/lib/api/operator-alerts-auth";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { sendSmtp, smtpConfigFromEnv } from "@/lib/email/smtp";
import { runOperatorAlertSweep, type Rpc } from "@/lib/notifications/operator-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * OPERATOR ALERTS SWEEP — new company applications to the responsible operators, a reminder at
 * 24 h, an escalation to admins at 48 h (lib/notifications/operator-alerts.ts, migration
 * 20261112090000).
 *
 * TRIGGER: the GitHub Actions schedule `.github/workflows/operator-alerts-cadence.yml` (every
 * 5 minutes when switched on; GitHub may start a scheduled run late, so delivery within 5 minutes is
 * not promised). AUTH: `OPERATOR_ALERTS_TRIGGER_TOKEN` machine secret (lib/api/operator-alerts-auth.ts),
 * 401 while unset. SEND: the existing SMTP transport (`LM_SMTP_*`); while it is not configured the
 * sweep refuses before reserving anything, so no stage is marked.
 *
 * The answer is counts and a reason code only — no id, no address.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeOperatorAlertsTrigger(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const smtp = smtpConfigFromEnv();
  if (!smtp) {
    return NextResponse.json({ ok: false, reason: "mail_not_configured" }, { status: 503 });
  }
  const admin = createAdminClient();
  const rpc: Rpc = async (fn, args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).rpc(fn, args ?? {});
    return { data, error };
  };
  const result = await runOperatorAlertSweep(rpc, (msg) => sendSmtp(smtp, msg), CANONICAL_ORIGIN);
  if (result.kind === "needs_migration") {
    return NextResponse.json({ ok: false, reason: "needs_migration" }, { status: 503 });
  }
  if (result.kind === "unavailable") {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...result.counts });
}
