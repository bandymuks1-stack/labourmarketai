import { NextResponse } from "next/server";

import {
  buildInstitutionReportCsv,
  institutionReportCsvFilename,
  type OutcomesForReport,
} from "@/lib/education/institution-report";
import { readInstitutionLearnerOutcomes } from "@/lib/education/institution-outcomes";
import { readInstitutionPrograms } from "@/lib/education/programs";
import { createClient } from "@/lib/supabase/server";

/**
 * GET — download an institution's OWN programme + outcome report as CSV.
 * Closes the export half of `J-INSTITUTION-OUTCOME`'s last link: the demand
 * per programme and the learner outcomes were both readable on
 * `/dashboard/company` and could be taken nowhere.
 *
 * AUTHORIZATION IS BORROWED, NEVER RE-IMPLEMENTED. The organisation id
 * arrives in the query string, so it is caller-supplied and is treated as a
 * claim. The learner-outcomes aggregate is the canonical gate for this
 * surface — its SQL function admits only a MANAGER of an organisation that
 * holds `training_provider`, and answers 42501 to everyone else — so this
 * route runs that read FIRST, through its single permitted caller
 * (`lib/education/institution-outcomes.ts`, which is where the function is
 * named), and refuses on anything but a usable answer. No
 * service role, no second authorisation rule to drift out of step, and no
 * membership check written here that could be laxer than the one on screen.
 *
 * If the gate itself is unreachable (the function not applied) the route
 * answers 503 rather than exporting under no gate at all: an unguarded file
 * is worse than a missing one.
 *
 * The programme half is then read with the SAME `readInstitutionPrograms`
 * the section renders, under the caller's own RLS.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<NextResponse> {
  const organizationId = new URL(request.url).searchParams.get("org") ?? "";
  if (!UUID.test(organizationId)) {
    return NextResponse.json({ error: "invalid_organization" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const outcomesRead = await readInstitutionLearnerOutcomes(organizationId);
  if (outcomesRead.status === "unavailable") {
    if (outcomesRead.reason === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // Not applied, or an error on the gate itself. Refuse — never export
    // without the boundary that decides who may read this.
    return NextResponse.json({ error: outcomesRead.reason }, { status: 503 });
  }

  const programsRead = await readInstitutionPrograms(organizationId);
  if (programsRead.status === "unavailable") {
    return NextResponse.json({ error: "programs_unavailable" }, { status: 503 });
  }

  const outcomes: OutcomesForReport = { status: "ok", outcomes: outcomesRead.outcomes };
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(buildInstitutionReportCsv(programsRead.programs, outcomes), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${institutionReportCsvFilename(day)}"`,
      "Cache-Control": "no-store",
    },
  });
}
