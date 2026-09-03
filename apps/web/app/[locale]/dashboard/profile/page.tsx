import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { WorkerTradeProfile } from "@/components/app/worker-trade-profile";
import { ProfileTextFirstFlow } from "@/components/app/profile-text-first-flow";
import { ProfileHubOverview } from "@/components/app/profile-hub-overview";
import { FeatureNote } from "@/components/app/feature-note";
import { NonWorkerIdentityNotice } from "@/components/app/non-worker-identity-notice";
import { deriveNonWorkerIdentityNotice } from "@/lib/profile/non-worker-identity";
import { ProfileAvatar } from "@/components/app/profile-avatar";
import { getOwnAvatar } from "@/lib/profile/avatar";
import {
  deriveSkillEvidence,
  type SkillEvidenceInput,
} from "@/lib/profile/skill-evidence";
import {
  supportedSkillIds,
  type EntrySkillLinkRow,
} from "@/lib/journal/journal-entry-skills";
import { CapabilityProfileSection } from "@/components/app/capability-profile-section";
import { DetailsHashOpener } from "@/components/app/details-hash-opener";
import { SkillClarifySection } from "@/components/app/skill-clarify-section";
import { listProfileSkillClaims } from "@/lib/profile/profile-skill-claims";
import { type CvSkill } from "@/components/app/cv-preview";
import type {
  EngagementCard,
  SkillDot,
} from "@/components/app/cv-engagement-cards";
import { type Role } from "@/lib/auth/actions";
import { readActiveProfileRoles } from "@/lib/auth/profile-roles";
import { DOCUMENTS_READINESS_ENABLED } from "@/lib/config/documents";
import { createClient } from "@/lib/supabase/server";
import { TrustBlock } from "@/components/app/trust-block";
import { getOwnTrustSignals } from "@/lib/profile/trust-signals";
import {
  WorkerAvailabilityPrefsForm,
  type WorkerAvailabilityPrefsLabels,
} from "@/components/app/worker-availability-prefs-form";
import {
  getOwnAvailabilityPrefs,
  type AvailabilityPrefsRead,
} from "@/lib/worker/availability-prefs";
import { EMPTY_PREFS, EMPTY_PREFS_V2 } from "@/lib/worker/availability-prefs-model";
import {
  WorkerLanguagesSection,
  type WorkerLanguagesLabels,
} from "@/components/app/worker-languages-section";
import {
  getOwnWorkerLanguages,
  type WorkerLanguagesRead,
} from "@/lib/worker/worker-languages";
import {
  ExternalProfilesSection,
  type ExternalProfilesLabels,
} from "@/components/app/external-profiles-section";
import {
  getOwnExternalProfiles,
  type ExternalProfilesRead,
} from "@/lib/worker/external-profiles";
import { PageQuickNav } from "@/components/app/page-quick-nav";
import { Link } from "@/lib/i18n/navigation";
import { type CvSectionCard } from "@/components/app/cv-completeness-grid";
import { WorkerEducationSection } from "@/components/app/worker-education-section";
import { LearningCompassSection } from "@/components/app/learning-compass-section";
import { readLearningCompass, type LearningCompassRead } from "@/lib/learning/learning-compass";
import { WorkerAchievementsSection } from "@/components/app/worker-achievements-section";
import {
  getOwnWorkerEducation,
  type WorkerEducationRead,
} from "@/lib/worker/worker-education";
import {
  getOwnWorkerAchievements,
  type WorkerAchievementsRead,
} from "@/lib/worker/worker-achievements";

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

  /**
   * ── W7-S3 STAGE 1 — every namespace, ONE stage ──────────────────────────
   *
   * These were sixteen consecutive `await`s. They read the same already-loaded
   * message bundle, so nothing about them was ever sequential except the
   * syntax: each one parked the render for a microtask before the next could
   * start, and none of them can fail in a way the next one depends on.
   * `setRequestLocale` above is the only ordering requirement, and it stays.
   */
  const [
    t,
    tSpaces,
    tGallery,
    tProf,
    tSkill,
    tRole,
    tTrust,
    tCv,
    tDocs,
    tOpp,
    tQuick,
    tNetwork,
    tPrefs,
    tLangs,
    tExt,
    tFeatureNotes,
    tIdentityNotice,
    tPrivacySections,
  ] = await Promise.all([
    getTranslations("skills"),
    getTranslations("spaces"),
    getTranslations("personalGallery"),
    getTranslations("professions"),
    getTranslations("skillNames"),
    getTranslations("auth.signup.role"),
    getTranslations("trust"),
    getTranslations("cvExport"),
    getTranslations("documents"),
    getTranslations("opportunities"),
    getTranslations("quickNav"),
    // W7-S4: `marketplaceHub` left with the managed-companies block; the only
    // namespace this page still needs from that move is the network label for
    // the handoff link.
    getTranslations("network"),
    getTranslations("workerPrefs"),
    getTranslations("workerLanguages"),
    getTranslations("externalProfiles"),
    // Was awaited INSIDE the JSX (`{(await getTranslations(…))("workerProfile")}`),
    // which is the worst possible place: it suspends the render after the tree
    // has begun. Same namespace, resolved with the rest.
    getTranslations("featureNotes"),
    // W7-S5b: the non-worker identity notice joins the ONE batch — never a
    // standalone await (W7-S3 ratchet).
    getTranslations("profileIdentityNotice"),
    // Beta foundation audit: the employer-visibility consent lives on
    // /dashboard/privacy, which had no entry point in the worker journey —
    // supply stayed structurally invisible to scouting. Reuses the existing
    // privacyConsent.sections.visibility label in every locale.
    getTranslations("privacyConsent.sections"),
  ]);

  /**
   * ── W7-S3 STAGE 2+3 — the AUTHORIZATION GATE, deliberately still serial ──
   *
   * `createClient()` must resolve before `auth.getUser()` can be called, and
   * `getUser()` must resolve before ANY read runs — a redirect on a missing
   * user is the fail-closed check every read below depends on. These two
   * stages are ordered on purpose and this slice does not touch them.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  /**
   * ── W7-S3 STAGE 4 — everything that needs only `user`, ONE stage ────────
   *
   * `getOwnAvatar()` was a further serial await after this batch, although it
   * reads nothing the batch produces — it resolves the signed-in user itself.
   * It joins the batch.
   *
   * W7-S4: `getOwnedOrganizations()` was in this batch too, for the
   * `#managed-companies` block. That block now lives on `/dashboard/network`,
   * which was already calling the same reader — so the call moved rather than
   * multiplied, and this page dropped a read it no longer renders anything
   * from.
   *
   * ACCEPTED, NOT OVERLOOKED: `getOwnAvatar()` reads the `profiles` row a
   * second time (for `avatar_url`). Folding that column into the select above
   * would remove the duplicate — but that select is a `.single()` the whole
   * page depends on, and the avatar reader carries its own try/catch precisely
   * because `avatar_url` may not be provisioned. Trading a CONCURRENT read for
   * a fail-closed risk on the page's critical row is the wrong direction for a
   * behaviour-identical slice. The read costs no stage; it is recorded as
   * remaining debt instead.
   */
  const [
    profileRes,
    savedSkillClaims,
    roleRows,
    workerRes,
    profRowsRes,
    avatar,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, active_role, profile_text")
      .eq("id", user.id)
      .single(),
    listProfileSkillClaims(),
    // Feeds `deriveNonWorkerIdentityNotice` below, which tells the user which
    // identity they are missing. A swallowed read error made that notice fire
    // on a database hiccup (#1314) — the shared reader retries once and then
    // throws instead of deriving a notice from an answer it never got.
    readActiveProfileRoles(() =>
      supabase
        .from("profile_roles")
        .select("role")
        .eq("profile_id", user.id)
        .eq("is_active", true),
    ),
    supabase
      .from("workers")
      .select(
        "id, availability_status, available_from, current_location_country, salary_min_eur, salary_max_eur",
      )
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase.from("professions").select("id, slug").eq("is_active", true),
    getOwnAvatar(),
  ]);
  const profile = profileRes.data;
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

  // W7-S5b: derived from data already read above — no new request stage.
  const identityNotice = deriveNonWorkerIdentityNotice({ workerId, roles });

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
  // Per-skill evidence-support inputs (provenance + DURABLE journal links).
  let skillEvidenceInputs: SkillEvidenceInput[] = [];
  // Skills the worker is allowed to pick from across all their directions.
  // The text-first flow needs this catalogue (id + slug + localized name) so
  // confirmed parser matches can be mapped back to a real skill_id.
  const allowedSkills: { id: string; slug: string; name: string }[] = [];
  // Structured work preferences (PR 3) — the 8 applied-but-orphaned
  // availability-pref columns from migration 20260613100000. Read owner-scoped
  // here (server component) so the form gets real saved values, null = "not
  // stated" (never rendered as a fabricated "no").
  let availabilityPrefs: AvailabilityPrefsRead | null = null;
  // Self-stated languages (P2-PR3) — worker_languages from DRAFT migration
  // 20260711250000 (PR #720). Until the owner applies it the read reports
  // needs-migration and the section renders its honest explanation state.
  let workerLanguages: WorkerLanguagesRead | null = null;
  // External profile links (Labour Market OS P6) — worker_external_profiles
  // from DRAFT migration 20260713210000. Until the owner applies it the read
  // reports needs-migration and the section renders its honest explanation
  // state. No automatic import exists — links are worker-added only.
  let externalProfiles: ExternalProfilesRead | null = null;
  // Full CV System v1: education + achievements (DRAFT migration
  // 20260714160000 — needs-migration until the owner applies it) and the
  // count of project-linked journal entries powering the completeness grid.
  let workerEducation: WorkerEducationRead | null = null;
  let learningCompass: LearningCompassRead | null = null;
  let workerAchievements: WorkerAchievementsRead | null = null;
  let projectLinkedEntryCount = 0;
  let certificateDocCount = 0;
  // Trust signals were awaited inside the JSX; resolved in stage 5 now.
  let trustSignals: Awaited<ReturnType<typeof getOwnTrustSignals>> | null = null;
  if (workerId) {
    /**
     * ── W7-S3 STAGE 5 — everything that needs only `workerId` / `user.id` ──
     *
     * These reads were EIGHT serial stages: one batch of five, followed by six
     * standalone awaits and a last one (`getOwnTrustSignals`) that was awaited
     * inside the JSX. Not one of them consumes another's result — every single
     * one is keyed by `workerId` or `user.id`, both already known. The
     * waterfall was accidental, not structural.
     *
     * W7-S1 already removed the page's own `journal_entries` count (a second
     * read of rows the canonical player card counts); what remains here is the
     * project-linked subset, which is a different question.
     *
     * W7-S4 removed `getEmployerOwnerProfileId()` — it existed only to decide
     * whether the "Rašyti įmonei" button could render, and that button now
     * lives on `/dashboard/communication`, which resolves it there.
     */
    const [
      prefsRes,
      compassRes,
      langsRes,
      extRes,
      eduRes,
      achRes,
      projCountRes,
      certDocsRes,
      wpAllRes,
      wsRes,
      linkRes,
      ecRes,
      trust,
    ] = await Promise.all([
      getOwnAvailabilityPrefs(),
      // Learning Compass (Track C): own records + the board's match results;
      // any failure is `null` → the section simply does not render.
      readLearningCompass().catch((): LearningCompassRead | null => null),
      getOwnWorkerLanguages(),
      getOwnExternalProfiles(),
      getOwnWorkerEducation(),
      getOwnWorkerAchievements(),
      supabase
        .from("journal_entries")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", workerId)
        .not("project_id", "is", null),
      // Certificate/licence documents count (worker_documents is applied prod
      // schema; cert-type slugs mirror lib/cv-export/cv-sections.ts).
      supabase
        .from("worker_documents")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", workerId)
        .in("document_type_slug", [
          "professional_certificate",
          "a1_certificate",
        ]),
      supabase
        .from("worker_professions")
        .select("profession_id, is_primary")
        .eq("worker_id", workerId)
        .order("is_primary", { ascending: false }),
      // ALL of the worker's saved skills (read model — never filtered down).
      supabase
        .from("worker_skills")
        .select("skill_id, confidence_bin, verified, source, skills(slug)")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: true }),
      // DURABLE journal→skill links (v1) — graceful no-op if the migration is
      // not applied yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("journal_entry_skills")
        .select("journal_entry_id, skill_id")
        .eq("worker_id", workerId),
      // Engagement-context cards (current first): primary first, then
      // most-recent.
      supabase
        .from("engagement_contexts")
        .select(
          "id, relationship_slug, title, is_primary, started_at, ended_at, organizations(display_name, legal_name, organization_type)",
        )
        .eq("profile_id", user.id)
        .in("relationship_slug", WORKER_RELATIONSHIPS)
        .order("is_primary", { ascending: false })
        .order("started_at", { ascending: false, nullsFirst: false }),
      // Was awaited INSIDE the JSX (`signals={await getOwnTrustSignals(…)}`),
      // so it could not overlap anything at all.
      getOwnTrustSignals(workerId),
    ]);

    availabilityPrefs = prefsRes;
    workerLanguages = langsRes;
    externalProfiles = extRes;
    workerEducation = eduRes;
    learningCompass = compassRes;
    workerAchievements = achRes;
    projectLinkedEntryCount = projCountRes.count ?? 0;
    certificateDocCount = certDocsRes.count ?? 0;
    trustSignals = trust;

    const wpAll = wpAllRes.data;
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

    /**
     * ── W7-S3 STAGE 6 — the only reads that GENUINELY depend on stage 5 ────
     *
     * Three reads, and all three need `currentProfessionId` / `workerProfIds`,
     * which only exist once `worker_professions` has resolved. This is a real
     * dependency, so it stays a second stage — but the three run together
     * instead of one after another, and the two conditionals resolve to
     * `null` rather than skipping into their own awaits.
     */
    const workerProfIds = (wpAll ?? [])
      .map((r) => r.profession_id)
      .filter((id): id is string => !!id);
    const [coreRes, allowedRes, tmplRes] = await Promise.all([
      // is_core per skill for the current profession (the [PAGRINDINIS] tag).
      currentProfessionId
        ? supabase
            .from("profession_skills")
            .select("skill_id, is_core")
            .eq("profession_id", currentProfessionId)
        : Promise.resolve(null),
      // Catalogue of skills allowed for this worker (all directions). Used by
      // the text-first flow to resolve confirmed parser matches to skill_ids.
      workerProfIds.length > 0
        ? supabase
            .from("profession_skills")
            .select("skills(id, slug)")
            .in("profession_id", workerProfIds)
        : Promise.resolve(null),
      // Profession-level icon — stored in
      // profession_templates.template->>'icon_slug' (the spec referenced a flat
      // icon_slug column; the actual schema nests it in the template jsonb).
      // Platform default for the worker's primary profession.
      currentProfessionId
        ? supabase
            .from("profession_templates")
            .select("template")
            .eq("profession_id", currentProfessionId)
            .eq("is_platform_default", true)
            .is("organization_id", null)
            .maybeSingle()
        : Promise.resolve(null),
    ]);

    const coreMap = new Map<string, boolean>();
    for (const r of coreRes?.data ?? []) coreMap.set(r.skill_id, r.is_core);

    const rows = wsRes.data ?? [];
    initialSkillIds = rows
      .map((r) => r.skill_id)
      .filter((id): id is string => id !== null);

    // DURABLE journal→skill links (v1) — graceful no-op if the migration is not
    // applied yet. Replaces the loose provenance-only "supported" assumption:
    // a skill counts as supported when a real journal entry links it.
    let durableSupported = new Set<string>();
    if (!linkRes.error) {
      durableSupported = supportedSkillIds(
        (linkRes.data ?? []) as EntrySkillLinkRow[],
      );
    }
    skillEvidenceInputs = rows.map((r) => ({
      source: (r.source as string | null) ?? "self_declared",
      verified: r.verified === true,
      journalSupported: r.skill_id ? durableSupported.has(r.skill_id) : false,
    }));
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
              verified: r.verified === true,
              source: (r.source as string | null) ?? "self_declared",
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => Number(b.isCore) - Number(a.isCore));

    // Engagement-context cards (current first): primary first, then most-recent.
    engagementCards = (ecRes.data ?? []).map((e) => {
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

    // Catalogue of skills allowed for this worker (all directions). Resolved
    // in stage 6; the shaping below is pure.
    const seen = new Set<string>();
    for (const row of allowedRes?.data ?? []) {
      const s = row.skills as { id: string | null; slug: string | null } | null;
      if (s?.id && s.slug && !seen.has(s.id)) {
        seen.add(s.id);
        allowedSkills.push({ id: s.id, slug: s.slug, name: tSkill(s.slug) });
      }
    }
    allowedSkills.sort((a, b) => a.name.localeCompare(b.name));

    const tpl = tmplRes?.data?.template as { icon_slug?: string } | null;
    professionIconSlug = tpl?.icon_slug ?? null;
  }

  /**
   * W7-S1 — derived ONCE, then shared.
   *
   * `deriveSkillEvidence` used to run three times per render (the hub's props,
   * the review banner's IIFE, and the hub's own internal recomputation) from
   * identical inputs. The CV section states were assembled inside a JSX IIFE
   * that only the standalone grid could see; the hub now owns the grid, so the
   * list is computed here and passed in. Same inputs, same outputs, no new
   * reads — this is the duplicate-work removal the slice measured.
   */
  const skillEvidenceSummary = workerId
    ? deriveSkillEvidence(skillEvidenceInputs, savedSkillClaims.length)
    : undefined;

  const cvSectionCards: CvSectionCard[] | undefined = (() => {
    if (!workerId) return undefined;
    const eduCount =
      workerEducation?.kind === "ok" ? workerEducation.entries.length : 0;
    const achEntries =
      workerAchievements?.kind === "ok" ? workerAchievements.entries : [];
    const declaredCerts = achEntries.filter(
      (a) => a.achievementTypeSlug === "declared_certificate",
    ).length;
    return [
      {
        key: "summary",
        filled: savedProfileText.trim().length > 0,
        href: "#profile-edit",
      },
      {
        key: "workHistory",
        filled: engagementCards.length > 0,
        href: "#capabilities",
      },
      { key: "education", filled: eduCount > 0, href: "#cv-education" },
      {
        key: "languages",
        filled:
          workerLanguages?.kind === "ok" && workerLanguages.languages.length > 0,
        href: "#cv-languages",
      },
      {
        key: "certificates",
        filled: certificateDocCount > 0 || declaredCerts > 0,
        href: DOCUMENTS_READINESS_ENABLED
          ? `/${locale}/dashboard/documents`
          : "#cv-achievements",
      },
      {
        key: "skills",
        filled: savedSkillClaims.length + savedSkills.length > 0,
        href: "#profile-edit",
      },
      {
        key: "projects",
        filled: projectLinkedEntryCount > 0,
        href: `/${locale}/dashboard/journal`,
      },
      {
        key: "achievements",
        filled: achEntries.length > 0,
        href: "#cv-achievements",
      },
      {
        key: "salary",
        filled: worker?.salary_min_eur != null || worker?.salary_max_eur != null,
        href: `/${locale}/dashboard`,
      },
      {
        key: "availability",
        filled:
          worker?.availability_status === "available" ||
          Boolean(worker?.available_from),
        href: "#cv-availability",
      },
    ];
  })();

  return (
    <div className="flex flex-col gap-6">
      <TelemetryView
        event={FUNNEL_EVENTS.profileViewed}
        metadata={{ surface: "profile" }}
      />
      <header id="profile-top" className="scroll-mt-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("pageTitle")}
          </h1>
          {/* systemic-ux-mobile-v1: action cluster never clips on 360px — it
              stacks to a 2-column grid on mobile (max 2 actions across) and
              flows inline only from sm+. */}
          {/* W7-S4: every link in this row is `min-h-11` (44 px). They were
              26 px — the largest single cluster of W7-S2's remaining sub-44
              debt (A-2), and the row had to be consistent to take the network
              handoff below without one odd-sized chip. Visual size is
              unchanged; only the tap area grew. */}
          {/* `sm:shrink-0` is REMOVED, and its absence is load-bearing. The
              row already declared `sm:flex-wrap`, but `shrink-0` meant the
              row was never given a width narrower than its max-content, so
              the wrap could not engage: at 768px it measured 903px wide and
              pushed 183px past the viewport, leaving the last chip
              (`room-my-spaces-link`) entirely off-screen. `scrollWidth` read
              exactly 768, so the page could not even be scrolled to it.
              Measured at 768: shrink-0 -> 903px wide, +183px, one line;
              without it -> 672px, +0px, wraps to two lines. `min-w-0` alone
              changes nothing, which is why the shrink flag is the fix. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center [&>a]:justify-center sm:[&>a]:justify-start">
            {workerId ? (
              <Link
                href={"/dashboard/opportunities" as "/dashboard"}
                className="rounded-md border border-brand-blue/40 bg-brand-blue/10 px-2.5 py-1 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/20"
                data-testid="profile-opportunities-link"
              >
                {tOpp("title")} →
              </Link>
            ) : null}
            {workerId ? (
              <Link
                href="/cv"
                className="rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
                data-testid="profile-cv-export-link"
              >
                {tCv("exportButton")}
              </Link>
            ) : null}
            {/* Documents & readiness entry point (flag-flip slice) — the
                page is not in the primary nav yet (separate IA slice). */}
            {workerId && DOCUMENTS_READINESS_ENABLED ? (
              <Link
                href={"/dashboard/documents" as "/dashboard"}
                className="rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
                data-testid="profile-documents-link"
              >
                {tDocs("title")}
              </Link>
            ) : null}
            {/* Beta audit F1: the discoverability consent gate is the supply
                switch for the whole employer marketplace, and /dashboard/privacy
                was reachable only via Account. Give the worker a first-class
                entry next to the other profile actions. */}
            {workerId ? (
              <Link
                href={"/dashboard/privacy" as "/dashboard"}
                className="rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
                data-testid="profile-visibility-link"
              >
                {tPrivacySections("visibility")}
              </Link>
            ) : null}
            {/* F13: the personal gallery gets a clear person-context entry. */}
            {workerId ? (
              <Link
                href={"/dashboard/gallery" as "/dashboard"}
                className="rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
                data-testid="profile-gallery-link"
              >
                {tGallery("title")}
              </Link>
            ) : null}
            {/* W7-S4 handoff: `#managed-companies` left this page for
                `/dashboard/network`. That route is a primary nav tab, so this
                is a courtesy pointer for the habit the move breaks — one link
                in an existing row, not a replacement card. */}
            <Link
              href={"/dashboard/network" as "/dashboard"}
              className="rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
              data-testid="profile-network-link"
            >
              {tNetwork("title")} →
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
              data-testid="room-my-spaces-link"
            >
              {tSpaces("mySpaces")} →
            </Link>
          </div>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          {t("pageSubtitle")}
        </p>
      </header>

      {/* Page-local quick nav (IA cleanup v2 #3) — anchors relevant to the
          person identity surface so a long profile never loses the user. */}
      <PageQuickNav
        ariaLabel={tQuick("ariaLabel")}
        items={[
          { href: "#profile-top", label: tQuick("top") },
          { href: "#profile-identity", label: tQuick("identity") },
          // W7-S4: `#managed-companies` removed — the anchor's target moved to
          // `/dashboard/network`. A jump chip pointing at a section that is no
          // longer on the page is a dead control, and this bar is in-page
          // anchors only. The route link lives in the header action row.
          { href: "#profile-edit", label: tQuick("skills") },
          // The CV detail editors moved into one disclosure below; without a
          // chip they would be discoverable only by scrolling past the skills
          // composer. `DetailsHashOpener` opens the disclosure on the jump.
          { href: "#cv-details", label: tQuick("details") },
        ]}
      />

      {/* W7-S5b: when the account holds NO person identity (identity truth =
          `profile_roles`, the same set the RoleSwitcher offers "add person"
          from), this page is worker-framed copy around person sections that
          are either empty (normal: the 0009 trigger gives every profile a
          workers row) or genuinely hidden (legacy/degraded: no workers row)
          — and it says nothing about either. THE one honest notice
          (EmployerContextNotice precedent): which identity the person is
          viewing with, what state the person sections are actually in, where
          the organisation's information lives, and how a person identity can
          be added. It explains — it never fabricates person data. */}
      {identityNotice.kind === "visible" ? (
        <NonWorkerIdentityNotice
          reason={identityNotice.reason}
          presentation={identityNotice.presentation}
          labels={{
            title: tIdentityNotice("title"),
            body: tIdentityNotice(
              identityNotice.presentation === "sections-empty"
                ? "bodySectionsEmpty"
                : "bodySectionsHidden",
            ),
            companyProfileHint: tIdentityNotice("companyProfileHint"),
            companyProfileLink: tIdentityNotice("companyProfileLink"),
            addIdentityHint: tIdentityNotice("addIdentityHint"),
          }}
        />
      ) : null}

      {/* W7-S1: the readiness/summary surfaces that used to stand here —
          `ProfileStateStrip`, `LiveProfileSection`, `WorkerSetupJourney`, the
          standalone `CvCompletenessGrid` and `SkillsReviewBanner` — are
          ABSORBED into the ONE `ProfileHubOverview` below. They rendered the
          same `deriveWorkerReadiness` output four times and the same journal
          counts three times, ≈1350 px before the first editable field. Nothing
          was dropped: the old→new map is in
          `docs/audits/W7_S1_PROFILE_HUB_OVERVIEW.md` §5, and the hub inherits
          the `#setup-journey` anchor `completeOnboarding` deep-links to. */}

      {/* THE ONE OVERVIEW (W7-S1). Identity, status, what is missing and the
          single next action — with completed steps, work history, evidence
          counts, today's activity, the opportunity signal and the optional CV
          section grid behind one disclosure. Absorbs the four surfaces that
          used to precede it plus the review banner that used to follow it. */}
      <ProfileHubOverview
        personName={personName}
        avatarUrl={avatar.signedUrl}
        workerId={workerId}
        cvProvided={savedProfileText.trim().length > 0}
        selfDeclaredCount={savedSkillClaims.length + savedSkills.length}
        hasWorker={workerId !== null}
        // Derived ONCE and shared (it was computed three times per render).
        skillEvidence={skillEvidenceSummary}
        cvSections={cvSectionCards}
        // Identity-essential presence sourced from the ONE minimum card contract
        // (launch audit §7.3) — only data already fetched above, no new reads.
        cardSource={{
          fullName: profile?.full_name ?? null,
          email: profile?.email ?? null,
          avatarUrl: avatar.signedUrl,
          about: savedProfileText,
          skillsDeclared: savedSkillClaims.length + savedSkills.length,
          // Real saved country signal (worker-owned) — lets the ONE minimum
          // contract count "location" honestly instead of always-missing.
          location: worker?.current_location_country ?? null,
        }}
        /* W7-S1 — two props deliberately NOT passed any more.
           `availability` and `journalCount` existed to render the availability
           and journal PILLARS from this page's own `workers` / `journal_entries`
           reads. The hub now takes both from the ONE canonical player card
           (`pillarMet("availability")`, `playerCard.evidenceEntries`), so
           passing a second computation of the same facts would reintroduce
           exactly the disagreement this slice removed. The page's own
           journal-entry count query went with them — it had no other consumer,
           so the slice removes one DB round trip as well as one number. */
      />

      <section
        id="profile-identity"
        className="card-border flex flex-col gap-3 p-5 scroll-mt-20"
        data-testid="profile-avatar-section"
      >
        <ProfileAvatar signedUrl={avatar.signedUrl} displayName={personName} />
      </section>

      {/* W7-S4 — `#managed-companies` MOVED to `/dashboard/network`
          (`network-organizations`), which already rendered this exact
          `getOwnedOrganizations()` list against the same `/dashboard/company`
          destination. This page is the PERSON identity; "which organizations
          does my account own" is an organization-relationship fact, and it now
          has one home instead of two that could disagree. The add-company
          action, the zero-company state and the individual-activity note went
          with it — see `docs/audits/W7_S4_PROFILE_INFORMATION_ARCHITECTURE.md`
          §3 for the row-by-row map. The page's own `getOwnedOrganizations()`
          read went with the block; it had no other consumer here, so the
          profile does one fewer DB round trip. */}

      {/* Workstream C: the trust chain made VISIBLE on the person — counts
          straight from canonical tables (verified skills, manager
          confirmations, journal entries). Honest zeros with a growth hint. */}
      {workerId && trustSignals ? (
        <TrustBlock
          signals={trustSignals}
          labels={{
            title: tTrust("title"),
            caption: tTrust("caption"),
            verifiedSkills: tTrust("verifiedSkills"),
            managerConfirmations: tTrust("managerConfirmations"),
            journalEntries: tTrust("journalEntries"),
            zeroHint: tTrust("zeroHint"),
          }}
        />
      ) : null}

      {/* W7-S5b: "Your professional passport: CV, skills and work journal…"
          was rendered unconditionally — worker-framed copy shown verbatim to
          accounts holding no person identity. Keyed on identity (roles), NOT
          `workerId`: the 0009 trigger makes `workerId` non-null for every
          normal account, so a workerId gate would never fire. A non-worker
          identity gets the two-identities model note instead; the identity
          notice above carries the full explanation. */}
      <FeatureNote testId="feature-note-profile">
        {identityNotice.kind === "hidden"
          ? tFeatureNotes("workerProfile")
          : tFeatureNotes("identityModel")}
      </FeatureNote>
      {/* Consolidated (P0 profile rescue): the ProfileHubOverview above is the
          SINGLE output summary — CV + skills + journal-evidence pillars (which
          also show what's missing), the compact "Supported by work entries: N",
          the not-verified disclaimer, and ONE next action. The former duplicate
          panels (ProfileCvClarityCard checklist, WorkerEvidenceCard, and the
          standalone ProfileProcessAssistant) were removed so the profile no
          longer splits into competing summary/evidence/helper panels. */}

      {/* W7-S4 — the worker→employer "Rašyti įmonei" entry MOVED to
          `/dashboard/communication`. It opened a conversation and navigated
          away from this page, and its one failure state
          (`?notice=cannot_open`) already renders THERE — so the control lived
          on the person-identity surface while both its success and its failure
          belonged to the communication surface. Same button, same
          `getEmployerOwnerProfileId()` resolution, same no-dead-button rule;
          only the page changed. */}

      {/* Text-first composer — universal. Available to every authenticated
          user regardless of role. The catalogued worker_skills picker
          (manualSlot) only renders for users with a worker row; pure
          company/agency/customer accounts see only the self-declared
          composer + chips, which is the right canonical surface for
          their narrative-derived skills. The wrapper id is the anchor target
          for the hub overview's single "Complete profile" primary action. */}
      <div id="profile-edit" className="scroll-mt-4">
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
      </div>

      {/* IA (profile hierarchy): these five CV detail editors — work
          preferences, languages, education, achievements and external
          profiles — stood BETWEEN the identity summary and the one surface
          this page exists to edit, and measured 2 195 px on a 1280×900
          viewport. Every one of them is filled in once and revisited rarely.
          Same editors, same order, same anchors, same reads — one disclosure,
          so they are opened when they are being written and scrolled past
          never. The summary reuses `quickNav.details`, which already exists
          in every ACTIVE locale, so no new product string is introduced.
          `DetailsHashOpener` opens this wrapper for `#cv-details` AND for a
          hash targeting a section INSIDE it (`#cv-availability` is a hub
          readiness step's deep link), so no deep link lands on a closed bar. */}
      <DetailsHashOpener targetId="cv-details" />
      <details
        id="cv-details"
        className="group scroll-mt-4 rounded-md border border-border-subtle bg-surface-1/40"
      >
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
            {tQuick("details")}
          </span>
        </summary>
        <div className="flex flex-col gap-6 px-4 pb-4">
      {/* Structured work preferences (PR 3) — after the trust/availability
          area, worker-only (needs a workers row: the RPC targets it). Saves go
          through the owner-scoped save_worker_availability_prefs RPC; every
          boolean pref is tri-state so "not stated" stays an honest null. */}
      {workerId && availabilityPrefs ? (
        <div id="cv-availability" className="scroll-mt-20">
        <WorkerAvailabilityPrefsForm
          initial={
            availabilityPrefs.kind === "ok" ? availabilityPrefs.values : EMPTY_PREFS
          }
          needsMigration={availabilityPrefs.kind === "needs-migration"}
          // v2 pack (draft PR #721): editable only when the read path saw the
          // 7 draft columns; otherwise the fieldset explains itself honestly.
          v2Enabled={
            availabilityPrefs.kind === "ok" && availabilityPrefs.v2.kind === "ok"
          }
          initialV2={
            availabilityPrefs.kind === "ok" && availabilityPrefs.v2.kind === "ok"
              ? availabilityPrefs.v2.values
              : EMPTY_PREFS_V2
          }
          labels={
            {
              title: tPrefs("title"),
              hint: tPrefs("hint"),
              willingToRelocate: tPrefs("willingToRelocate"),
              needsAccommodation: tPrefs("needsAccommodation"),
              hasTransport: tPrefs("hasTransport"),
              teamAvailable: tPrefs("teamAvailable"),
              soloAvailable: tPrefs("soloAvailable"),
              maxTripDays: tPrefs("maxTripDays"),
              contractType: tPrefs("contractType"),
              note: tPrefs("note"),
              triState: {
                not_stated: tPrefs("triState.notStated"),
                yes: tPrefs("triState.yes"),
                no: tPrefs("triState.no"),
              },
              contract: {
                employment: tPrefs("contract.employment"),
                subcontract: tPrefs("contract.subcontract"),
                temporary: tPrefs("contract.temporary"),
                any: tPrefs("contract.any"),
              },
              notePlaceholder: tPrefs("notePlaceholder"),
              save: tPrefs("save"),
              saving: tPrefs("saving"),
              saved: tPrefs("saved"),
              error: tPrefs("error"),
              needsMigration: tPrefs("needsMigration"),
              v2: {
                title: tPrefs("v2.title"),
                hint: tPrefs("v2.hint"),
                payBasis: tPrefs("v2.payBasis"),
                payBasisOptions: {
                  gross: tPrefs("v2.payBasisOptions.gross"),
                  net: tPrefs("v2.payBasisOptions.net"),
                },
                nightShifts: tPrefs("v2.nightShifts"),
                weekendShifts: tPrefs("v2.weekendShifts"),
                overtime: tPrefs("v2.overtime"),
                licenceCategories: tPrefs("v2.licenceCategories"),
                ownVehicle: tPrefs("v2.ownVehicle"),
                ownTools: tPrefs("v2.ownTools"),
                notEnabled: tPrefs("v2.notEnabled"),
                notSaved: tPrefs("v2.notSaved"),
              },
            } satisfies WorkerAvailabilityPrefsLabels
          }
        />
        </div>
      ) : null}

      {/* Self-stated languages (P2-PR3) — worker_languages (draft PR #720),
          right next to the preferences card on the same identity surface.
          Renders its honest not-enabled state until the owner applies the
          draft migration; writes only via the two owner-scoped RPCs. */}
      {workerId && workerLanguages && workerLanguages.kind !== "no-worker" ? (
        <div id="cv-languages" className="scroll-mt-20">
        <WorkerLanguagesSection
          initial={workerLanguages.kind === "ok" ? workerLanguages.languages : []}
          needsMigration={workerLanguages.kind === "needs-migration"}
          labels={
            {
              title: tLangs("title"),
              hint: tLangs("hint"),
              selfStated: tLangs("selfStated"),
              language: tLangs("language"),
              level: tLangs("level"),
              levelNative: tLangs("levelNative"),
              add: tLangs("add"),
              adding: tLangs("adding"),
              remove: tLangs("remove"),
              empty: tLangs("empty"),
              notEnabled: tLangs("notEnabled"),
              error: tLangs("error"),
              invalid: tLangs("invalid"),
            } satisfies WorkerLanguagesLabels
          }
        />
        </div>
      ) : null}

      {/* Education + achievements editors (Full CV System v1) — the two NEW
          canonical CV sections (worker_education / worker_achievements, DRAFT
          migration 20260714160000). Honest not-enabled state until the owner
          applies the draft; entries are self-declared, never verified. */}
      {workerId && workerEducation ? (
        <WorkerEducationSection
          initial={workerEducation.kind === "ok" ? workerEducation.entries : []}
          needsMigration={workerEducation.kind === "needs-migration"}
        />
      ) : null}

      {/* Learning Compass (Track C, 2026-09-03) — the student home's five
          answers, rendered only on the student path (a current education row
          or an active learner link). Reads the person's own records and the
          same match engine the opportunity board uses; nothing generated. */}
      {learningCompass?.status === "ok" && learningCompass.student ? (
        <LearningCompassSection compass={learningCompass.compass} />
      ) : null}
      {workerId && workerAchievements ? (
        <WorkerAchievementsSection
          initial={
            workerAchievements.kind === "ok" ? workerAchievements.entries : []
          }
          needsMigration={workerAchievements.kind === "needs-migration"}
        />
      ) : null}

      {/* External profile links (Labour Market OS P6) — worker_external_profiles
          (draft migration 20260713210000), next to the languages card on the
          same identity surface. Consent-first: private by default, no employer
          read path in v1 (the card says so), soft disconnect only, NO
          automatic import (honest note points at the CV-file upload flow). */}
      {workerId && externalProfiles && externalProfiles.kind !== "no-worker" ? (
        <ExternalProfilesSection
          initial={
            externalProfiles.kind === "ok" ? externalProfiles.profiles : []
          }
          needsMigration={externalProfiles.kind === "needs-migration"}
          labels={
            {
              title: tExt("title"),
              hint: tExt("hint"),
              selfManaged: tExt("selfManaged"),
              platform: tExt("platform"),
              url: tExt("url"),
              urlPlaceholder: tExt("urlPlaceholder"),
              add: tExt("add"),
              adding: tExt("adding"),
              disconnect: tExt("disconnect"),
              confirmDisconnect: tExt("confirmDisconnect"),
              cancel: tExt("cancel"),
              visibility: tExt("visibility"),
              visibilityPrivate: tExt("visibilityPrivate"),
              visibilityEmployers: tExt("visibilityEmployers"),
              visibilityNote: tExt("visibilityNote"),
              importNote: tExt("importNote"),
              importLink: tExt("importLink"),
              empty: tExt("empty"),
              notEnabled: tExt("notEnabled"),
              error: tExt("error"),
              invalid: tExt("invalid"),
              platformNames: {
                linkedin: tExt("platformNames.linkedin"),
                github: tExt("platformNames.github"),
                behance: tExt("platformNames.behance"),
                portfolio: tExt("platformNames.portfolio"),
                certification_registry: tExt("platformNames.certificationRegistry"),
                other: tExt("platformNames.other"),
              },
            } satisfies ExternalProfilesLabels
          }
        />
      ) : null}
        </div>
      </details>


      {/* Unified CAPABILITY surface — the canonical home for self-declared
          skills (`profile_skill_claims`) and worker work history. Always
          renders when the user has any saved chips OR any worker
          engagements. The chip list carries one plain-language honesty line
          so the chips cannot be mistaken for externally verified claims, and
          they remain visible regardless of the user's currently-selected
          work category (PLATFORM_DOCTRINE §1: a person is not locked into
          one category). */}
      {/* IA cleanup v2 (#4): the profile leads with person identity (avatar,
          managed companies, skills text). The detailed capability + work-history
          surface is collapsed into a disclosure so the profile is no longer a
          work-history warehouse; the FULL work records live in Mano CV (linked
          here), not duplicated open on the profile. The canonical
          CapabilityProfileSection mount + order is preserved. */}
      {/* Deep links (#capabilities) must land on an OPEN disclosure — six
          senders across work-card, journal composer, player card and readiness
          steps link this anchor (audit PR4). */}
      <DetailsHashOpener targetId="capabilities" />
      <details id="capabilities" className="group scroll-mt-4 rounded-md border border-border-subtle bg-surface-1/40">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
            {tQuick("capabilities")}
          </span>
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <Link
            href="/dashboard/journal"
            className="inline-flex min-h-11 w-fit items-center font-mono text-meta uppercase tracking-label text-brand-blue hover:underline"
            data-testid="profile-mano-cv-records-link"
          >
            {tQuick("fullRecordsInCv")} →
          </Link>
          <CapabilityProfileSection
            claims={savedSkillClaims}
            engagements={workerId ? engagementCards : []}
            workerSkillDots={workerId ? skillDots : []}
            professionIconSlug={workerId ? professionIconSlug : null}
          />
        </div>
      </details>

      {/* Candidate skill clarify-capture (slice skill-clarify-capture-v1) — on
          the canonical capability surface, NOT a new route. Worker-only. */}
      {workerId ? (
        <div id="candidate-skills" className="scroll-mt-4">
          <SkillClarifySection />
        </div>
      ) : null}
    </div>
  );
}
