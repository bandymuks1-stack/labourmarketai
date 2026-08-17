import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import {
  WORK_OBJECT_READ_LIMIT,
  isObjectMigrationMissingCode,
  isValidWorkObjectStatus,
  type WorkObject,
} from "@/lib/objects/objects-model";
import type { CompanyTerritorySourceRow } from "@/lib/market-map/spatial-entities";

/**
 * Work-object (site) read service — train D.
 *
 * Reads ONLY the new `work_objects` table (gated migration
 * 20260817150000_work_objects_v1) with the caller's RLS-scoped client.
 * RLS is member-visible through BOTH membership truths
 * (is_org_member_or_engaged_v1: active company_membership OR active
 * engagement_context) plus admins — NOT the legacy companies.profile_id
 * single-owner pattern (Train M verdict).
 *
 * Honest degradation: while the LEAD has not applied the migration the
 * reads see 42P01/PGRST205 and report `needs-migration`; the surfaces show
 * the calm "prepared, activation pending" state and nothing is faked.
 */

const SELECT_COLUMNS =
  "id, organization_id, project_id, name, country, region, city, address_line, latitude, longitude, responsible_profile_id, status, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type Row = {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  country: string | null;
  region: string | null;
  city: string | null;
  address_line: string | null;
  latitude: number | null;
  longitude: number | null;
  responsible_profile_id: string | null;
  status: string;
  created_at: string;
};

function toObject(r: Row): WorkObject | null {
  if (!isValidWorkObjectStatus(r.status)) return null;
  return {
    id: r.id,
    organizationId: r.organization_id,
    projectId: r.project_id ?? null,
    name: r.name,
    country: r.country ?? null,
    region: r.region ?? null,
    city: r.city ?? null,
    addressLine: r.address_line ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    responsibleProfileId: r.responsible_profile_id ?? null,
    status: r.status,
    createdAt: r.created_at,
  };
}

export type OrgWorkObjectsResult =
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly rows: readonly WorkObject[];
    }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "no-company" }
  | { readonly kind: "error" };

/**
 * The ACTIVE workspace organization's objects (employer surfaces). The org
 * is resolved server-side through the ONE employer context resolver — a
 * client-supplied org id is never trusted.
 */
export async function getOrgWorkObjects(): Promise<OrgWorkObjectsResult> {
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") return { kind: "no-company" };

  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("work_objects")
    .select(SELECT_COLUMNS)
    .eq("organization_id", ctx.organizationId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(WORK_OBJECT_READ_LIMIT);
  if (res.error) {
    if (isObjectMigrationMissingCode(res.error.code)) {
      return { kind: "needs-migration" };
    }
    console.error("[work-objects] org read failed:", res.error.code);
    return { kind: "error" };
  }
  const rows = ((res.data ?? []) as Row[])
    .map(toObject)
    .filter((o): o is WorkObject => o !== null);
  return { kind: "ok", organizationId: ctx.organizationId, rows };
}

export type VisibleObjectsResult =
  | { readonly kind: "ok"; readonly rows: readonly WorkObject[] }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

/**
 * ACTIVE objects visible to the caller across all their organizations —
 * RLS decides (member/engaged/admin). Feeds the task object picker and the
 * task-card object labels for workers and managers alike.
 */
export async function listVisibleActiveObjects(): Promise<VisibleObjectsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", rows: [] };

  const res = await asAny(supabase)
    .from("work_objects")
    .select(SELECT_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(WORK_OBJECT_READ_LIMIT);
  if (res.error) {
    if (isObjectMigrationMissingCode(res.error.code)) {
      return { kind: "needs-migration" };
    }
    return { kind: "error" };
  }
  const rows = ((res.data ?? []) as Row[])
    .map(toObject)
    .filter((o): o is WorkObject => o !== null);
  return { kind: "ok", rows };
}

export type CompanyTerritoryObjectsState = "ok" | "needs-migration" | "error";

/**
 * The market-map company layer source — REWIRED from the superseded
 * company_locations draft (Train M verdict) to work_objects. Every ACTIVE
 * object with a country becomes an "operating" territory row; objects
 * without a country are skipped (never faked onto a map). Coordinates are
 * OBJECT geography entered by managing roles — never worker coordinates.
 */
export async function getCompanyTerritoryFromObjects(): Promise<{
  state: CompanyTerritoryObjectsState;
  rows: CompanyTerritorySourceRow[];
}> {
  const read = await getOrgWorkObjects();
  if (read.kind === "needs-migration") {
    return { state: "needs-migration", rows: [] };
  }
  if (read.kind === "error") return { state: "error", rows: [] };
  if (read.kind === "no-company") return { state: "ok", rows: [] };
  const rows: CompanyTerritorySourceRow[] = read.rows
    .filter((o) => o.status === "active" && o.country !== null)
    .map((o) => ({
      id: o.id,
      kind: "operating" as const,
      country: o.country as string,
      region: o.region,
      city: o.city,
      label: o.name,
      latitude: o.latitude,
      longitude: o.longitude,
    }));
  return { state: "ok", rows };
}
