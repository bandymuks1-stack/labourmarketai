"use server";

import { validateHomePins, type HomePinContext } from "@/lib/home/home-pins";
import { writeHomePins, type HomePinsWrite } from "@/lib/home/home-pins-server";

/**
 * Save the person's home pins. The caller is whoever the session says; the
 * row is theirs by row-level security (own row only). Ids are validated against
 * the areas this home offers — a payload naming anything else is refused, so
 * a pin can never point outside what the person already reaches.
 */
export async function saveHomePinsAction(
  context: unknown,
  pins: unknown,
): Promise<HomePinsWrite> {
  if (context !== "person" && context !== "company") return "failed";
  const valid = validateHomePins(pins, context as HomePinContext);
  if (!valid) return "failed";
  return writeHomePins(context, valid);
}
