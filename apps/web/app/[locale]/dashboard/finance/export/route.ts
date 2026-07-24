import { NextResponse } from "next/server";

import {
  buildFinanceCsv,
  financeCsvFilename,
} from "@/lib/finance/finance-model";
import { listMyFinanceRecords } from "@/lib/finance/finance";

/**
 * GET — download the caller's OWN operational finance records as CSV
 * (control room PR I; mirrors the journal-export route pattern). Every read
 * is the SAME bounded, RLS-scoped read the finance page uses (creator /
 * admin / company owner rows only) — no service role, no other rows, and
 * the derived overdue column uses the same pure derivation the page shows.
 * While the owner-gated I2 migration is unapplied the export answers 503
 * honestly instead of fabricating an empty file.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await listMyFinanceRecords();

  if (result.status === "not-authed") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (result.status === "needs-migration") {
    return NextResponse.json({ error: "needs_migration" }, { status: 503 });
  }

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(buildFinanceCsv(result.records, new Date()), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${financeCsvFilename(day)}"`,
      "Cache-Control": "no-store",
    },
  });
}
