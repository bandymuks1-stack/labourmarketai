"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Company location write actions (F12.4/5) — thin wrappers around the
 * owner-gated RPCs from draft migration 20260713120000_company_locations_v1.
 * All permission checks happen server-side inside the RPCs (company owner
 * only). Until the migration is applied the RPC is missing and the action
 * reports `needs-migration` honestly.
 */

export type CompanyLocationActionState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "removed" }
  | { status: "needs-migration" }
  | { status: "invalid" }
  | { status: "error" };

const KINDS = new Set(["headquarters", "operating", "desired_market"]);

export async function saveCompanyLocationAction(
  _prev: CompanyLocationActionState,
  formData: FormData,
): Promise<CompanyLocationActionState> {
  const kind = String(formData.get("kind") ?? "");
  const country = String(formData.get("country") ?? "").toUpperCase();
  const region = String(formData.get("region") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!KINDS.has(kind) || !/^[A-Z]{2}$/.test(country)) {
    return { status: "invalid" };
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("save_company_location_v1", {
    p_kind: kind,
    p_country: country,
    p_region: region || null,
    p_city: city || null,
    p_label: label || null,
  });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") {
      return { status: "needs-migration" };
    }
    console.error("[company-locations] save failed:", error.code);
    return { status: "error" };
  }
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "saved" };
}

export async function removeCompanyLocationAction(
  _prev: CompanyLocationActionState,
  formData: FormData,
): Promise<CompanyLocationActionState> {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("remove_company_location_v1", {
    p_id: id,
  });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") {
      return { status: "needs-migration" };
    }
    console.error("[company-locations] remove failed:", error.code);
    return { status: "error" };
  }
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "removed" };
}
