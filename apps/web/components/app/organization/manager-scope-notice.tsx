import { getTranslations } from "next-intl/server";

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
 * are still `owns_company(...)`, i.e. the creator or an active owner/admin
 * membership. So a manager's project write answers 42501 and the roster
 * read answers ZERO ROWS — which, rendered silently, is the lie "nobody is
 * on your roster". This notice states the fact once, names who can change
 * it, and renders for NO other role: an owner or admin never sees it, and
 * a member is not offered operations to begin with.
 *
 * It disappears by itself the moment the owner applies the policy widening
 * (`projects_*` → `manages_organization`): `sqlWritesGranted` is then true
 * for the role and `operationalWritesNeedGrant` answers false. Recorded as
 * an owner RED item, not hidden.
 */
export async function ManagerScopeNotice({ role }: { role: GovernanceRole }) {
  if (!operationalWritesNeedGrant(projectOrganizationAuthority({ role }))) return null;
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
