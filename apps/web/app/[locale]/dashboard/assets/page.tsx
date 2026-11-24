import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getSessionProfile } from "@/lib/auth/session-profile";
import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";
import { getAssetsOverview, getMyAssignedAssets } from "@/lib/assets/assets";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { AssetsRegistry, MyAssignedAssetsPanel } from "@/components/app/assets-panel";
import { PageTitle } from "@/components/app/premium/page-title";
import { dashboardPageMetadata } from "@/lib/navigation/dashboard-metadata";

// The document title names this page (WCAG 2.4.2) — lib/navigation/dashboard-metadata.ts.
export const generateMetadata = dashboardPageMetadata("/dashboard/assets");


export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * Assets & Logistics (Wagon 9). One role-aware surface: an organization manager
 * runs the asset registry (create, issue, return, transfer over the canonical
 * org/project/worker spine); a worker sees the assets assigned to them and
 * acknowledges receipt. Reachable via navigation + the command finder.
 */
export default async function AssetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("assets");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // The layout already read this row through the ONE request-cached reader;
  // re-reading it here was one more serial round trip per page view.
  const { profile } = await getSessionProfile();
  const role = (profile?.active_role as Role) ?? "worker";
  const isManager = MANAGER_ROLES.has(role);

  const [overview, mine, workspace] = await Promise.all([
    isManager ? getAssetsOverview() : Promise.resolve(null),
    getMyAssignedAssets(),
    isManager ? getWorkspaceContext() : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <header className="flex flex-col gap-1">
        <PageTitle>{t("pageTitle")}</PageTitle>
        <p className="text-sm text-text-secondary">{t("pageIntro")}</p>
      </header>

      <MyAssignedAssetsPanel data={mine} />
      {isManager && overview ? <AssetsRegistry data={overview} activeOrganizationId={workspace?.activeWorkspaceId ?? null} /> : null}
    </div>
  );
}
