"use server";

/**
 * Thin server-action wrappers around pilot-drafts. Client components
 * import THIS file (so Next.js wires the actions correctly); server
 * components import the raw helpers from `./pilot-drafts.ts`.
 */
import "server-only";
import {
  savePilotDraft as _savePilotDraft,
  deletePilotDraft as _deletePilotDraft,
  type DraftType,
  type PilotDraftRow,
} from "./pilot-drafts";

export async function savePilotDraftAction(
  type: DraftType,
  payload: unknown,
): Promise<PilotDraftRow | null> {
  return _savePilotDraft(type, payload);
}

export async function deletePilotDraftAction(type: DraftType): Promise<void> {
  return _deletePilotDraft(type);
}
