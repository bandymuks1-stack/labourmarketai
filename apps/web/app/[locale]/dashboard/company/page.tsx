import { setRequestLocale, getTranslations } from "next-intl/server";
import { RoleDashboard } from "@/components/app/role-dashboard";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";

/** Company / employer role-context dashboard. Server-side gated on
 *  the `company` role being held in `profile_roles` (not on
 *  `active_role` — owners can hold multiple roles). */
export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("roleDashboards.company");
  return (
    <RoleDashboard
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      pilotDisclaimer={t("pilotDisclaimer")}
      firstActionTitle={t("firstAction.title")}
      firstActionBody={t("firstAction.body")}
      firstActionStatus={t("firstAction.status")}
      profileLinkLabel={t("profileLink")}
      testId="company-dashboard"
    />
  );
}
