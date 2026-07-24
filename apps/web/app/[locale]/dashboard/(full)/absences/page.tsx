import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";
import { getMyAbsences, getManagerPendingAbsences } from "@/lib/leave/absences";
import { MyAbsencesPanel, ManagerAbsencesPanel } from "@/components/app/absence-panel";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * Workforce — Leave & Absence (Wagon 7 slice). One role-aware surface:
 * every signed-in worker can request leave and see their own requests; a
 * manager additionally reviews the pending requests of the workers they
 * manage. Reachable through normal navigation + the command finder.
 */
export default async function AbsencesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("absences");

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

  const [my, managerPending] = await Promise.all([
    getMyAbsences(),
    isManager ? getManagerPendingAbsences() : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm text-text-secondary">{t("pageIntro")}</p>
      </header>

      {isManager && managerPending ? <ManagerAbsencesPanel data={managerPending} /> : null}
      <MyAbsencesPanel data={my} />
    </div>
  );
}
