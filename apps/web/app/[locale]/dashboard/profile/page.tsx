import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkerTradeProfile } from "@/components/app/worker-trade-profile";
import { type CvSkill } from "@/components/app/cv-preview";
import {
  CvEngagementCards,
  type EngagementCard,
  type SkillDot,
} from "@/components/app/cv-engagement-cards";
import { type Role } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

const WORKER_RELATIONSHIPS = [
  "employee",
  "freelancer",
  "consultant",
  "owner",
  "collaborator",
];

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
  const tSkill = await getTranslations("skillNames");
  const tRole = await getTranslations("auth.signup.role");

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
  let skillDots: SkillDot[] = [];
  let engagementCards: EngagementCard[] = [];
  let professionIconSlug: string | null = null;
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
      .select("skill_id, confidence_bin, skills(slug)")
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

    // CV engagement-card skill dots (confidence bin + core flag), core first.
    skillDots = rows
      .map((r) => {
        const slug = (r.skills as { slug: string | null } | null)?.slug ?? null;
        return slug
          ? {
              slug,
              name: tSkill(slug),
              bin: (r.confidence_bin as string) ?? "red",
              isCore: coreMap.get(r.skill_id as string) ?? false,
            }
          : null;
      })
      .filter((x): x is SkillDot => x !== null)
      .sort((a, b) => Number(b.isCore) - Number(a.isCore));

    // Engagement-context cards (current first): primary first, then most-recent.
    const { data: ecRows } = await supabase
      .from("engagement_contexts")
      .select(
        "id, relationship_slug, title, is_primary, started_at, ended_at, organizations(display_name, legal_name, organization_type)",
      )
      .eq("profile_id", user.id)
      .in("relationship_slug", WORKER_RELATIONSHIPS)
      .order("is_primary", { ascending: false })
      .order("started_at", { ascending: false, nullsFirst: false });
    engagementCards = (ecRows ?? []).map((e) => {
      const org = e.organizations as
        | {
            display_name: string | null;
            legal_name: string | null;
            organization_type: string | null;
          }
        | null;
      // Disambiguate same-relationship engagements (own a company AND an agency
      // both show "Owner") via the org TYPE label when no name exists — never a
      // bare "—". Reuses existing role labels, so no new i18n keys.
      const typeLabel =
        org?.organization_type === "company"
          ? tRole("company")
          : org?.organization_type === "agency"
            ? tRole("agency")
            : null;
      return {
        id: e.id,
        orgName:
          org?.display_name ?? org?.legal_name ?? typeLabel ?? e.title ?? "—",
        relationship: e.relationship_slug,
        startedAt: e.started_at,
        endedAt: e.ended_at,
        title: e.title,
        isPrimary: e.is_primary,
      };
    });

    // Profession-level icon — stored in profession_templates.template->>'icon_slug'
    // (spec referenced a flat icon_slug column; actual schema nests it in the
    // template jsonb). Platform default for the worker's primary profession.
    if (currentProfessionId) {
      const { data: tmpl } = await supabase
        .from("profession_templates")
        .select("template")
        .eq("profession_id", currentProfessionId)
        .eq("is_platform_default", true)
        .is("organization_id", null)
        .maybeSingle();
      const tpl = tmpl?.template as { icon_slug?: string } | null;
      professionIconSlug = tpl?.icon_slug ?? null;
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
      </header>

      {workerId ? (
        <>
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
          <CvEngagementCards
            cards={engagementCards}
            skills={skillDots}
            professionIconSlug={professionIconSlug}
          />
        </>
      ) : (
        <p className="text-sm text-text-secondary">{t("noProfession")}</p>
      )}
    </div>
  );
}
