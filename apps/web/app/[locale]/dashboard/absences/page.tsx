import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/auth/actions";
import { getMyAbsences, getManagerPendingAbsences } from "@/lib/leave/absences";
import {
  absentOn,
  absentWithinDays,
  getEmployerWorkerAvailability,
} from "@/lib/planning/employer-availability";
import { MyAbsencesPanel, ManagerAbsencesPanel } from "@/components/app/absence-panel";
import { AbsentNowPanel } from "@/components/app/absent-now-panel";

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

  const [my, managerPending, availability] = await Promise.all([
    getMyAbsences(),
    isManager ? getManagerPendingAbsences() : Promise.resolve(null),
    isManager ? getEmployerWorkerAvailability() : Promise.resolve(null),
  ]);

  // "Who is absent NOW" (V8 GAP 3): derived from the SAME minimised
  // availability read the planning zone uses; dates in this domain are
  // date-only, so "today" is the UTC calendar day (W12 doctrine). A failed
  // read renders nothing — an error must not impersonate "nobody is absent";
  // the schedule-not-applied state renders its honest line instead.
  const todayIso = new Date().toISOString().slice(0, 10);
  const absentNow =
    availability === null || availability.status === "error" || availability.status === "not-authed"
      ? null
      : availability.status === "unavailable"
        ? ({ kind: "unavailable" } as const)
        : ({
            kind: "ok",
            today: absentOn(todayIso, availability.unavailability),
            week: absentWithinDays(todayIso, 7, availability.unavailability),
            managedWorkerCount: availability.managedWorkerCount,
          } as const);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm text-text-secondary">{t("pageIntro")}</p>
      </header>

      {isManager && absentNow ? <AbsentNowPanel state={absentNow} /> : null}
      {isManager && managerPending ? <ManagerAbsencesPanel data={managerPending} /> : null}
      <MyAbsencesPanel data={my} />
    </div>
  );
}
