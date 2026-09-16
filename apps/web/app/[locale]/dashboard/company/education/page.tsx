import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { InstitutionLearnersSection } from "@/components/app/institution-learners-section";
import { InstitutionProgramsSection } from "@/components/app/institution-programs-section";
import { PublicDemandSection } from "@/components/app/public-demand-section";

/**
 * MOKYMAI — the education door (owner IA correction 2026-09-16,
 * design/final/03 §2). Exists only for an organization that declared the
 * `training_provider` capability — the SAME axis the hub used to decide
 * whether to render these sections. Learners (least-privilege: never a
 * learner's journal or profile), programmes → cohorts → learners with the
 * live public demand for each direction, and the public demand pool itself.
 */
export default async function CompanyEducationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");
  const t = await getTranslations("organizationDoors.pages.education");

  const employerCtx = await resolveEmployerCompanyContext();
  const companyProfile =
    employerCtx.kind === "ok" ? await getOwnedCompanyById(employerCtx.companyId) : null;
  const companyRow =
    companyProfile && companyProfile.kind === "ok" ? companyProfile.row : null;
  const orgContext = await getActiveOrganizationContext();
  const capabilityOrgId =
    (companyRow
      ? orgContext.organizations.find((o) => o.legacyCompanyId === companyRow.id)?.id
      : undefined) ?? orgContext.activeOrganizationId;
  const declaredCapabilities = capabilityOrgId
    ? await readOrganizationCapabilities(capabilityOrgId)
    : [];
  // Not an education institution: the door does not exist for this
  // organization, so the address leads back to Dabar rather than to an
  // empty room.
  if (!capabilityOrgId || !declaredCapabilities.includes("training_provider")) {
    redirect(`/${locale}/dashboard/company`);
  }

  return (
    <div className="flex flex-col gap-6" data-testid="company-education">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>
      <InstitutionLearnersSection organizationId={capabilityOrgId} />
      <InstitutionProgramsSection organizationId={capabilityOrgId} />
      <PublicDemandSection audience="institution" />
    </div>
  );
}
