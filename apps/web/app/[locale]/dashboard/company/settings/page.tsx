import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { getOrgMembersData } from "@/lib/operations/org-members";
import { getBusinessPublicSettings } from "@/lib/company/public-profile";
import {
  CompanyNextActions,
  CompanyNoProfileGuide,
} from "@/components/app/company-next-actions";
import { CompanyReadinessSummary } from "@/components/app/company-readiness-summary";
import { OrganizationCapabilitiesCard } from "@/components/app/organization-capabilities-card";
import { BusinessPublicProfilePanel } from "@/components/app/business-public-profile-panel";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { HelpRequestPanel } from "@/components/app/help-request-panel";
import { FeatureNote } from "@/components/app/feature-note";

/**
 * NUSTATYMAI — the organization's own record (owner IA correction
 * 2026-09-16, design/final/03 §2): identity and verification status, what
 * the organization DOES (capabilities), the public business profile, the
 * tier-1 expectations note, typed help requests to the operator, and the
 * person's own profile. Administration of the organization, kept out of the
 * operating screens — none of it is daily work.
 */
export default async function CompanySettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");
  const t = await getTranslations("organizationDoors.pages.settings");
  const tCompany = await getTranslations("roleDashboards.company");
  const tNotes = await getTranslations("featureNotes");

  const employerCtx = await resolveEmployerCompanyContext();
  const companyProfile =
    employerCtx.kind === "ok" ? await getOwnedCompanyById(employerCtx.companyId) : null;
  const companyRow =
    companyProfile && companyProfile.kind === "ok" ? companyProfile.row : null;
  if (!companyRow) {
    return (
      <div className="flex flex-col gap-6" data-testid="company-settings">
        <CompanyNoProfileGuide />
      </div>
    );
  }
  const orgContext = await getActiveOrganizationContext();
  const capabilityOrgId =
    orgContext.organizations.find((o) => o.legacyCompanyId === companyRow.id)?.id ??
    orgContext.activeOrganizationId;
  const [declaredCapabilities, orgMembers] = await Promise.all([
    capabilityOrgId ? readOrganizationCapabilities(capabilityOrgId) : [],
    getOrgMembersData("company", companyRow.id),
  ]);
  const businessPublicSettings = orgMembers
    ? await getBusinessPublicSettings(orgMembers.orgId)
    : null;

  return (
    <div className="flex flex-col gap-6" data-testid="company-settings">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        {/* ONE canonical company profile — the workspace re-labels itself
            from companies.company_type after every save/refresh. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span
            className="rounded-sm border border-brand-cyan/40 bg-brand-cyan/5 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
            data-testid="company-dashboard-type-chip"
          >
            {tCompany(`setup.companyTypeOptions.${companyRow.companyType}`)}
          </span>
          {companyRow.companyType === "staffing_agency" ? (
            <span className="text-meta text-text-muted" data-testid="company-dashboard-type-note">
              {tCompany("typeNotes.staffing_agency")}
            </span>
          ) : companyRow.companyType === "client_customer" ? (
            <span className="text-meta text-text-muted" data-testid="company-dashboard-type-note">
              {tCompany("typeNotes.client_customer")}
            </span>
          ) : null}
        </div>
      </header>

      {/* Honest data-driven status (name, verification status, what to fix). */}
      <CompanyNextActions company={companyRow} />

      <CompanyReadinessSummary
        company={{
          legalName: companyRow.legalName,
          country: companyRow.country,
          registrationCode: companyRow.registrationCode,
          contactEmail: companyRow.contactEmail,
          companyType: companyRow.companyType,
          verificationStatus: companyRow.verificationStatus,
        }}
      />

      {/* One plain question, several honest answers: what this organization DOES. */}
      {capabilityOrgId ? (
        <div id="company-capabilities" className="scroll-mt-20">
          <OrganizationCapabilitiesCard
            organizationId={capabilityOrgId}
            declared={declaredCapabilities}
          />
        </div>
      ) : null}

      {orgMembers && businessPublicSettings && (
        <div id="public-business-profile" className="scroll-mt-20">
          <BusinessPublicProfilePanel
            orgId={orgMembers.orgId}
            needsMigration={businessPublicSettings.kind === "needs-migration"}
            settings={
              businessPublicSettings.kind === "ok" ? businessPublicSettings.settings : null
            }
            locale={locale}
          />
        </div>
      )}

      <OrgTier1Warning />

      <section
        className="card-border flex flex-col gap-2 p-4"
        data-testid="company-dashboard-pilot-disclaimer"
      >
        <p className="text-sm text-text-secondary">{tCompany("pilotDisclaimer")}</p>
      </section>

      {/* WAGON 10 (areas 18+19) — typed INTERNAL help requests. Creates an
          operator-visible customer_requests record; sends nothing. */}
      <HelpRequestPanel demandOptions={[]} />

      <FeatureNote testId="feature-note-company">{tNotes("companySpace")}</FeatureNote>

      <Link
        href="/dashboard/profile"
        className="self-start text-sm text-brand-blue hover:underline"
        data-testid="company-dashboard-profile-link"
      >
        {tCompany("profileLink")} →
      </Link>
    </div>
  );
}
