"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import {
  WORK_OBJECT_ADDRESS_MAX,
  WORK_OBJECT_CITY_MAX,
  WORK_OBJECT_NAME_MAX,
  WORK_OBJECT_NAME_MIN,
  WORK_OBJECT_REGION_MAX,
  isObjectMigrationMissingCode,
} from "@/lib/objects/objects-model";

/**
 * Work-object write actions — thin wrappers around the four gated SECURITY
 * DEFINER RPCs from 20260817150000_work_objects_v1. Every permission check
 * happens server-side inside the RPCs (managing membership roles via
 * has_org_demand_access — never the legacy single-owner pattern). The
 * organization is resolved server-side from the active workspace; a
 * client-supplied org id is never trusted.
 *
 * Until the LEAD applies the migration the RPCs are missing and each action
 * reports `needs-migration` honestly.
 */

export type WorkObjectActionState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "archived" }
  | { status: "restored" }
  | { status: "needs-migration" }
  | { status: "not-authorized" }
  | { status: "invalid" }
  | { status: "error" };

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COORD_RX = /^-?\d{1,3}(\.\d{1,8})?$/;

function stateForRpc(
  error: { code?: string } | null,
  outcome: string,
  ok: WorkObjectActionState,
): WorkObjectActionState {
  if (error) {
    if (isObjectMigrationMissingCode(error.code)) {
      return { status: "needs-migration" };
    }
    if (error.code === "42501") return { status: "not-authorized" };
    console.error("[work-objects] rpc failed:", error.code);
    return { status: "error" };
  }
  if (outcome === "created" || outcome === "updated") return ok;
  if (outcome === "not_allowed") return { status: "not-authorized" };
  if (outcome === "not_found") return { status: "invalid" };
  if (outcome === "limit_reached") return { status: "invalid" };
  return { status: "invalid" };
}

function revalidate(): void {
  revalidatePath("/", "layout");
}

/** Create (no id field) or update (id present) one object through the
 *  gated RPCs. */
export async function saveWorkObjectAction(
  _prev: WorkObjectActionState,
  formData: FormData,
): Promise<WorkObjectActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  const region = String(formData.get("region") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const addressLine = String(formData.get("addressLine") ?? "").trim();
  const latRaw = String(formData.get("latitude") ?? "").trim();
  const lngRaw = String(formData.get("longitude") ?? "").trim();

  if (
    name.length < WORK_OBJECT_NAME_MIN ||
    name.length > WORK_OBJECT_NAME_MAX ||
    (id && !UUID_RX.test(id)) ||
    (projectId && !UUID_RX.test(projectId)) ||
    (country && !/^[A-Z]{2}$/.test(country)) ||
    region.length > WORK_OBJECT_REGION_MAX ||
    city.length > WORK_OBJECT_CITY_MAX ||
    addressLine.length > WORK_OBJECT_ADDRESS_MAX ||
    (latRaw !== "") !== (lngRaw !== "") ||
    (latRaw && !COORD_RX.test(latRaw)) ||
    (lngRaw && !COORD_RX.test(lngRaw))
  ) {
    return { status: "invalid" };
  }
  const latitude = latRaw ? Number(latRaw) : null;
  const longitude = lngRaw ? Number(lngRaw) : null;
  if (
    (latitude !== null && (latitude < -90 || latitude > 90)) ||
    (longitude !== null && (longitude < -180 || longitude > 180))
  ) {
    return { status: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authorized" };

  if (id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "update_work_object_v1",
      {
        p_object_id: id,
        p_name: name,
        p_project_id: projectId || null,
        p_country: country || null,
        p_region: region || null,
        p_city: city || null,
        p_address_line: addressLine || null,
        p_latitude: latitude,
        p_longitude: longitude,
      },
    );
    const state = stateForRpc(error, String(data ?? ""), { status: "saved" });
    if (state.status === "saved") revalidate();
    return state;
  }

  // Create: the org comes from the ACTIVE workspace, resolved server-side.
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") return { status: "not-authorized" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("create_work_object_v1", {
    p_organization_id: ctx.organizationId,
    p_name: name,
    p_project_id: projectId || null,
    p_country: country || null,
    p_region: region || null,
    p_city: city || null,
    p_address_line: addressLine || null,
    p_latitude: latitude,
    p_longitude: longitude,
  });
  const state = stateForRpc(error, String(data ?? ""), { status: "saved" });
  if (state.status === "saved") revalidate();
  return state;
}

async function setStatus(
  formData: FormData,
  status: "active" | "archived",
  ok: WorkObjectActionState,
): Promise<WorkObjectActionState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!UUID_RX.test(id)) return { status: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authorized" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "set_work_object_status_v1",
    { p_object_id: id, p_status: status },
  );
  const state = stateForRpc(error, String(data ?? ""), ok);
  if (state.status === ok.status) revalidate();
  return state;
}

/** Archive one object (terminal user action — no hard delete exists). */
export async function archiveWorkObjectAction(
  _prev: WorkObjectActionState,
  formData: FormData,
): Promise<WorkObjectActionState> {
  return setStatus(formData, "archived", { status: "archived" });
}

/** Restore an archived object to active. */
export async function restoreWorkObjectAction(
  _prev: WorkObjectActionState,
  formData: FormData,
): Promise<WorkObjectActionState> {
  return setStatus(formData, "active", { status: "restored" });
}

/** Point one object at its responsible person (empty = clear). */
export async function setWorkObjectResponsibleAction(
  _prev: WorkObjectActionState,
  formData: FormData,
): Promise<WorkObjectActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();
  if (!UUID_RX.test(id) || (profileId && !UUID_RX.test(profileId))) {
    return { status: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authorized" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "set_work_object_responsible_v1",
    { p_object_id: id, p_profile_id: profileId || null },
  );
  const state = stateForRpc(error, String(data ?? ""), { status: "saved" });
  if (state.status === "saved") revalidate();
  return state;
}
