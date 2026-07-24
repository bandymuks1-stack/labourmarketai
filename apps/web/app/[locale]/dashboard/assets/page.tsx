import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";
import { getAssetsOverview, getMyAssignedAssets } from "@/lib/assets/assets";
import { AssetsRegistry, MyAssignedAssetsPanel } from "@/components/app/assets-panel";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role = (profile?.active_role as Role) ?? "worker";
  const isManager = MANAGER_ROLES.has(role);

  const [overview, mine] = await Promise.all([
    isManager ? getAssetsOverview() : Promise.resolve(null),
    getMyAssignedAssets(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm text-text-secondary">{t("pageIntro")}</p>
      </header>

      <MyAssignedAssetsPanel data={mine} />
      {isManager && overview ? <AssetsRegistry data={overview} /> : null}
    </div>
  );
}
