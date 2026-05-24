/**
 * Application-layer admin recognition.
 *
 * Permission and workspace are independent dimensions. A user can be
 * admin (a permission grant) AND be looking at any workspace role
 * (worker / company / agency / customer). The dashboard `active_role`
 * column carries the workspace view; admin lives on a SEPARATE signal
 * so that `switchActiveRole` (which overwrites active_role) cannot
 * strip admin in the UI.
 *
 * The signal is dual:
 *
 *   (a) `profiles.active_role === 'admin'`  — the legacy single-source
 *       signal, retained so admins whose active_role is still 'admin'
 *       continue to read as admin.
 *   (b) a row in `profile_roles` with `role = 'admin'` — persistent
 *       across workspace switches via the self-healing upsert in
 *       `switchActiveRole` and via `admin:grant-superadmin --apply`.
 *
 * The SQL helper `public.is_admin()` still reads only (a); decoupling
 * it from active_role is a follow-up migration. Until then this helper
 * is the application-level gate (badge, route guard, navigation).
 */
export function deriveIsAdmin(input: {
  activeRole: string | null | undefined;
  profileRoles: ReadonlyArray<{ role: string }>;
}): boolean {
  if (input.activeRole === "admin") return true;
  for (const r of input.profileRoles) {
    if (r.role === "admin") return true;
  }
  return false;
}
