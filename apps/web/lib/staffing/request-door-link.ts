import { REQUEST_DOORS, type RequestDoor } from "@/lib/staffing/request-doors";

/**
 * A LINK THAT OPENS ONE REQUEST FORM.
 *
 * The three request forms live in one block of the landing (`#request`) and
 * used to open only from the buttons inside it. A goal's action has to land
 * on the block AND open its form, so the form is named in the fragment:
 * `/#request=b2b`. The fragment is state of the landing itself — no new
 * route, nothing sent to the server.
 */
export const REQUEST_DOOR_FRAGMENT_PREFIX = "#request=";

/** Locale-less href of the landing with one request form opened. */
export function requestDoorHref(door: RequestDoor): string {
  return `/${REQUEST_DOOR_FRAGMENT_PREFIX}${door}`;
}

/** The form a fragment names, or null. */
export function requestDoorFromFragment(hash: string): RequestDoor | null {
  if (!hash.startsWith(REQUEST_DOOR_FRAGMENT_PREFIX)) return null;
  const door = hash.slice(REQUEST_DOOR_FRAGMENT_PREFIX.length);
  return (REQUEST_DOORS as readonly string[]).includes(door) ? (door as RequestDoor) : null;
}
