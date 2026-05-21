import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkerTradeProfile } from "@/components/app/worker-trade-profile";
import { createClient } from "@/lib/supabase/server";

/** Worker "Profession & skills" page. Primary home for the skills picker. */
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

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  // Worker row is guaranteed by the migration-0009 trigger; guard anyway.
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
    <div className="flex max-w-2xl flex-col gap-8">
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
        />
      ) : (
        <p className="text-sm text-text-secondary">{t("noProfession")}</p>
      )}
    </div>
  );
}
