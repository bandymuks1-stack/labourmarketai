import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { summarizeHealth, timedCheck } from "@/lib/ops/health-model";

/**
 * GET /api/health — production liveness for an external monitor (Train L1).
 *
 * Public on purpose: a monitor holds no credential, and the answer contains
 * nothing worth protecting (booleans, latencies, the build id). Both probes
 * use only what every browser already has (the anon key) and hit dependencies
 * a sign-in needs: the auth server and the database through PostgREST.
 *
 * 200 when both answer, 503 otherwise — so a monitor can page on status alone.
 * `Cache-Control: no-store`: a health answer is never reused.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROBE_TIMEOUT_MS = 4_000;

/**
 * The db probe is a CONSTANT-COST real read: a primary-key lookup through
 * PostgREST and the pooler on the anon-executable public-vacancy preview,
 * keyed on the nil UUID so it matches nothing and returns an empty set.
 *
 * It replaced `count_public_vacancies_v1` on 2026-09-03 (P0-1): that count
 * scans ~45k active rows and measured 3.1–3.8 s on a cold buffer pool against
 * the anon role's 3 s statement_timeout, so the probe answered 503 on cold
 * buffers and 200 once warm — a false alarm about a slow public query, not
 * about the product's ability to serve a person. The semantics are unchanged:
 * `db.ok` still means "the database answered a real query for an anonymous
 * caller"; only the cost of the question is now bounded.
 */
const DB_PROBE_RPC = "get_public_vacancy_preview_v1";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export async function GET(): Promise<NextResponse> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missingEnv = !supabaseUrl || !anonKey;

  const [auth, db] = await Promise.all([
    timedCheck(async (signal) => {
      if (missingEnv) return { ok: false, reason: "env" };
      const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: anonKey },
        signal,
        cache: "no-store",
      });
      return res.ok ? { ok: true } : { ok: false, reason: `http_${res.status}` };
    }, PROBE_TIMEOUT_MS),
    timedCheck(async (signal) => {
      if (missingEnv) return { ok: false, reason: "env" };
      // Anon-executable by design; a real round trip through PostgREST and
      // the pooler to the database, at a constant (index-lookup) cost.
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${DB_PROBE_RPC}`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_id: NIL_UUID }),
        signal,
        cache: "no-store",
      });
      return res.ok ? { ok: true } : { ok: false, reason: `http_${res.status}` };
    }, PROBE_TIMEOUT_MS),
  ]);

  const report = summarizeHealth({
    auth,
    db,
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? null,
    region: process.env.VERCEL_REGION ?? null,
    now: new Date(),
  });

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
