import { NextResponse } from "next/server";

import { getDashboardSearchGroups } from "@/lib/search/dashboard-search";
import { normalizeSearchQuery } from "@/lib/search/dashboard-search-model";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard-search?q=… — the universal finder's object search
 * (control room PR K, capability gap map §11).
 *
 * Security:
 *   - requires an authenticated session (401 otherwise);
 *   - every read runs with the CALLER's RLS-scoped client through the same
 *     read helpers the pages use (lib/search/dashboard-search.ts) — never the
 *     admin client, never another user's rows;
 *   - the query is length-bounded and normalized (min 2 / max 80 chars);
 *   - results are bounded (max 5 per source, 30 total) and carry only the
 *     caller's OWN row labels + exact existing destinations;
 *   - responses are never cached (no-store) — they are per-caller data.
 *
 * NO people search: finding people stays the deterministic scouting flow.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, code: "unauthorized" },
      { status: 401 },
    );
  }

  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const nq = normalizeSearchQuery(raw);
  if (nq === null) {
    return NextResponse.json(
      { ok: false, code: "query-too-short" },
      { status: 400 },
    );
  }

  const groups = await getDashboardSearchGroups(nq);
  return NextResponse.json(
    { ok: true, groups },
    { headers: { "Cache-Control": "no-store" } },
  );
}
