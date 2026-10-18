import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import {
  buildVacancyFreshness,
  summarizeHealth,
  timedCheck,
} from "@/lib/ops/health-model";
import { deployEnvFromEnv } from "@/lib/telemetry/production-host";

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

/**
 * The FRESHNESS read (2026-09-23) is a SEPARATE probe from the db probe, and
 * it is informational: it never feeds `ok`. `count_public_vacancies_v1` is
 * anon-executable by design and, since migration 20260903100000 (applied),
 * reads ONE maintained row (`public_vacancy_supply_counts`, refreshed every
 * 10 minutes by pg_cron) — so the cost objection that moved the db probe off
 * it no longer applies to it. Its `last_refreshed_at` is max(last_seen_at)
 * over the live supply: the last time the importer confirmed an ad, i.e. the
 * last successful ingestion touch, without any grant on the cursor table.
 */
const FRESHNESS_RPC = "count_public_vacancies_v1";

export async function GET(): Promise<NextResponse> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missingEnv = !supabaseUrl || !anonKey;
  let lastRefreshedAt: string | null = null;

  const [auth, db, freshness] = await Promise.all([
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
    timedCheck(async (signal) => {
      if (missingEnv) return { ok: false, reason: "env" };
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${FRESHNESS_RPC}`, {
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
      if (!res.ok) return { ok: false, reason: `http_${res.status}` };
      // PostgREST returns a `returns table` function as an array of rows.
      const body = (await res.json()) as unknown;
      const row = Array.isArray(body) ? body[0] : body;
      const value =
        row && typeof row === "object"
          ? (row as { last_refreshed_at?: unknown }).last_refreshed_at
          : null;
      lastRefreshedAt = typeof value === "string" ? value : null;
      return { ok: true };
    }, PROBE_TIMEOUT_MS),
  ]);

  const now = new Date();
  const report = summarizeHealth({
    auth,
    db,
    vacancyFreshness: buildVacancyFreshness({
      probe: freshness,
      lastRefreshedAt,
      now,
    }),
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? null,
    region: process.env.VERCEL_REGION ?? null,
    // Bounded word for VERCEL_ENV — `unset` makes a missing variable visible
    // to the monitor (the outbound host policy's env evidence fails open).
    deployEnv: deployEnvFromEnv(),
    now,
  });

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
