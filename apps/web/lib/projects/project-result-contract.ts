/**
 * W11 — the `project` result contract. PURE (no `server-only`, no IO).
 *
 * Same idiom as `find-work-contract.ts` and `employer-workspace-contract.ts`: a
 * `"use server"` module may only export async functions, so the shapes live
 * here and are importable from the server adapter, the renderer and the tests.
 *
 * NOTHING HERE LOADS OR DECIDES ANYTHING. The canonical project domain keeps
 * owning all of it:
 *
 *   projects + assignments   →  lib/projects/projects.ts
 *   stages                   →  lib/projects/stages.ts
 *   lifecycle rules          →  lib/projects/project-lifecycle-model.ts
 *   authority                →  can_manage_project (SQL), via the RPC
 *
 * ONLY REAL FIELDS. There is deliberately no progress percentage, no completion
 * estimate, no AI status and no worker score in this contract — not "not yet
 * populated" but ABSENT, so no renderer can accidentally show one. The project
 * domain stores no such number (`20260718140000_project_operations_stages.sql`
 * explicitly refuses a progress column), and a shape that cannot carry a
 * fabricated figure cannot leak one.
 */

import type { ProjectStatus } from "@/lib/projects/project-lifecycle-model";

/** How many projects the panel lists before deferring to the full screen. */
export const PROJECT_RESULT_LIMIT = 6;
/** How many assigned people the panel shows before summarising the rest. */
export const PROJECT_ASSIGNMENT_LIMIT = 8;
/** How many stages the panel shows. The full Gantt stays on the operations screen. */
export const PROJECT_STAGE_LIMIT = 6;

/** One project in the picker. */
export interface ProjectListRow {
  readonly projectId: string;
  readonly title: string;
  /** Canonical status, or null on a legacy row whose status is unreadable.
   *  Null is rendered as "unknown", never silently as `draft`. */
  readonly status: ProjectStatus | null;
  readonly city: string | null;
  /** Which organization the project belongs to. Null on a legacy row. */
  readonly orgName: string | null;
}

export type ProjectListResult =
  | { readonly kind: "projects"; readonly projects: readonly ProjectListRow[] }
  | { readonly kind: "empty" }
  | { readonly kind: "no-company-context" }
  | { readonly kind: "blocked" };

/** One assigned person, as the employer surface may see them. */
export interface ProjectAssignmentRow {
  readonly workerProfileId: string;
  /** The display name the existing canonical reader already returns for a
   *  worker on the caller's OWN project roster. This is not the anonymized
   *  scouting view: assignment means the employer already knows who this is. */
  readonly name: string;
  readonly assignedAt: string;
}

/** One stage, projected from the canonical stage row. No derived percentage. */
export interface ProjectStageRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly actualStart: string | null;
  readonly actualEnd: string | null;
}

/** The panel's view of ONE project. */
export interface ProjectDetail {
  readonly projectId: string;
  readonly title: string;
  readonly status: ProjectStatus | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly orgName: string | null;
  /** Real dates from the row, or null. The project row has no write path for
   *  these yet (documented gap), so null is the honest and common case. */
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly assignments: readonly ProjectAssignmentRow[];
  readonly assignmentTotal: number;
  /**
   * Stages, or `null` when the owner-gated stage migration is unapplied in this
   * environment. `null` and `[]` are DIFFERENT facts — "we cannot read stages
   * here" is not "this project has no stages" — and the panel says so.
   */
  readonly stages: readonly ProjectStageRow[] | null;
  /** Whether the viewer may run lifecycle writes. Server-derived from the same
   *  authority the RPC enforces; the client never decides this. */
  readonly canManage: boolean;
}

export type ProjectDetailResult =
  | { readonly kind: "project"; readonly project: ProjectDetail }
  | { readonly kind: "not-found" }
  | { readonly kind: "no-company-context" }
  | { readonly kind: "blocked" };

/** What a lifecycle write answers. Mirrors the RPC's tagged outcome exactly —
 *  no raw SQL text, ever. */
export type ProjectLifecycleResult =
  | {
      readonly kind: "transitioned";
      readonly fromStatus: ProjectStatus;
      readonly toStatus: ProjectStatus;
      /** How many active assignments the completion really ended. 0 for every
       *  non-completing transition, and 0 for a completion with an empty
       *  roster — a real count from the server, never an estimate. */
      readonly assignmentsEnded: number;
    }
  | { readonly kind: "already_in_state"; readonly status: ProjectStatus }
  | { readonly kind: "invalid_transition" }
  | { readonly kind: "not_authorized" }
  | { readonly kind: "not_found" }
  | { readonly kind: "conflict" }
  | { readonly kind: "needs_migration" }
  | { readonly kind: "error" };
