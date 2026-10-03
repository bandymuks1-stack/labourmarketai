import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { gateOpenNeeds } from "@/lib/billing/open-needs-gate";
import { openNeedsUsageView, type OpenNeedsUsageView } from "@/lib/billing/open-needs-usage";

/**
 * Server read for the pre-submit usage line: the SAME workspace resolution and
 * the SAME `gateOpenNeeds` call the submit path uses. Any failure degrades to
 * "show nothing" — the submit gate remains the authority.
 */
export async function readOpenNeedsUsage(): Promise<OpenNeedsUsageView> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { visible: false };
    const employer = await requireEmployerCompany();
    if (!employer.ok) return { visible: false };
    return openNeedsUsageView(await gateOpenNeeds(supabase, employer.organizationId, user.id));
  } catch {
    return { visible: false };
  }
}
