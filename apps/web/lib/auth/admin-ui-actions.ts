"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ADMIN_UI_HIDDEN_COOKIE } from "./admin-ui-pref";

/**
 * Set the admin-UI visibility preference (Fix D). Display-only: it never grants
 * or removes any permission. Backend admin gates (`requireSuperadmin`,
 * `is_admin()`) are unaffected — this only hides admin chrome on normal
 * surfaces for an admin who wants to test as a normal user.
 */
export async function setAdminUiHiddenAction(hidden: boolean): Promise<void> {
  const store = await cookies();
  if (hidden) {
    store.set(ADMIN_UI_HIDDEN_COOKIE, "1", {
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    store.delete(ADMIN_UI_HIDDEN_COOKIE);
  }
  revalidatePath("/", "layout");
}
