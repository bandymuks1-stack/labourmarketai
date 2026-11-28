import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { runTimesheetSchedules } from "@/lib/timesheets/timesheet-schedule-runner";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok")
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  try {
    const result = await runTimesheetSchedules();
    if (result) return NextResponse.json({ ok: true, ...result });
  } catch {
    /* Counts-only response: never log private report contents or identities. */
  }
  return NextResponse.json(
    { ok: false, reason: "unavailable" },
    { status: 503 },
  );
}
