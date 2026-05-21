import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkerTradeProfile } from "@/components/app/worker-trade-profile";
import { type Role } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/** Worker "Profession & skills" page — profession + skills + live CV preview. */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("skills");
  const tProf = await getTranslations("professions");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();
  const personName =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");

  const { data: roleRows } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const roles = (roleRows ?? [])
    .map((r) => r.role)
    .filter((r): r is Role => ROLES.has(r as Role));

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const workerId = worker?.id ?? null;

  // Names live in JSON keyed by slug (PLATFORM_DOCTRINE §2); fetch id+slug,
  // translate + sort by the localized name here.
  const { data: profRows } = await supabase
    .from("professions")
    .select("id, slug")
    .eq("is_active", true);
  const professions = (profRows ?? [])
    .map((p) => ({ id: p.id, slug: p.slug, name: tProf(p.slug) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, slug }) => ({ id, slug }));

  let currentProfessionId: string | null = null;
  let initialSkillIds: string[] = [];
  if (workerId) {
    const { data: wp } = await supabase
      .from("worker_professions")
      .select("profession_id")
      .eq("worker_id", workerId)
      .eq("is_primary", true)
      .maybeSingle();
    currentProfessionId = wp?.profession_id ?? null;

    const { data: ws } = await supabase
      .from("worker_skills")
      .select("skill_id")
      .eq("worker_id", workerId);
    initialSkillIds = (ws ?? [])
      .map((r) => r.skill_id)
      .filter((id): id is string => id !== null);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
      </header>

      {workerId ? (
        <WorkerTradeProfile
          workerId={workerId}
          professions={professions}
          currentProfessionId={currentProfessionId}
          initialSkillIds={initialSkillIds}
          personName={personName}
          roles={roles}
        />
      ) : (
        <p className="text-sm text-text-secondary">{t("noProfession")}</p>
      )}
    </div>
  );
}
