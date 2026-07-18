/**
 * Assets & Logistics — client-safe model (Wagon 9). Org-owned tools/equipment/
 * vehicles + an issue→acknowledge→transfer→return assignment lifecycle.
 */

export const ASSET_TYPES = ["tool", "equipment", "vehicle", "safety_equipment"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_CONDITIONS = ["new", "good", "fair", "poor", "damaged", "unknown"] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const ASSET_AVAILABILITY = ["available", "assigned", "maintenance", "retired"] as const;
export type AssetAvailability = (typeof ASSET_AVAILABILITY)[number];

export const ASSIGNMENT_STATUSES = ["issued", "acknowledged", "transferred", "returned"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export interface AssetAssignment {
  readonly id: string;
  readonly status: AssignmentStatus;
  readonly conditionAtIssue: AssetCondition;
  readonly conditionAtReturn: AssetCondition | null;
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  readonly workerId: string | null;
  readonly workerName: string | null;
}

export interface AssetRow {
  readonly id: string;
  readonly organizationId: string;
  readonly assetType: AssetType;
  readonly name: string;
  readonly serialOrReg: string | null;
  readonly condition: AssetCondition;
  readonly availability: AssetAvailability;
  readonly activeAssignment: AssetAssignment | null;
}

export interface OrgOption {
  readonly id: string;
  readonly name: string;
}
export interface ProjectOption {
  readonly id: string;
  readonly title: string;
}
export interface WorkerOption {
  readonly id: string;
  readonly name: string;
}

export type AssetsOverview =
  | { applied: false }
  | {
      applied: true;
      orgs: OrgOption[];
      assets: AssetRow[];
      projects: ProjectOption[];
      workers: WorkerOption[];
    };

export type MyAssignedAssets =
  | { applied: false }
  | { applied: true; assignments: (AssetAssignment & { assetName: string; assetType: AssetType })[] };

export function isAssetType(v: unknown): v is AssetType {
  return typeof v === "string" && (ASSET_TYPES as readonly string[]).includes(v);
}
export function isAssetCondition(v: unknown): v is AssetCondition {
  return typeof v === "string" && (ASSET_CONDITIONS as readonly string[]).includes(v);
}
