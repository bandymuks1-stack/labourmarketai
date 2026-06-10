"use server";

/**
 * Thin server-action wrappers around demand-drafts. Client components
 * import THIS file (so Next.js wires the actions correctly); server
 * components import the raw helpers from `./demand-drafts.ts`.
 */
import "server-only";
import {
  saveDemandDraft as _saveDemandDraft,
  deleteDemandDraft as _deleteDemandDraft,
  type DraftType,
  type DemandDraftRow,
} from "./demand-drafts";

export async function saveDemandDraftAction(
  type: DraftType,
  payload: unknown,
): Promise<DemandDraftRow | null> {
  return _saveDemandDraft(type, payload);
}

export async function deleteDemandDraftAction(type: DraftType): Promise<void> {
  return _deleteDemandDraft(type);
}
