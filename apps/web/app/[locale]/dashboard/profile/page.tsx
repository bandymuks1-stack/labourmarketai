import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { WorkerTradeProfile } from "@/components/app/worker-trade-profile";
import { ProfileTextFirstFlow } from "@/components/app/profile-text-first-flow";
import { ProfileHubOverview } from "@/components/app/profile-hub-overview";
import { FeatureNote } from "@/components/app/feature-note";
import { ProfileAvatar } from "@/components/app/profile-avatar";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { SkillsReviewBanner } from "@/components/app/skills-review-banner";
import {
  deriveSkillEvidence,
  type SkillEvidenceInput,
} from "@/lib/profile/skill-evidence";
import {
  supportedSkillIds,
  type EntrySkillLinkRow,
} from "@/lib/journal/journal-entry-skills";
import { MessageButton } from "@/components/app/message-button";
import { getEmployerOwnerProfileId } from "@/lib/communication/employer-resolution";
import { CapabilityProfileSection } from "@/components/app/capability-profile-section";
import { SkillClarifySection } from "@/components/app/skill-clarify-section";
import { listProfileSkillClaims } from "@/lib/profile/profile-skill-claims";
import { type CvSkill } from "@/components/app/cv-preview";
import type {
  EngagementCard,
  SkillDot,
} from "@/components/app/cv-engagement-cards";
import { type Role } from "@/lib/auth/actions";
import { DOCUMENTS_READINESS_ENABLED } from "@/lib/config/documents";
import { createClient } from "@/lib/supabase/server";
import { TrustBlock } from "@/components/app/trust-block";
import { getOwnTrustSignals } from "@/lib/profile/trust-signals";
import { PageQuickNav } from "@/components/app/page-quick-nav";
import { getOwnedOrganizations } from "@/lib/company/owned-organizations";
import { Building2 } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

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
  const tSpaces = await getTranslations("spaces");
  const tProf = await getTranslations("professions");
  const tSkill = await getTranslations("skillNames");
  const tRole = await getTranslations("auth.signup.role");
  const tTrust = await getTranslations("trust");
  const tCv = await getTranslations("cvExport");
  const tDocs = await getTranslations("documents");
  const tOpp = await getTranslations("opportunities");
  const tQuick = await getTranslations("quickNav");
  const tHub = await getTranslations("marketplaceHub");

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
  const avatar = await getOwnAvatar();
  // Managed companies (IA cleanup v2 #4): the profile is the person identity
  // surface, so it shows the REAL companies this person owns/manages (account-
  // linked professional identities) with a name + add action. No fake
  // companies — an empty list simply renders the add CTA.
  const ownedOrgsResult = await getOwnedOrganizations();
  const managedCompanies =
    ownedOrgsResult.kind === "ok"
      ? ownedOrgsResult.organizations.filter((o) => o.organizationType !== "agency")
      : [];
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
  let employerOwnerProfileId: string | null = null;
  let workerDirections: WorkerDirection[] = [];
  let initialSkillIds: string[] = [];
  let savedSkills: CvSkill[] = [];
  let skillDots: SkillDot[] = [];
  let engagementCards: EngagementCard[] = [];
  let professionIconSlug: string | null = null;
  let journalCount = 0;
  // Per-skill evidence-support inputs (provenance + DURABLE journal links).
  let skillEvidenceInputs: SkillEvidenceInput[] = [];
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

    // Journal entries count — feeds the real profile-completion status.
    const { count: jCount } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
      .eq("worker_id", workerId);
    journalCount = jCount ?? 0;
    // Resolve the employing company owner (if any) so the worker can message
    // them — read-only, RLS-scoped to the worker's own accepted invitation.
    employerOwnerProfileId = await getEmployerOwnerProfileId();
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
      .select("skill_id, confidence_bin, verified, source, skills(slug)")
      .eq("worker_id", workerId)
      .order("created_at", { ascending: true });
    const rows = ws ?? [];
    initialSkillIds = rows
      .map((r) => r.skill_id)
      .filter((id): id is string => id !== null);

    // DURABLE journal→skill links (v1) — graceful no-op if the migration is not
    // applied yet. Replaces the loose provenance-only "supported" assumption:
    // a skill counts as supported when a real journal entry links it.
    let durableSupported = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkRes = await (supabase as any)
      .from("journal_entry_skills")
      .select("journal_entry_id, skill_id")
      .eq("worker_id", workerId);
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
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:items-center [&>a]:text-center sm:[&>a]:text-left">
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
          { href: "#managed-companies", label: tQuick("companies") },
          { href: "#profile-edit", label: tQuick("skills") },
        ]}
      />

      <section
        id="profile-identity"
        className="card-border flex flex-col gap-3 p-5 scroll-mt-20"
        data-testid="profile-avatar-section"
      >
        <ProfileAvatar signedUrl={avatar.signedUrl} displayName={personName} />
      </section>

      {/* Managed companies + individual activity (IA cleanup v2 #4): the person
          identity carries the account-linked company identities (real owned
          organizations, by name) and the add-company action. Self-employed /
          individual activity is the person acting WITHOUT a company — framed
          here, not as a separate top-level menu item. No fake companies. */}
      <section
        id="managed-companies"
        className="card-border flex flex-col gap-3 p-5 scroll-mt-20"
        data-testid="profile-managed-companies"
      >
        <div className="flex items-center gap-2 text-text-primary">
          <Building2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <h2 className="font-display text-lg font-semibold">
            {tHub("company.title")}
          </h2>
        </div>
        {managedCompanies.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {managedCompanies.map((c) => (
                <li key={c.id}>
                  <Link
                    href="/dashboard/company"
                    className="flex items-center justify-between gap-3 rounded-md border border-ink-500 px-3 py-2 text-sm text-text-primary hover:border-brand-blue hover:text-brand-blue"
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <span aria-hidden className="shrink-0 text-text-muted">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard/start/company"
              className="font-mono text-[11px] uppercase tracking-label text-brand-blue hover:underline"
              data-testid="profile-add-company"
            >
              + {tHub("company.noCompanyCta")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">{tHub("company.noCompanyDesc")}</p>
            <Link
              href="/dashboard/start/company"
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-1.5 text-sm text-brand-blue hover:bg-brand-blue/10"
              data-testid="profile-add-company"
            >
              + {tHub("company.noCompanyCta")}
            </Link>
          </>
        )}
        <p className="text-xs leading-relaxed text-text-muted">
          {tHub("individual.desc")}
        </p>
      </section>

      <FeatureNote testId="feature-note-profile">
        {(await getTranslations("featureNotes"))("workerProfile")}
      </FeatureNote>

      {/* Unifying "professional passport" lead: states that CV, skills and
          work-journal evidence are ONE profile, shows each pillar's honest
          status from real saved data, carries the single not-verified
          disclaimer, and gives one primary next action + a bridge to the
          Work Journal. Uses only data already fetched above — no new reads,
          no invented counts. */}
      <ProfileHubOverview
        cvProvided={savedProfileText.trim().length > 0}
        selfDeclaredCount={savedSkillClaims.length + savedSkills.length}
        hasWorker={workerId !== null}
        journalCount={journalCount}
        skillEvidence={
          workerId
            ? deriveSkillEvidence(skillEvidenceInputs, savedSkillClaims.length)
            : undefined
        }
        // Identity-essential presence sourced from the ONE minimum card contract
        // (launch audit §7.3) — only data already fetched above, no new reads.
        cardSource={{
          fullName: profile?.full_name ?? null,
          email: profile?.email ?? null,
          avatarUrl: avatar.signedUrl,
          about: savedProfileText,
          skillsDeclared: savedSkillClaims.length + savedSkills.length,
        }}
      />

      {/* Honest "needs review" banner — only when real data shows declared
          skills not yet backed by work evidence (unsupported, incl. unmapped
          free-label claims). Never says "verified"; count is real. */}
      {workerId
        ? (() => {
            const ev = deriveSkillEvidence(
              skillEvidenceInputs,
              savedSkillClaims.length,
            );
            return (
              <SkillsReviewBanner
                count={ev.unsupported}
                title={t("reviewBanner.title")}
                body={t("reviewBanner.body")}
                cta={t("reviewBanner.cta")}
              />
            );
          })()
        : null}

      {/* Workstream C: the trust chain made VISIBLE on the person — counts
          straight from canonical tables (verified skills, manager
          confirmations, journal entries). Honest zeros with a growth hint. */}
      {workerId ? (
        <TrustBlock
          signals={await getOwnTrustSignals(workerId)}
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

      {/* Consolidated (P0 profile rescue): the ProfileHubOverview above is the
          SINGLE output summary — CV + skills + journal-evidence pillars (which
          also show what's missing), the compact "Supported by work entries: N",
          the not-verified disclaimer, and ONE next action. The former duplicate
          panels (ProfileCvClarityCard checklist, WorkerEvidenceCard, and the
          standalone ProfileProcessAssistant) were removed so the profile no
          longer splits into competing summary/evidence/helper panels. */}

      {workerId && employerOwnerProfileId && (
        <MessageButton profileId={employerOwnerProfileId} labelKey="messageCompany" />
      )}

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

      {/* Unified CAPABILITY surface — the canonical home for self-declared
          skills (`profile_skill_claims`) and worker work history. Always
          renders when the user has any saved chips OR any worker
          engagements. Self-declared chips are clearly labelled
          "Paties nurodyta · Nepatvirtinta išoriškai · source = profile_text"
          so they cannot be mistaken for externally verified claims, and
          they remain visible regardless of the user's currently-selected
          work category (PLATFORM_DOCTRINE §1: a person is not locked into
          one category). */}
      {/* IA cleanup v2 (#4): the profile leads with person identity (avatar,
          managed companies, skills text). The detailed capability + work-history
          surface is collapsed into a disclosure so the profile is no longer a
          work-history warehouse; the FULL work records live in Mano CV (linked
          here), not duplicated open on the profile. The canonical
          CapabilityProfileSection mount + order is preserved. */}
      <details id="capabilities" className="group scroll-mt-4 rounded-md border border-border-subtle bg-surface-1/40">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-label text-text-secondary hover:text-text-primary">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
            {tQuick("capabilities")}
          </span>
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <Link
            href="/dashboard/journal"
            className="w-fit font-mono text-[11px] uppercase tracking-label text-brand-blue hover:underline"
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
