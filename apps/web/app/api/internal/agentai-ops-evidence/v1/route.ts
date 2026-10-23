import { NextResponse } from "next/server";

import { AGENTAI_OPS_EVIDENCE_MAX_BYTES, parseAgentaiOpsEvidence } from "@/lib/api/agentai-ops-evidence";
import { authorizeSupplyFeedRequest } from "@/lib/api/supply-feed-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AGENTAI OS PRODUCTION EVIDENCE INTAKE (owner 2026-10-23: Agentai OS production must be verifiable without SSH, through
 * existing authorised channels, no new credentials, no paid services).
 *
 * Agentai OS (its VPS scheduler) POSTs one compact snapshot of its own production: deployed sha, last outcome per
 * scheduler job, commercial result counts and mail-listener liveness. It lands as one row of
 * `public.agentai_ops_evidence`, so production can be verified from the database instead of a shell.
 *
 * AUTH: the same machine secret as the supply feed and the capability readback (`lib/api/supply-feed-auth.ts`,
 * constant-time). 503 while the secret is unset, 401 on a wrong token. Checked BEFORE the body is read.
 *
 * BODY: `lib/api/agentai-ops-evidence.ts` — exact keys, regex-bound strings, integers only, any '@' refused. ≤ 3800
 * bytes (413). Nothing personal can reach storage.
 *
 * STORAGE: `agentai_ops_evidence_insert_v1` (migration 20261023170000) is the table's ONLY writer — RLS on with zero
 * policies, all privileges revoked from public / anon / authenticated, EXECUTE for service_role only. So every row was
 * written by this route after the bearer check; there is no anonymous path to the table. Service role is needed for
 * exactly that one RPC and reads nothing.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeSupplyFeedRequest(request);
  if (auth === "not_configured") return NextResponse.json({ ok: false, reason: auth }, { status: 503 });
  if (auth !== "ok") return NextResponse.json({ ok: false, reason: auth }, { status: 401 });

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > AGENTAI_OPS_EVIDENCE_MAX_BYTES) {
    return NextResponse.json({ ok: false, reason: "too_large" }, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, reason: "not_json" }, { status: 400 });
  }
  const parsed = parseAgentaiOpsEvidence(raw);
  if (!parsed.ok) return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 400 });

  try {
    const { data, error } = await createAdminClient().rpc("agentai_ops_evidence_insert_v1", {
      p_snapshot: parsed.value,
    });
    // 23514 = the snapshot CHECK (pg_column_size ≤ 4096). jsonb is larger than its JSON text, so a body under the
    // 3800-byte transport cap can still exceed it (measured: 3.75 KB of long job ids → 4.47 KB jsonb). That is the
    // sender's payload, not a store outage — senders keep bodies ≤ ~3200 bytes.
    if (error?.code === "23514") return NextResponse.json({ ok: false, reason: "too_large_stored" }, { status: 413 });
    if (error || typeof data !== "number") {
      return NextResponse.json({ ok: false, reason: "store_failed" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, id: data }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "store_failed" }, { status: 503 });
  }
}
