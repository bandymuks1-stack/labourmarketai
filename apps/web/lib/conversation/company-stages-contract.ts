import type { StageStatus } from "@/lib/projects/stages-model";

/**
 * PROJECT → PROGRESS in the chat (owner contract 2026-09-04 §11): the
 * company's project STAGES, flat, so a sentence like "etapas pamatai
 * baigtas" can be resolved to the one stage it names. Types + constants only.
 */

/** How many of the company's projects the stage read looks at. */
export const COMPANY_STAGES_PROJECT_SCAN_LIMIT = 10;

export interface CompanyChatStage {
  readonly stageId: string;
  readonly name: string;
  readonly status: StageStatus;
  readonly projectId: string;
  readonly projectTitle: string;
}

export type CompanyStagesChatResult =
  | { readonly kind: "ok"; readonly stages: readonly CompanyChatStage[] }
  | { readonly kind: "no-company" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };
