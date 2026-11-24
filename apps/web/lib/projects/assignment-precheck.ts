"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import { checkWorkerReservation } from "@/lib/planning/worker-reservation";
import { freeColleagues } from "@/lib/projects/free-colleagues";
import {
  runAssignmentPrecheck,
  type AssignmentPrecheckResult,
} from "@/lib/projects/assignment-precheck-core";

/**
 * READ-ONLY conflict pre-check for the assign form (see the core file for the
 * full honesty contract). Same authorization as `assignWorkerToProjectAction`
 * — a signed-in caller acting for the ACTIVE workspace's company — plus the
 * database's own `can_manage_project` read. It never writes, and it is
 * advisory: the final assign is not re-checked server-side against it.
 */
export async function checkAssignmentClashAction(input: {
  projectId: string;
  workerProfileId: string;
}): Promise<AssignmentPrecheckResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const company = await requireEmployerCompany();
    return await runAssignmentPrecheck(
      {
        supabase,
        userId: user?.id ?? null,
        hasCompany: company.ok,
        canOverride: company.ok && hasOrganizationCapability(company.role, "manage-projects"),
        checkReservation: (i) => checkWorkerReservation(i),
        freeColleagues,
      },
      input,
    );
  } catch (error) {
    console.error("[projects] assignment precheck failed:", error);
    return { ok: false, code: "error" };
  }
}
