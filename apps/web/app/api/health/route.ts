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
      // Anon-executable by design (public job counts); a real round trip
      // through PostgREST and the pooler to the database.
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/count_public_vacancies_v1`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
        },
        body: "{}",
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
