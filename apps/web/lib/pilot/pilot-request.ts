/**
 * Pilot-request submission — the dashboard "Request a pilot" CTA, landing on the
 * CANONICAL demand intake `customer_requests` (Phase 3 / Slice 3.1). An
 * authenticated company / agency owner expressing a real need is structured
 * demand, so it writes the one canonical model (status='submitted', classified
 * by `kind`) via the owner-scoped `submit_demand_request` RPC — NOT `/api/leads`.
 *
 * `leads` stays a DISTINCT anonymous pre-auth funnel (§17.2); it is intentionally
 * not the destination for an authenticated structured need. There is exactly one
 * demand model underneath: this submit path and the draft form (save_demand_draft)
 * both write `customer_requests`.
 *
 * Returns a tagged result (never throws across the server-action boundary —
 * Next.js 15 strips thrown Error messages in prod), so the client renders an
 * honest done / error state.
 */
import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PilotIntent = "hire_workers" | "partner";

export type PilotRequestResult =
  | { ok: true; requestId: string | null }
  | { ok: false; code: "unauthenticated" | "save_failed" };

// hire_workers → a company expressing demand; partner → an agency expressing an
// offer. (The buyer/customer's structured need has its own buyer_request draft
// form; the lightweight pilot CTA defaults a company_request.)
const INTENT_KIND: Record<PilotIntent, "company_request" | "agency_offer"> = {
  hire_workers: "company_request",
  partner: "agency_offer",
};

// submit_demand_request + the new demand columns are not in the generated
// `Database` type until `pnpm db:types` runs post-apply — cast at the boundary,
// same pattern lib/pilot/pilot-drafts.ts uses for the (folded) draft path.
type DemandRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Submit the signed-in owner's pilot request onto the canonical intake. */
export async function submitPilotRequest(
  intent: PilotIntent,
): Promise<PilotRequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const kind = INTENT_KIND[intent];
  const title =
    intent === "partner"
      ? "Agency partnership — offer"
      : "Hiring workers — demand";

  const { data, error } = await (supabase as unknown as DemandRpc).rpc(
    "submit_demand_request",
    {
      p_kind: kind,
      p_title: title,
      // LT need-summary (p_original_language is "lt") — intent-specific so the
      // saved request never shows an English fallback on the LT UI, and a
      // company hiring request reads as hiring, not a generic buyer "need".
      p_need_summary:
        intent === "partner"
          ? "Kandidatų ar paslaugų pasiūla, pateikta iš skydelio."
          : "Darbuotojų ar komandos paieška, pateikta iš skydelio.",
      p_payload: { source: "dashboard_demand", intent },
      p_original_language: "lt",
    },
  );

  if (error) {
    console.error("[pilot-request] submit failed:", error.message);
    return { ok: false, code: "save_failed" };
  }

  revalidatePath("/", "layout");
  return { ok: true, requestId: typeof data === "string" ? data : null };
}
