import { setRequestLocale, getTranslations } from "next-intl/server";
import { RoleDashboard } from "@/components/app/role-dashboard";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";

/** Agency / recruiter role-context dashboard. Server-side gated on
 *  the `agency` role being held in `profile_roles`. */
export default async function AgencyDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "agency");

  const t = await getTranslations("roleDashboards.agency");
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
      testId="agency-dashboard"
    />
  );
}
