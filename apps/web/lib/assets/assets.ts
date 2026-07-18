import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { listManagedProjects } from "@/lib/projects/projects";
import {
  isAssetCondition,
  isAssetType,
  type AssetAssignment,
  type AssetRow,
  type AssetsOverview,
  type AssetType,
  type AssignmentStatus,
  type MyAssignedAssets,
  type OrgOption,
  type ProjectOption,
  type WorkerOption,
} from "@/lib/assets/assets-model";

/**
 * Assets & Logistics read models (Wagon 9). Organization-scoped by RLS: a
 * manager reads their org's assets + assignments; an assigned worker reads
 * their own. Honest degradation: a missing relation returns { applied: false }.
 * Reuses canonical projects (listManagedProjects) + the workers/company spine —
 * no duplication of project/org/worker entities.
 */

export * from "@/lib/assets/assets-model";

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}
function migMissing(code?: string): boolean {
  return code === RELATION_NOT_FOUND || code === UNDEFINED_COLUMN;
}

type AssignRow = {
  id: string;
  asset_id: string;
  status: string;
  condition_at_issue: string;
  condition_at_return: string | null;
  project_id: string | null;
  worker_id: string | null;
  projects?: { title: string | null } | null;
  workers?: { display_name: string | null } | null;
};

function toAssignment(r: AssignRow): AssetAssignment {
  return {
    id: r.id,
    status: (r.status as AssignmentStatus) ?? "issued",
    conditionAtIssue: isAssetCondition(r.condition_at_issue) ? r.condition_at_issue : "unknown",
    conditionAtReturn: isAssetCondition(r.condition_at_return) ? r.condition_at_return : null,
    projectId: r.project_id,
    projectTitle: r.projects?.title ?? null,
    workerId: r.worker_id,
    workerName: r.workers?.display_name ?? null,
  };
}

export async function getAssetsOverview(): Promise<AssetsOverview> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const assetsRes = await asAny(supabase)
    .from("assets")
    .select("id, organization_id, asset_type, name, serial_or_reg, condition, availability")
    .order("created_at", { ascending: false })
    .limit(500);
  if (assetsRes.error) {
    if (migMissing(assetsRes.error.code)) return { applied: false };
    return { applied: true, orgs: [], assets: [], projects: [], workers: [] };
  }

  // Active assignments for the visible assets.
  const assignRes = await asAny(supabase)
    .from("asset_assignments")
    .select("id, asset_id, status, condition_at_issue, condition_at_return, project_id, worker_id, projects(title), workers(display_name)")
    .in("status", ["issued", "acknowledged"])
    .limit(1000);
  const activeByAsset = new Map<string, AssetAssignment>();
  if (!assignRes.error) {
    for (const r of (assignRes.data ?? []) as AssignRow[]) {
      if (!activeByAsset.has(r.asset_id)) activeByAsset.set(r.asset_id, toAssignment(r));
    }
  }

  type ARow = {
    id: string;
    organization_id: string;
    asset_type: string;
    name: string;
    serial_or_reg: string | null;
    condition: string;
    availability: string;
  };
  const assets: AssetRow[] = ((assetsRes.data ?? []) as ARow[])
    .filter((r) => isAssetType(r.asset_type))
    .map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      assetType: r.asset_type as AssetRow["assetType"],
      name: r.name,
      serialOrReg: r.serial_or_reg,
      condition: isAssetCondition(r.condition) ? r.condition : "unknown",
      availability: (["available", "assigned", "maintenance", "retired"].includes(r.availability)
        ? r.availability
        : "available") as AssetRow["availability"],
      activeAssignment: activeByAsset.get(r.id) ?? null,
    }));

  // Orgs the caller manages (for the create form).
  const orgRes = await asAny(supabase)
    .from("engagement_contexts")
    .select("organization_id, organizations(display_name)")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", ["manager", "owner", "external_manager"]);
  const orgs: OrgOption[] = [];
  const seenOrg = new Set<string>();
  if (!orgRes.error) {
    for (const r of (orgRes.data ?? []) as { organization_id: string; organizations?: { display_name: string | null } | null }[]) {
      if (r.organization_id && !seenOrg.has(r.organization_id)) {
        seenOrg.add(r.organization_id);
        orgs.push({ id: r.organization_id, name: r.organizations?.display_name ?? r.organization_id });
      }
    }
  }

  const projects: ProjectOption[] = (await listManagedProjects()).map((p) => ({ id: p.id, title: p.title ?? "" }));

  // Workers for issuing — the caller's active company workers.
  const workerRes = await asAny(supabase)
    .from("company_workers")
    .select("worker_id, status, workers(id, display_name)")
    .eq("status", "active")
    .limit(500);
  const workers: WorkerOption[] = [];
  const seenW = new Set<string>();
  if (!workerRes.error) {
    for (const r of (workerRes.data ?? []) as { worker_id: string; workers?: { id: string; display_name: string | null } | null }[]) {
      if (r.worker_id && !seenW.has(r.worker_id)) {
        seenW.add(r.worker_id);
        workers.push({ id: r.worker_id, name: r.workers?.display_name ?? r.worker_id });
      }
    }
  }

  return { applied: true, orgs, assets, projects, workers };
}

export interface ProjectAssetLine {
  readonly assignmentId: string;
  readonly assetName: string;
  readonly assetType: AssetType;
  readonly status: AssignmentStatus;
  readonly workerName: string | null;
}
export type ProjectAssetsData =
  | { applied: false }
  | { applied: true; assets: ProjectAssetLine[] };

/** Assets with an active assignment to a specific project (project workspace). */
export async function getProjectAssets(projectId: string): Promise<ProjectAssetsData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const res = await asAny(supabase)
    .from("asset_assignments")
    .select("id, status, worker_id, assets(name, asset_type), workers(display_name)")
    .eq("project_id", projectId)
    .in("status", ["issued", "acknowledged"])
    .limit(200);
  if (res.error) {
    if (migMissing(res.error.code)) return { applied: false };
    return { applied: true, assets: [] };
  }
  const assets: ProjectAssetLine[] = ((res.data ?? []) as (AssignRow & { assets?: { name: string; asset_type: string } | null })[])
    .filter((r) => isAssetType(r.assets?.asset_type ?? ""))
    .map((r) => ({
      assignmentId: r.id,
      assetName: r.assets?.name ?? "",
      assetType: (r.assets?.asset_type ?? "tool") as AssetType,
      status: (r.status as AssignmentStatus) ?? "issued",
      workerName: r.workers?.display_name ?? null,
    }));
  return { applied: true, assets };
}

/** Assets currently assigned to the signed-in worker (issued/acknowledged). */
export async function getMyAssignedAssets(): Promise<MyAssignedAssets> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { applied: true, assignments: [] };

  const res = await asAny(supabase)
    .from("asset_assignments")
    .select("id, asset_id, status, condition_at_issue, condition_at_return, project_id, worker_id, projects(title), workers(display_name), assets(name, asset_type)")
    .eq("worker_id", worker.id)
    .in("status", ["issued", "acknowledged"])
    .limit(200);
  if (res.error) {
    if (migMissing(res.error.code)) return { applied: false };
    return { applied: true, assignments: [] };
  }
  const assignments = ((res.data ?? []) as (AssignRow & { assets?: { name: string; asset_type: string } | null })[])
    .filter((r) => isAssetType(r.assets?.asset_type ?? ""))
    .map((r) => ({
      ...toAssignment(r),
      assetName: r.assets?.name ?? "",
      assetType: (r.assets?.asset_type ?? "tool") as AssetType,
    }));
  return { applied: true, assignments };
}
