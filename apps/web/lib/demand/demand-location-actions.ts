"use server";

/**
 * Thin server-action wrapper around the demand-location capture (the client
 * `DemandLocationCapture` imports THIS so Next.js wires the action correctly).
 * The raw helper lives in `./demand-location.ts`. Signal-only: it can never
 * write coordinates, never 'verified', never 'coordinates' precision.
 */
import "server-only";
import { revalidatePath } from "next/cache";
import {
  addDemandLocation as _addDemandLocation,
  type AddDemandLocationInput,
  type AddDemandLocationResult,
} from "./demand-location";

export async function addDemandLocationAction(
  input: AddDemandLocationInput,
): Promise<AddDemandLocationResult> {
  const result = await _addDemandLocation(input);
  if (result.kind === "ok") revalidatePath("/", "layout");
  return result;
}
