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
import {
  startDemandFromNeedText as _startDemandFromNeedText,
  type StartDemandFromNeedText,
} from "./demand-from-need-text";

export async function saveDemandDraftAction(
  type: DraftType,
  payload: unknown,
): Promise<DemandDraftRow | null> {
  return _saveDemandDraft(type, payload);
}

export async function deleteDemandDraftAction(type: DraftType): Promise<void> {
  return _deleteDemandDraft(type);
}

/**
 * Carry a recognised need into the canonical demand draft, so the employer does
 * not type it a second time. See `demand-from-need-text.ts` for why this is a
 * draft row and not a query parameter.
 */
export async function startDemandFromNeedTextAction(
  rawText: string,
  locale: string,
): Promise<StartDemandFromNeedText> {
  return _startDemandFromNeedText(rawText, locale);
}
