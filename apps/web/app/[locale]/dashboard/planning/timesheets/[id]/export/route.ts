import { NextResponse } from "next/server";

import {
  buildTimesheetCsv,
  timesheetCsvFilename,
} from "@/lib/timesheets/timesheets-model";
import { getTimesheetForExport } from "@/lib/timesheets/timesheets";

/**
 * GET — download ONE timesheet as CSV with REAL hours per line (functional
 * completion train V2; closes the 2026-08-17 audit's "exports carry no
 * hours"). Mirrors the finance/journal export route pattern: the read is
 * the SAME bounded, RLS-scoped read the timesheets section uses (the worker
 * themselves, the org's managers, or admin) — no service role, no other
 * rows. While the owner-gated timesheets migration is unapplied the export
 * answers 503 honestly instead of fabricating an empty file.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const result = await getTimesheetForExport(id);

  if (result.status === "not-authed") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (result.status === "needs-migration") {
    return NextResponse.json({ error: "needs_migration" }, { status: 503 });
  }
  if (result.status === "not-found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(buildTimesheetCsv(result.sheet), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${timesheetCsvFilename(result.sheet)}"`,
      "Cache-Control": "no-store",
    },
  });
}
