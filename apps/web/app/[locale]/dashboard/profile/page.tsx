import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkerTradeProfile } from "@/components/app/worker-trade-profile";
import { type CvSkill } from "@/components/app/cv-preview";
import { type Role } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/** Worker "Profession & skills" page — profession + skills + CV preview.
 *  The CV preview is a read model of SAVED data fetched here, so its counts
 *  always equal what is persisted (refreshed after each save). */
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
    .select("full_name, email, active_role")
    .eq("id", user.id)
    .single();
  const personName =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");
  const activeRole = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : null;

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
  let savedSkills: CvSkill[] = [];
  if (workerId) {
    const { data: wp } = await supabase
      .from("worker_professions")
      .select("profession_id")
      .eq("worker_id", workerId)
      .eq("is_primary", true)
      .maybeSingle();
    currentProfessionId = wp?.profession_id ?? null;

    // is_core per skill for the current profession (for the [PAGRINDINIS] tag).
    const coreMap = new Map<string, boolean>();
    if (currentProfessionId) {
      const { data: ps } = await supabase
        .from("profession_skills")
        .select("skill_id, is_core")
        .eq("profession_id", currentProfessionId);
      for (const r of ps ?? []) coreMap.set(r.skill_id, r.is_core);
    }

    // ALL of the worker's saved skills (read model — never filtered down).
    const { data: ws } = await supabase
      .from("worker_skills")
      .select("skill_id, skills(slug)")
      .eq("worker_id", workerId)
      .order("created_at", { ascending: true });
    const rows = ws ?? [];
    initialSkillIds = rows
      .map((r) => r.skill_id)
      .filter((id): id is string => id !== null);
    savedSkills = rows
      .map((r) => {
        const slug = (r.skills as { slug: string | null } | null)?.slug ?? null;
        return slug
          ? { slug, isCore: coreMap.get(r.skill_id as string) ?? false }
          : null;
      })
      .filter((x): x is CvSkill => x !== null)
      // core first; stable sort preserves the created_at ascending order within.
      .sort((a, b) => Number(b.isCore) - Number(a.isCore));
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
          activeRole={activeRole}
          savedSkills={savedSkills}
        />
      ) : (
        <p className="text-sm text-text-secondary">{t("noProfession")}</p>
      )}
    </div>
  );
}
