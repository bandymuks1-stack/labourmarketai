import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WorkerTradeProfile } from "@/components/app/worker-trade-profile";
import { ProfileTextFirstFlow } from "@/components/app/profile-text-first-flow";
import { CapabilityProfileSection } from "@/components/app/capability-profile-section";
import { listProfileSkillClaims } from "@/lib/profile/profile-skill-claims";
import { type CvSkill } from "@/components/app/cv-preview";
import type {
  EngagementCard,
  SkillDot,
} from "@/components/app/cv-engagement-cards";
import { type Role } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

type WorkerDirection = { id: string; slug: string; name: string; isPrimary: boolean };

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

  // These five top-level reads are independent — run them in parallel to
  // cut the slowest authenticated SSR page's tail latency. The worker
  // branch's inner queries (further down) still depend on workerId /
  // currentProfessionId / workerProfIds, so they stay sequential.
  const [profileRes, savedSkillClaims, roleRowsRes, workerRes, profRowsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, active_role, profile_text")
        .eq("id", user.id)
        .single(),
      listProfileSkillClaims(),
      supabase
        .from("profile_roles")
        .select("role")
        .eq("profile_id", user.id)
        .eq("is_active", true),
      supabase
        .from("workers")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle(),
      supabase.from("professions").select("id, slug").eq("is_active", true),
    ]);
  const profile = profileRes.data;
  const roleRows = roleRowsRes.data;
  const worker = workerRes.data;
  const profRows = profRowsRes.data;

  const personName =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");
  const activeRole = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : null;
  // Owner-only narrative from migration 0014. Deliberately NOT sourced from
  // workers.bio (employer-readable via is_employer() RLS); see profile-text-actions.ts.
  const savedProfileText =
    (profile as { profile_text?: string | null } | null)?.profile_text ?? "";

  const roles = (roleRows ?? [])
    .map((r) => r.role)
    .filter((r): r is Role => ROLES.has(r as Role));

  const workerId = worker?.id ?? null;

  // Names live in JSON keyed by slug (PLATFORM_DOCTRINE §2); fetch id+slug,
  // translate + sort by the localized name here.
  const professions = (profRows ?? [])
    .map((p) => ({ id: p.id, slug: p.slug, name: tProf(p.slug) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, slug }) => ({ id, slug }));

  let currentProfessionId: string | null = null;
  let workerDirections: WorkerDirection[] = [];
  let initialSkillIds: string[] = [];
  let savedSkills: CvSkill[] = [];
  let skillDots: SkillDot[] = [];
  let engagementCards: EngagementCard[] = [];
  let professionIconSlug: string | null = null;
  // Skills the worker is allowed to pick from across all their directions.
  // The text-first flow needs this catalogue (id + slug + localized name) so
  // confirmed parser matches can be mapped back to a real skill_id.
  const allowedSkills: { id: string; slug: string; name: string }[] = [];
  if (workerId) {
    const { data: wpAll } = await supabase
      .from("worker_professions")
      .select("profession_id, is_primary")
      .eq("worker_id", workerId)
      .order("is_primary", { ascending: false });
    const wp = (wpAll ?? []).find((r) => r.is_primary) ?? null;
    currentProfessionId = wp?.profession_id ?? null;
    // All of the worker's directions (primary + additional) — non-locking (§1).
    workerDirections = (wpAll ?? [])
      .map((r) => {
        const p = professions.find((x) => x.id === r.profession_id);
        return p
          ? { id: p.id, slug: p.slug, name: tProf(p.slug), isPrimary: r.is_primary }
          : null;
      })
      .filter((d): d is WorkerDirection => d !== null)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

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

    // Catalogue of skills allowed for this worker (all directions). Used by
    // the text-first flow to resolve confirmed parser matches to skill_ids.
    const workerProfIds = (wpAll ?? [])
      .map((r) => r.profession_id)
      .filter((id): id is string => !!id);
    if (workerProfIds.length > 0) {
      const { data: psRows } = await supabase
        .from("profession_skills")
        .select("skills(id, slug)")
        .in("profession_id", workerProfIds);
      const seen = new Set<string>();
      for (const row of psRows ?? []) {
        const s = row.skills as { id: string | null; slug: string | null } | null;
        if (s?.id && s.slug && !seen.has(s.id)) {
          seen.add(s.id);
          allowedSkills.push({ id: s.id, slug: s.slug, name: tSkill(s.slug) });
        }
      }
      allowedSkills.sort((a, b) => a.name.localeCompare(b.name));
    }

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
        <p className="mt-2 text-sm text-text-secondary">
          {t("pageSubtitle")}
        </p>
      </header>

      {/* Text-first composer — universal. Available to every authenticated
          user regardless of role. The catalogued worker_skills picker
          (manualSlot) only renders for users with a worker row; pure
          company/agency/customer accounts see only the self-declared
          composer + chips, which is the right canonical surface for
          their narrative-derived skills. */}
      <ProfileTextFirstFlow
        initialText={savedProfileText}
        savedClaimNormalizedLabels={savedSkillClaims.map(
          (c) => c.normalized_label,
        )}
        manualSlot={
          workerId ? (
            <WorkerTradeProfile
              workerId={workerId}
              professions={professions}
              currentProfessionId={currentProfessionId}
              directions={workerDirections}
              initialSkillIds={initialSkillIds}
              personName={personName}
              roles={roles}
              activeRole={activeRole}
              savedSkills={savedSkills}
            />
          ) : undefined
        }
      />

      {/* Unified CAPABILITY surface — the canonical home for self-declared
          skills (`profile_skill_claims`) and worker work history. Always
          renders when the user has any saved chips OR any worker
          engagements. Self-declared chips are clearly labelled
          "Paties nurodyta · Nepatvirtinta išoriškai · source = profile_text"
          so they cannot be mistaken for externally verified claims, and
          they remain visible regardless of the user's currently-selected
          work category (PLATFORM_DOCTRINE §1: a person is not locked into
          one category). */}
      <CapabilityProfileSection
        claims={savedSkillClaims}
        engagements={workerId ? engagementCards : []}
        workerSkillDots={workerId ? skillDots : []}
        professionIconSlug={workerId ? professionIconSlug : null}
      />
    </div>
  );
}
