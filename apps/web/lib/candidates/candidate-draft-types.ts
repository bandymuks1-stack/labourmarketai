/**
 * Candidate / provider draft shared types (slice candidate-provider-draft-v1).
 * Server-free so the client form, the server actions, and the read service all
 * share one definition. A draft is the creator's private working note about an
 * unregistered person/provider — never an account, acceptance, or verification.
 */

export type CandidateDraftStatus = "draft" | "contacted" | "shortlisted" | "archived";

export const CANDIDATE_DRAFT_STATUSES: readonly CandidateDraftStatus[] = [
  "draft",
  "contacted",
  "shortlisted",
  "archived",
] as const;

export interface CandidateDraft {
  id: string;
  nameOrTitle: string;
  contact: string | null;
  professionService: string | null;
  language: string | null;
  skillsText: string | null;
  notes: string | null;
  status: CandidateDraftStatus;
  projectId: string | null;
  /** Set only when an operator links the draft to a real, registered profile. */
  linkedProfileId: string | null;
  createdAt: string;
}

/** Editable fields accepted from the create/update form (all optional so a
 *  partial update — e.g. status only — is valid; create validates nameOrTitle
 *  at runtime). */
export interface CandidateDraftInput {
  nameOrTitle?: string;
  contact?: string;
  professionService?: string;
  language?: string;
  skillsText?: string;
  notes?: string;
  status?: string;
  projectId?: string;
}
