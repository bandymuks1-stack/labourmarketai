/**
 * Education chat-workspace contract — the PURE half of
 * `education-workspace.ts` (owner contract 2026-09-04 §15). A `"use server"`
 * module may export only async functions, so the result shape and the
 * display cap live here (same split as `agency-workspace-contract.ts`).
 */
export const EDUCATION_CHAT_LIST_LIMIT = 6;

export interface EducationChatCohort {
  readonly id: string;
  readonly name: string;
  /** null = the caller may not see membership (not an internal decider) — unknown, never 0. */
  readonly memberCount: number | null;
}

export interface EducationChatProgramme {
  readonly id: string;
  readonly name: string;
  readonly demandCount: number | null;
  readonly cohorts: readonly EducationChatCohort[];
}

export interface EducationChatLearner {
  readonly profileId: string;
  readonly label: string;
}

export type EducationWorkspaceChatResult =
  | { readonly kind: "no-company" }
  | { readonly kind: "not-institution" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly programmes: readonly EducationChatProgramme[];
      readonly assignable: readonly EducationChatLearner[];
      /** false: membership is not available to this caller's role (J-12); assignable is then empty. */
      readonly membersVisible: boolean;
    };
