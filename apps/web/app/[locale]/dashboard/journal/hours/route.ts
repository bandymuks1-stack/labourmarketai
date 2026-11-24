import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { readMyEntryWorkTime } from "@/lib/timesheets/timesheets";
import {
  buildHoursCsv,
  hoursCsvFilename,
  hoursExportRange,
  isHoursExportPeriod,
  isIsoDay,
  summarizeHours,
  type HoursExportEntryContext,
} from "@/lib/journal/hours-export";
import { viewerWorkToday } from "@/lib/time/viewer-day";

/**
 * GET — download the caller's OWN work hours for one week, two weeks or one
 * calendar month as CSV (owner command 2026-09-28 §13).
 *
 * `?period=week|2weeks|month` (default `month`) and `?date=YYYY-MM-DD`, the
 * day whose period is exported (default: today, UTC — the journal
 * calendar's day arithmetic).
 *
 * A representation, not a ledger: the hours are `readMyEntryWorkTime` — the
 * SAME read and the SAME canonical rule the calendar's workload strip uses —
 * and nothing is stored. Every read is RLS-scoped as the signed-in worker;
 * no service role. A failed hours read is a 503, never a file of zeros.
 */
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const rawPeriod = params.get("period");
  const period = isHoursExportPeriod(rawPeriod) ? rawPeriod : "month";
  const rawDate = params.get("date");
  const anchor = isIsoDay(rawDate) ? rawDate : (await viewerWorkToday()).todayIso;
  const range = hoursExportRange(period, anchor);

  const read = await readMyEntryWorkTime();
  if (read.status !== "ok") {
    return NextResponse.json({ error: "hours_unavailable" }, { status: 503 });
  }

  // Names for provenance. The ids are the fact; a name that cannot be read
  // (RLS, a removed project) is left blank — never guessed.
  const inRange = read.entries.filter((e) => e.day >= range.start && e.day <= range.end);
  const ctxIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const e of inRange) {
    const ref = read.refs.get(e.entryId);
    if (ref?.engagementContextId) ctxIds.add(ref.engagementContextId);
    if (ref?.projectId) projectIds.add(ref.projectId);
  }
  const [ctxRes, projRes] = await Promise.all([
    ctxIds.size > 0
      ? asAny(supabase)
          .from("engagement_contexts")
          .select("id, title, organizations(display_name, legal_name)")
          .in("id", [...ctxIds])
      : { data: [] },
    projectIds.size > 0
      ? asAny(supabase).from("projects").select("id, title").in("id", [...projectIds])
      : { data: [] },
  ]);
  type CtxRow = {
    id: string;
    title: string | null;
    organizations: { display_name: string | null; legal_name: string | null } | null;
  };
  const ctxById = new Map<string, CtxRow>(
    ((ctxRes.data ?? []) as CtxRow[]).map((c) => [c.id, c]),
  );
  const projectTitleById = new Map<string, string | null>(
    ((projRes.data ?? []) as { id: string; title: string | null }[]).map((p) => [p.id, p.title]),
  );
  const contextByEntry = new Map<string, HoursExportEntryContext>();
  for (const e of inRange) {
    const ref = read.refs.get(e.entryId);
    const ctx = ref?.engagementContextId ? ctxById.get(ref.engagementContextId) : undefined;
    contextByEntry.set(e.entryId, {
      contextTitle: ctx?.title ?? null,
      organizationName: ctx?.organizations?.display_name ?? ctx?.organizations?.legal_name ?? null,
      projectTitle: ref?.projectId ? (projectTitleById.get(ref.projectId) ?? null) : null,
    });
  }

  const summary = summarizeHours(read.entries, range, contextByEntry);
  return new NextResponse(buildHoursCsv(summary), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${hoursCsvFilename(period, range.start, range.end)}"`,
      "Cache-Control": "no-store",
    },
  });
}
