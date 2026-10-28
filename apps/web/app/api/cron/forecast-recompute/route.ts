import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { runRecomputePass } from "@/lib/forecast/forecast-scheduler-core";
import { createForecastStore } from "@/lib/forecast/forecast-store";

/**
 * FORECAST RECOMPUTE (Stage 7, owner order 2026-10-24) — one bounded pass
 * over the projects whose FORECAST is due under their organization's cadence
 * (weekly on Sundays · daily · hourly · live after a significant change,
 * debounced). Facts are never touched here: journal, hours, Living CV and
 * project state are written live by their own paths in every plan.
 *
 * Scheduled every 5 minutes by the VPS cron (ops/vps/labourmarket.cron →
 * lm-cron.sh forecast-recompute). At most 25 projects and 60 s of work per
 * pass; the rest waits for the next tick.
 *
 * AUTH: `authorizeCronRequest` — CRON_SECRET; refused 401 while unset.
 * Responses carry counts only — no ids, no names, no numbers of a project.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  try {
    const result = await runRecomputePass(createForecastStore(), {
      nowIso: new Date().toISOString(),
      clockMs: () => Date.now(),
    });
    if (result === null) {
      // Migration not applied / service env missing: honest 503, never "0 due".
      return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
