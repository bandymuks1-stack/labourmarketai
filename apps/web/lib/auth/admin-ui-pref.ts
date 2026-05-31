import "server-only";
import { cookies } from "next/headers";

/**
 * Admin-UI visibility preference (Fix D). A pure DISPLAY toggle: when an admin
 * chooses "work as a normal user", we hide admin-only badges/shortcuts from the
 * normal surfaces. It changes NOTHING about permissions — `isAdmin`, the
 * `is_admin()` RLS bypass, and the server-side admin route guards are all
 * untouched, and the admin routes stay reachable if opened directly.
 *
 * Stored as a plain, non-sensitive cookie (no auth/session change).
 */
export const ADMIN_UI_HIDDEN_COOKIE = "lm_hide_admin_ui";

export async function readAdminUiHidden(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_UI_HIDDEN_COOKIE)?.value === "1";
}
