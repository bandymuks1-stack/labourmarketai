import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getProjectOperations } from "@/lib/projects/operations";
import {
  buildOperationsCsv,
  operationsCsvFilename,
} from "@/lib/projects/operations-report";
import { type Role } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * Operational status report (CSV) for one project — Pilot Operations Launch v1.
 *
 * Scoped to the authenticated owner/manager only: it requires a manager role
 * AND that the project be readable under the caller's RLS (getProjectOperations
 * returns null otherwise). The CSV serialises ONLY rows already read under that
 * RLS — no private worker data outside the caller's project/company scope.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role = (profile?.active_role as Role) ?? "worker";
  if (!MANAGER_ROLES.has(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ops = await getProjectOperations(id);
  if (!ops) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const csv = buildOperationsCsv(ops);
  const filename = operationsCsvFilename(ops);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
