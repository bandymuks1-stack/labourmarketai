import { setRequestLocale, getTranslations } from "next-intl/server";
import { RoleDashboard } from "@/components/app/role-dashboard";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";

/** Buyer / client role-context dashboard. Server-side gated on the
 *  `customer` role being held in `profile_roles`. (The DB uses
 *  `customer` as the role slug; the user-facing copy is "Pirkėjas /
 *  Buyer", see PILOT_ROLE_READINESS.md.) */
export default async function BuyerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "customer");

  const t = await getTranslations("roleDashboards.buyer");
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
      testId="buyer-dashboard"
    />
  );
}
