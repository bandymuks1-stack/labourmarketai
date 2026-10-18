import { getTranslations } from "next-intl/server";

import { getSessionIsAdmin } from "@/lib/auth/session-admin-signal";
import {
  operationalWritesNeedGrant,
  projectOrganizationAuthority,
} from "@/lib/company/organization-authority";
import type { GovernanceRole } from "@/lib/company/role-capabilities";

/**
 * THE honest line a MANAGER reads on the organization's operating screens
 * (capability matrix P1, 2026-09-23; SEP-7: refused ≠ empty).
 *
 * The role → capability matrix lets a manager run operations — projects,
 * roster, demand — and the pages now open for them. The database has not
 * caught up: `projects_insert/update/delete` and `company_workers_select`
 * are still `owns_company(...) OR is_admin()`, i.e. the creator or an active
 * owner/admin membership. So a manager's project write answers 42501 (named
 * as a refusal by both create paths) and the roster read answers ZERO ROWS —
 * which the roster list below this notice cannot tell apart from "nobody is
 * on the roster". This notice states that fact once, names who can change
 * it, and renders for NO other role: an owner or admin never sees it, and a
 * member is not offered operations to begin with.
 *
 * TWO signals decide it, in this order (review P2 on #1859, 2026-09-24):
 *   1. the governance role, from the pure projection — every role that never
 *      needs a grant returns before any read;
 *   2. the platform-admin dual signal (`getSessionIsAdmin`, the shell's own
 *      `deriveIsAdmin` reads): the `is_admin()` arm of every policy above
 *      ADMITS an admin's writes and roster read, so for a manager who is also
 *      a platform admin each sentence here would be false — they get nothing.
 *
 * The owner-approved widening (20260924140000_manager_projects_roster_rls_v1:
 * projects select/insert/update and company_workers select admit
 * `manages_organization`) made `sqlWritesGranted` true for every operating
 * role, so today this renders for NO role. It stays as the one place that
 * would state such a gap honestly if a future role operates in the matrix
 * before SQL admits it.
 */
export async function ManagerScopeNotice({ role }: { role: GovernanceRole }) {
  if (!operationalWritesNeedGrant(projectOrganizationAuthority({ role }))) return null;
  if (await getSessionIsAdmin()) return null;
  const t = await getTranslations("organizationMembers.managerScope");
  return (
    <section
      role="status"
      data-testid="manager-scope-notice"
      data-role={role}
      className="flex flex-col gap-1 rounded-lg border border-state-warning/40 bg-state-warning/5 px-4 py-3"
    >
      <p className="text-sm font-semibold text-text-primary">{t("title")}</p>
      <p className="text-xs leading-relaxed text-text-secondary">{t("body")}</p>
    </section>
  );
}
