import { cookies } from "next/headers";

import { VIEWER_TZ_COOKIE, resolveWorkToday, type WorkToday } from "./local-day";

/**
 * Server-side "today" for the signed-in viewer — see `local-day.ts` for the
 * rule. Reads the zone the browser reported (`lm_tz`); never throws.
 */
export async function viewerWorkToday(now: Date = new Date()): Promise<WorkToday> {
  let tz: string | null = null;
  try {
    tz = (await cookies()).get(VIEWER_TZ_COOKIE)?.value ?? null;
  } catch {
    tz = null; // outside a request scope (scripts, tests)
  }
  return resolveWorkToday({ now, timeZone: tz });
}
