"use server";

/**
 * Server-action wrappers for Market Map capture. Client components import THESE
 * (so Next wires the actions); the owner-scoped logic lives in ./capture.ts.
 * On success we revalidate the dashboard layout so the market map's owner view
 * (getOwnMarketSignals) re-fetches and shows the new/updated signal.
 */
import "server-only";
import { revalidatePath } from "next/cache";
import {
  addPreferredLocation as _addPreferred,
  updatePreferredLocation as _updatePreferred,
  setPreferredLocationActive as _setPreferredActive,
  setLoginLocationConsent as _setLoginConsent,
  setDemandLocationActive as _setDemandActive,
  updateDemandLocation as _updateDemand,
  type PreferredLocationInput,
  type LoginConsentInput,
  type CaptureResult,
} from "./capture";

function revalidate(result: CaptureResult): CaptureResult {
  if (result.kind === "ok") revalidatePath("/", "layout");
  return result;
}

export async function addPreferredLocationAction(input: PreferredLocationInput): Promise<CaptureResult> {
  return revalidate(await _addPreferred(input));
}
export async function updatePreferredLocationAction(
  id: string,
  patch: Partial<PreferredLocationInput>,
): Promise<CaptureResult> {
  return revalidate(await _updatePreferred(id, patch));
}
export async function setPreferredLocationActiveAction(id: string, active: boolean): Promise<CaptureResult> {
  return revalidate(await _setPreferredActive(id, active));
}
export async function setLoginLocationConsentAction(input: LoginConsentInput): Promise<CaptureResult> {
  return revalidate(await _setLoginConsent(input));
}
export async function setDemandLocationActiveAction(id: string, active: boolean): Promise<CaptureResult> {
  return revalidate(await _setDemandActive(id, active));
}
export async function updateDemandLocationAction(
  id: string,
  patch: { needType?: string; visibilityLevel?: string },
): Promise<CaptureResult> {
  return revalidate(await _updateDemand(id, patch));
}
