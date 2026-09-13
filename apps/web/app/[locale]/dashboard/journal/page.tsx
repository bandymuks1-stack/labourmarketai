import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import {
  JournalEntryComposer,
  type JournalEngagement,
} from "@/components/app/journal-entry-composer";
import { JournalEntryRow } from "@/components/app/journal-entry-row";
import {
  WORKSPACE_ACCENT_DOT,
  WORKSPACE_PERSONAL_DOT,
} from "@/components/app/conversation/chat/workspace-chip";
import { workspaceAccentIndex } from "@/lib/company/organization-switch";
import { resolveEngagementContext } from "@/lib/journal/engagement-context-selection";
import { composeDistinctEngagementLabels } from "@/lib/journal/engagement-label";
import { detectUnrecordedHours } from "@/lib/journal/unrecorded-hours";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { JournalEntryEditLauncher } from "@/components/app/journal-entry-edit-launcher";
import {
  EvidenceStatusStrip,
  type EvidenceStatus,
} from "@/components/app/evidence-status-strip";
import { formatDuration } from "@/lib/journal/format-duration";
import { groupLinkedSkillIdsByEntry } from "@/lib/journal/journal-entry-skills";
import { buildEntrySkillSources } from "@/lib/journal/entry-skill-source";
import { readWorkerEntrySkillLinks } from "@/lib/journal/entry-skill-link-read";
import {
  deriveWorkVerificationState,
  type VerifierContextFacts,
} from "@/lib/journal/work-verification-state";
import {
  listJournalEntries,
  type JournalEntryListRow,
} from "@/lib/journal/journal-list-core";
import { buildEntryDetectedSignals } from "@/lib/journal/entry-detected-signals";
import { pendingEntryCandidates } from "@/lib/journal/entry-pending-candidates";
import { listActiveJournalTemplates } from "@/lib/journal/journal-templates";
import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";
import { buildEditingEntry } from "@/lib/journal/edit-entry";
import { readModuleFieldValues } from "@/lib/journal/journal-module-fields";
import { readOwnOccupationPath } from "@/lib/journal/journal-occupation-path";
import { PROFESSIONAL_HISTORY_RELATIONSHIPS } from "@/lib/player-card/work-history-model";
import {
  deriveReviewResult,
  deriveReviewTimeline,
} from "@/lib/journal/review-status";
import { EvidenceDecisionTimeline } from "@/components/app/evidence-decision-timeline";
import { EmptyState } from "@/components/app/empty-state";
import { JournalJobContext } from "@/components/app/journal-job-context";
import { createClient } from "@/lib/supabase/server";
import { processJournalEntrySkills } from "@/lib/journal/skill-pipeline";
import { JOURNAL_PIPELINE_VERSION } from "@/lib/journal/journal-recognition";
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";
import { Link } from "@/lib/i18n/navigation";
// Mano CV identity lead — the player-card/avatar identity is the visual layer
// at the TOP of the Mano CV surface (this work-records surface), with the work
// records below (owner IA: Mano CV = marketplace identity + work records).
import { DetailsHashOpener } from "@/components/app/details-hash-opener";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { WorkerReadinessPanel } from "@/components/app/worker-readiness-panel";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import {
  getOwnThermometer,
  toThermometerView,
} from "@/lib/market/thermometer-data";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { formatUtcDate } from "@/lib/time/display";
// ONE day-resolution rule for the Work Journal — the canonical work-time
// rule's own (`resolveWorkDayDetail`), the same one the work-in-numbers
// model groups by, so a record cannot sit on one day in the diary and
// another day in the period tile above it.
import { deriveEntryWorkTime, resolveWorkDayDetail } from "@/lib/journal/work-time";
import {
  WORK_PERIOD_KEYS,
  workPeriodBounds,
  type WorkPeriodKey,
} from "@/lib/journal/work-intelligence";
import {
  assembleWorkIntelligence,
  readOrganizationRecords,
  readPhotoCountsByEntry,
  type WorkerSkillSourceRow,
} from "@/lib/journal/work-intelligence-read";
// MANO DARBAS · MANO VEIKLA SKAIČIAIS (target worker IA 2026-09-13): this
// page records and lists; the figures have their own station
// (`/dashboard/work-in-numbers`). What stays here is ONE compact summary —
// the dominant-skill sentence and this period's hours — composed by the same
// presentation model and the same lead component the station renders.
import { Card } from "@/components/ui/Card";
import { DominantLead } from "@/components/app/work-in-numbers/dominant-lead";
import { scopeText } from "@/components/app/work-in-numbers/period-nav";
import {
  dominantAnswer,
  focusPeriod,
  skillRows,
  splitChecks,
  WORK_IN_NUMBERS_HREF,
} from "@/lib/journal/work-in-numbers-view";
import { resolveWorkLogLabels } from "@/components/app/conversation/chat/labels";
import { JournalQuickRecord } from "./quick-record";

// Worker-side relationships that grant access to the Work Journal (§13.1).
// A worker without an active engagement here has nothing to log against.
//
// The CANONICAL list, imported rather than re-declared: this page kept its own
// copy of the paid/contracted five, so a placement context (`student`,
// `volunteer`) that the chat work-log flow happily writes into was invisible
// here — the person's own entries rendered without their context and the
// editors could not name it (production 2026-09-11: one active student
// placement). A second list is exactly how the CV, the profile card and the
// chat selector drifted apart before (reconciliation 2026-09-07).
const HISTORY_RELATIONSHIPS = [...PROFESSIONAL_HISTORY_RELATIONSHIPS];

/** Worker "Mano dienoraštis" — the closed self-declare loop (M1). Logs work
 *  against an engagement context; entries stay private (visibility 'closed')
 *  until a manager confirms them (§13). */
export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{
    editing?: string | string[];
    date?: string | string[];
    skill?: string | string[];
    period?: string | string[];
    compose?: string | string[];
  }>;
}) {
  const { locale } = await params;
  const sp = (await searchParams) ?? {};
  // The full composer for a NEW record only behind the explicit "detaliau"
  // door (`?compose=full`); the compact text-first recording is the default.
  const composeFull = sp.compose === "full";
  const editingId =
    typeof sp.editing === "string" && sp.editing.trim().length > 0
      ? sp.editing.trim()
      : null;
  // Calendar-driven day navigation (owner UX recovery v1): ?date=YYYY-MM-DD
  // filters the records to ONE day. Anything not a plain ISO day is ignored.
  const selectedDate =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : null;
  // Evidence drill-down (W5 slice 3): ?skill=<slug> filters the records to
  // those linked to ONE of the worker's own skills — the player-card evidence
  // bars land here. Same shape as ?date=; anything not a plain slug is ignored.
  const skillFilterSlug =
    typeof sp.skill === "string" && /^[a-z0-9_-]{1,80}$/.test(sp.skill)
      ? sp.skill
      : null;
  // "Work in numbers" period (issue #1689): ?period=week|month|all scopes the
  // intelligence section. Anything else → all time. Same shape as ?date=.
  const periodKey: WorkPeriodKey =
    typeof sp.period === "string" &&
    (WORK_PERIOD_KEYS as readonly string[]).includes(sp.period)
      ? (sp.period as WorkPeriodKey)
      : "all";
  setRequestLocale(locale);
  const t = await getTranslations("journal");
  const tSpaces = await getTranslations("spaces");
  const tRel = await getTranslations("relationshipTypes");
  const tRole = await getTranslations("auth.signup.role");
  const tUnit = await getTranslations("productivityUnits");
  const tProf = await getTranslations("professions");
  const tIntel = await getTranslations("journal.intelligence");
  // The compact recorder rides the conversation's own readback + confirm
  // surface, so it speaks that surface's vocabulary — resolved here, on the
  // server, exactly as the dashboard resolves it for the chat.
  const workLogLabels = resolveWorkLogLabels(
    await getTranslations("conversation.worklog"),
  );
  // "Kam pateikti atliktą darbą?" — the verification-state vocabulary. One
  // key per canonical state and per next action; the page never spells the
  // words itself.
  const tVerify = await getTranslations("journal.verification");
  // The COLLAPSED card row is now the only thing naming the card on this page,
  // so it names it the way every other entry point does. `quickNav.identity`
  // stays shared with the profile hub's own `#profile-identity` anchor — one
  // target, one label, and no second vocabulary for the same object.
  const tTabs = await getTranslations("auth.dashboard.tabs");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Worker row, the submitter's own display name (owner UX recovery v1: every
  // journal entry names who submitted it), the active worker-side engagements
  // (the journal is only meaningful with one) and the active workspace.
  //
  // All four depend ONLY on `user.id` — none reads another's result — so they
  // travel as one round trip instead of four. `workspaceForDefault` in
  // particular is called with the literal "person" and is consumed further
  // down purely to ORDER `ecRows`; ordering after the batch is identical to
  // ordering after a serial await.
  const [
    { data: worker },
    { data: ownProfile },
    { data: ecRows },
    workspaceForDefault,
  ] = await Promise.all([
    supabase.from("workers").select("id").eq("profile_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
    supabase
      .from("engagement_contexts")
      .select(
        "id, relationship_slug, title, is_primary, journal_review_enabled, organization_id, status, started_at, ended_at, organizations(display_name, legal_name, organization_type)",
      )
      .eq("profile_id", user.id)
      .eq("status", "active")
      .in("relationship_slug", HISTORY_RELATIONSHIPS)
      .order("is_primary", { ascending: false }),
    getWorkspaceContext("person"),
  ]);
  const submitterName =
    ownProfile?.full_name ??
    (ownProfile?.email ? ownProfile.email.split("@")[0] : null);
  // State 4 vs 5: the worker has a context but review may not be enabled by
  // the owner yet. Honest signal — they can log work, but it won't be
  // confirmable until review is enabled for them.
  const anyReviewEnabled = (ecRows ?? []).some(
    (r) =>
      (r as { journal_review_enabled?: boolean }).journal_review_enabled ===
      true,
  );

  // WHICH CONTEXT DOES THIS WORK BELONG TO? (audit v1 FIRST_BROKEN_LINK)
  //
  // This used to order by active-workspace match then `is_primary` and default
  // to the first row. When the workspace was *person* that ranked the worker's
  // own org-less context first, so a worker WITH an employer, browsing as
  // themselves, logged into their personal context by default — and
  // `timesheet_compute_lines_v1` scopes by organization, so those hours could
  // reach nobody. Measured: 15 of the 18 live entries in an org-less context
  // were written by people who also hold an active org-scoped one.
  //
  // The hierarchy now decides (see lib/journal/engagement-context-selection):
  //   A source-determined · B exactly one org context · C several → ASK ·
  //   D none → personal is correct.
  // Ordering still puts the active workspace first so the list reads sensibly,
  // but the DEFAULT is the resolution, and on ambiguity there is none.
  const activeWorkspaceOrgId = workspaceForDefault.activeWorkspaceId;
  const ecOrdered = [...(ecRows ?? [])].sort(
    (a, b) =>
      Number(
        ((b as { organization_id?: string | null }).organization_id ?? null) ===
          activeWorkspaceOrgId,
      ) -
      Number(
        ((a as { organization_id?: string | null }).organization_id ?? null) ===
          activeWorkspaceOrgId,
      ),
  );

  const contextResolution = resolveEngagementContext({
    candidates: (ecRows ?? []).map((e) => {
      const r = e as {
        id: string;
        relationship_slug: string;
        organization_id?: string | null;
        status?: string | null;
        started_at?: string | null;
        ended_at?: string | null;
        is_primary?: boolean | null;
      };
      return {
        id: r.id,
        relationshipSlug: r.relationship_slug,
        organizationId: r.organization_id ?? null,
        // The query already filters to status='active'; carry it explicitly so
        // the pure model needs no knowledge of how it was fetched.
        status: r.status ?? "active",
        startedAt: r.started_at ?? null,
        endedAt: r.ended_at ?? null,
        isPrimary: r.is_primary === true,
      };
    }),
  });

  // ONE LABEL COMPOSER (issue #1689, defect J): the same facts the chat's
  // work-log selector hands to `composeDistinctEngagementLabels`, so a context
  // is named identically here and there. Rules live in
  // `lib/journal/engagement-label.ts`: an organization context reads "Org ·
  // Relationship" (the org TYPE label when it has no display/legal name —
  // never a bare "—"; existing role labels, no new i18n key); a personal one
  // reads "Asmeninis įrašas [· title]" — the person's own title is what tells
  // two org-less contexts apart (production holds exactly that case: one
  // untitled personal context carrying entries, one titled "Darbų vadovas");
  // a collision is qualified by the title, else the start month, never by a
  // word already present; and the list comes back pairwise distinct.
  const engagementLabelInputs = ecOrdered.map((e) => {
    const org = e.organizations as {
      display_name: string | null;
      legal_name: string | null;
      organization_type: string | null;
    } | null;
    const typeLabel =
      org?.organization_type === "company"
        ? tRole("company")
        : org?.organization_type === "agency"
          ? tRole("agency")
          : null;
    return {
      orgName: org?.display_name ?? org?.legal_name ?? null,
      orgTypeLabel: typeLabel,
      title: e.title ?? null,
      relationshipLabel: tRel(e.relationship_slug),
      personalEntryLabel: t("personalEntry"),
      isPersonal: !org,
      startedAt: (e as { started_at?: string | null }).started_at ?? null,
    };
  });
  const engagementLabels = composeDistinctEngagementLabels(engagementLabelInputs);
  const engagements: JournalEngagement[] = ecOrdered.map((e, i) => ({
    id: e.id,
    label: engagementLabels[i],
    isPrimary: e.is_primary,
    // Owner §12 — the editors compose archetype module fields from this.
    relationshipSlug: e.relationship_slug,
  }));

  /**
   * "KAM PATEIKTI ATLIKTĄ DARBĄ?" — the worker's own question, answered.
   * (Owner P0; the orphaned-work-records defect, connected 2026-09-07.)
   *
   * ── THE GAP THIS CLOSES ────────────────────────────────────────────────
   * `deriveWorkVerificationState` shipped on 2026-09-06 with the full state
   * model — and NOT ONE consumer. So the model existed and the worker was
   * still told nothing. Measured on production today: of 34 live journal
   * entries, **17 sit in an active `employee` engagement context that has no
   * organization at all**, and every one of them is unconfirmed. There are 56
   * such contexts. Half of all recorded work on this platform can reach no
   * verifier, and until now the product rendered that as an ordinary blank.
   *
   * This is the whole fix: the facts were already loaded (the contexts query
   * above already selects `organization_id`, `journal_review_enabled`,
   * `relationship_slug` and `status`), so connecting them costs one map and
   * no new read.
   *
   * It never invents a verifier and never marks anything verified — `verified`
   * is reachable only from a real recorded confirmation row.
   */
  const contextFacts = new Map<string, VerifierContextFacts>(
    (ecRows ?? []).map((r) => {
      const row = r as {
        id: string;
        organization_id?: string | null;
        journal_review_enabled?: boolean | null;
        relationship_slug?: string | null;
        status?: string | null;
      };
      return [
        row.id,
        {
          organizationId: row.organization_id ?? null,
          journalReviewEnabled: row.journal_review_enabled === true,
          relationshipSlug: row.relationship_slug ?? "employee",
          status: row.status ?? "active",
        },
      ];
    }),
  );

  /** Where the worker goes to name the employer this work was done for. The
   *  self-declared work-history editor writes the engagement context that a
   *  confirmation can then reach. */
  const IDENTIFY_VERIFIER_HREF = "/dashboard/profile#capabilities";

  // Workspace context chips (real-user workflow rebuild W1): a worker with
  // SEVERAL engagements reads their mixed stream with an explicit per-entry
  // context label + the SAME deterministic accent hue the workspace chip uses
  // for that organization. One engagement → no chip (no ambiguity to solve).
  const engagementChips = new Map<string, { label: string; dot: string }>(
    ecOrdered.map((e, i) => {
      const orgId = (e as { organization_id?: string | null }).organization_id;
      return [
        e.id,
        {
          label: engagements[i]?.label ?? "—",
          dot: orgId
            ? WORKSPACE_ACCENT_DOT[
                workspaceAccentIndex(orgId) % WORKSPACE_ACCENT_DOT.length
              ]
            : WORKSPACE_PERSONAL_DOT,
        },
      ];
    }),
  );

  if (!worker || engagements.length === 0) {
    // Fix C — distinguish the REAL reason there is no writable context, so
    // the worker knows the exact next step instead of a flat "no context".
    const pending = await listMyPendingWorkerInvitations();
    let hasRosterLink = false;
    let rosterOrgName: string | null = null;
    if (worker) {
      const [cw, aw] = await Promise.all([
        supabase
          .from("company_workers")
          .select("companies(display_name, legal_name)")
          .eq("worker_id", worker.id)
          .eq("status", "active")
          .limit(1),
        supabase
          .from("agency_workers")
          .select("agencies(legal_name)")
          .eq("worker_id", worker.id)
          .eq("status", "active")
          .limit(1),
      ]);
      hasRosterLink = (cw.data?.length ?? 0) > 0 || (aw.data?.length ?? 0) > 0;
      const cwOrg = (
        cw.data?.[0] as
          | {
              companies?: {
                display_name: string | null;
                legal_name: string | null;
              } | null;
            }
          | undefined
      )?.companies;
      const awOrg = (
        aw.data?.[0] as
          | { agencies?: { legal_name: string | null } | null }
          | undefined
      )?.agencies;
      rosterOrgName =
        cwOrg?.display_name ?? cwOrg?.legal_name ?? awOrg?.legal_name ?? null;
    }
    const contextState =
      pending.length > 0 ? "pending" : hasRosterLink ? "roster" : "none";
    // Surface the REAL org the worker is waiting on (no fabrication) — which
    // makes the canonical "owner must provision you" path concrete.
    const noContextOrg =
      contextState === "pending"
        ? (pending[0]?.orgName ?? null)
        : contextState === "roster"
          ? rosterOrgName
          : null;
    return (
      <div className="flex flex-col gap-6">
        <TelemetryView
          event={FUNNEL_EVENTS.journalViewed}
          metadata={{ surface: "journal", step: "no_context" }}
        />
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("navTitle")}
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("navSubtitle")}
          </p>
        </header>
        <div className="card-border max-w-2xl p-6">
          <p className="text-sm leading-relaxed text-text-secondary">
            {noContextOrg
              ? t(`noContext.${contextState}Named`, { org: noContextOrg })
              : t(`noContext.${contextState}`)}
          </p>
          {/* Every no-context state gets a real next step — a primary-tab
              page must never dead-end (audit finding F-W2). */}
          <div className="mt-3 flex flex-wrap gap-2">
            {contextState === "none" && (
              <Link
                href="/dashboard/profile"
                className="inline-flex items-center gap-1.5 rounded-md border border-brand-blue px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-blue/80"
              >
                {t("noContextProfileCta")}
              </Link>
            )}
            <Link
              href="/dashboard"
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold text-text-primary ${
                contextState === "none"
                  ? "border-ink-500 hover:border-brand-blue"
                  : "border-brand-blue hover:border-brand-blue/80"
              }`}
            >
              {t("noContextCta")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // The worker's work directions (primary + additional) for the entry form —
  // so the journal is no longer locked to one tiler template — and the
  // worker's declared skills.
  //
  // ONE read of `worker_skills`, not two. This page used to issue the same
  // query twice against the same table with the same `worker_id` filter: once
  // selecting `skills(slug)` and once selecting `skill_id, verified,
  // skills(slug)`. The second is a strict superset of the first, so both the
  // composer's suggestion list and the entry↔skill link UI are derived from
  // it. Both reads depend only on `worker.id`, so they batch with the directions read.
  //
  // The entry-skill link read and the entries read below depend only on
  // `worker.id` too, so they ride in this same round trip. Both used to await
  // serially further down, which put four DB round trips on the critical path
  // where two suffice: this batch, then the templates read that genuinely
  // needs `directions`. Read ORDER is unchanged where it matters — the links
  // are still read before the lazy heal writes to `journal_entry_skills`.
  //
  // The directions read is the occupation path of the universal journal
  // (owner §12): each of the worker's professions with the ISCO-08 group its
  // ESCO occupation belongs to (`professions.esco_uri` →
  // `esco_occupations.isco_group`), so the editors compose exactly the module
  // fields that family logs. Two bounded reads inside one batch slot; an
  // unmapped profession carries null and composes nothing.
  const [ownPath, { data: skillIdRows }, linkRead, entriesRead, organizationRecords] =
    await Promise.all([
      readOwnOccupationPath(supabase, worker.id),
      supabase
        .from("worker_skills")
        .select("skill_id, verified, source, skills(slug)")
        .eq("worker_id", worker.id),
      readWorkerEntrySkillLinks(supabase, worker.id),
      // G4 bridge: THE canonical journal-list core (v3 select + legacy
      // fallback + live filter) — the same read the `journal.list`
      // capability serves external clients.
      listJournalEntries(
        { supabase, userId: user.id },
        { workerId: worker.id },
      ),
      // The organization's own hour records about this person (owner §19:
      // timesheet lines, imported documents) — read beside the diary so
      // "work in numbers" can name the second ledger instead of hiding it.
      // RLS: the person's own rows. A failed read is null (UNKNOWN).
      readOrganizationRecords(supabase, worker.id),
    ]);
  const directions = ownPath.directions.map((d) => ({
    slug: d.slug,
    name: tProf(d.slug),
    iscoGroup: d.iscoGroup,
  }));

  // Journal Proof Engine v1 (§10): ACTIVE profession templates from the
  // journal_profession_templates registry (owner-gated draft migration
  // 20260714180000). Registry missing / no active rows → [] and the composer
  // shows no picker (honest absence).
  const journalTemplates = await listActiveJournalTemplates(
    directions.map((d) => d.slug),
    locale,
  );

  // Worker's saved skills — used by the composer to surface
  // "this entry could strengthen X" suggestions for the rule-based parser.
  // Derived from the single `worker_skills` read above.
  const tSkillName = await getTranslations("skillNames");
  const workerSkills = (skillIdRows ?? [])
    .map((r) => (r.skills as { slug: string | null } | null)?.slug ?? null)
    .filter((slug): slug is string => !!slug)
    .map((slug) => ({ slug, name: tSkillName(slug) }));

  // Journal Entry ↔ Skill links v1 — the worker's declared skills (id + name)
  // they can mark an entry as supporting, plus their current durable links.
  // `verified` rides along so a manager/client-confirmed skill can read as
  // "confirmed" on the entry chip (stale-skill review state, PR B).
  //
  // `slug` rides along for the render-time detected-signal computation (it is
  // structurally invisible to the {id,name} link-UI props).
  const availableSkillsForLinks = (skillIdRows ?? [])
    .map((r) => {
      const slug = (r.skills as { slug: string | null } | null)?.slug ?? null;
      return slug && r.skill_id
        ? { id: r.skill_id as string, name: tSkillName(slug), slug }
        : null;
    })
    .filter((x): x is { id: string; name: string; slug: string } => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Localized taxonomy name for a recognized slug the worker has NOT declared
  // (render-time detected section). Missing name → null → the slug is skipped,
  // never leaked raw into the UI (same guard shape as the composer's
  // tSkillSafe).
  const skillNameOf = (slug: string): string | null => {
    try {
      const v = tSkillName(slug);
      return v && v !== slug && v !== `skillNames.${slug}` ? v : null;
    } catch {
      return null;
    }
  };

  // Real signals for the per-entry chip SOURCE (PR B): skill id → slug, and the
  // set of confirmed (verified) skill ids. The recognizable vocabulary is the
  // recognizer's full known-skill slug set — a linked skill INSIDE it that the
  // entry text does not support is the stale/suspicious case ("Reikia peržiūrėti").
  const idToSlug = new Map<string, string>();
  const declaredSlugSet = new Set(availableSkillsForLinks.map((s) => s.slug));
  const verifiedSkillIds = new Set<string>();
  for (const r of skillIdRows ?? []) {
    const slug = (r.skills as { slug: string | null } | null)?.slug ?? null;
    if (r.skill_id && slug) idToSlug.set(r.skill_id as string, slug);
    if (r.skill_id && (r as { verified?: boolean }).verified) {
      verifiedSkillIds.add(r.skill_id as string);
    }
  }
  const recognizableSlugs = new Set(SKILL_HINTS_LT.map((h) => h.slug));

  // Durable links read — gracefully no-ops if the migration is not applied yet
  // (mirrors the v3-column fallback below), so the page stays renderable.
  // PR-C: the read now also carries each link's stored write-time origin,
  // with an automatic pre-migration fallback (lib/journal/entry-skill-link-read).
  let linksByEntry = new Map<string, string[]>();
  let skillLinksReady = false;
  const provenanceByEntry = linkRead.provenanceByEntry;
  if (linkRead.ok) {
    skillLinksReady = true;
    linksByEntry = groupLinkedSkillIdsByEntry(linkRead.rows);
  }

  // Entries with their metrics + confirmation status — read through THE
  // canonical journal-list core (G4): v3 lifecycle select (deleted_at,
  // superseded_by hidden), legacy projection fallback while migration 0018
  // is unapplied, newest first. A failed read renders as an empty list,
  // exactly as the inline query degraded before the extraction.
  type JournalEntryRow = JournalEntryListRow;
  const entries: JournalEntryRow[] | null = entriesRead.ok
    ? entriesRead.entries
    : null;

  // ── Lazy historical heal (Universal Journal Recall v2) ──────────────────
  // Up to 5 own live entries whose latest `pipeline_version` metric is below
  // the current pipeline version (or absent) are re-processed on page load —
  // idempotent, bounded per request, and NEVER blocks rendering on failure.
  // This heals ALL live historical entries progressively with zero admin
  // machinery. Counts-only logging happens inside the pipeline itself.
  {
    const stale = (entries ?? [])
      .filter((e) => {
        const latest = Math.max(
          0,
          ...(e.journal_entry_metrics ?? [])
            .filter((m) => m.metric_slug === "pipeline_version")
            .map((m) => m.value_numeric ?? 0),
        );
        return latest < JOURNAL_PIPELINE_VERSION;
      })
      .slice(0, 5);
    for (const e of stale) {
      try {
        await processJournalEntrySkills({
          entryId: e.id,
          text: e.original_text ?? "",
          locale,
          revalidate: false,
        });
      } catch {
        // Heal is best-effort — a failure never blocks the page.
      }
    }
  }

  // EDIT preload (v5): when the worker arrived via ?editing=<id>, reconstruct
  // the entry's FULL editable state (text + date + hours/quantity + direction +
  // linked skills) so a text-only edit re-sends them and never silently drops
  // structured data. Only UNCONFIRMED entries are eligible (a confirmed id is
  // ignored — confirmed entries need the explicit correction-request flow).
  const skillIdToSlug = new Map<string, string>();
  for (const r of skillIdRows ?? []) {
    const slug = (r.skills as { slug: string | null } | null)?.slug ?? null;
    if (r.skill_id && slug) skillIdToSlug.set(r.skill_id as string, slug);
  }
  const editingRow = editingId
    ? ((entries ?? []).find(
        (e) =>
          e.id === editingId &&
          (e.journal_entry_confirmations ?? []).length === 0,
      ) ?? null)
    : null;
  const editingEntry = editingRow
    ? buildEditingEntry({
        id: editingRow.id,
        originalText: editingRow.original_text,
        metrics: editingRow.journal_entry_metrics,
        engagementContextId: editingRow.engagement_context_id ?? null,
        linkedSkillSlugs: (linksByEntry.get(editingRow.id) ?? [])
          .map((sid) => skillIdToSlug.get(sid))
          .filter((s): s is string => !!s),
      })
    : null;

  // Evidence Status Strip (v1) for the list status zone — a compact legend
  // showing which honest states the worker's entries are actually in. Derived
  // purely from the existing review result; "confirmed" lights up ONLY when a
  // real approved confirmation exists, never automatically.
  const evidenceStatuses = (entries ?? []).map((e) =>
    deriveReviewResult(e.journal_entry_confirmations),
  );

  // Diary day-grouping (CV/records feed cleanup): the feed reads as a dated
  // diary — entries collapse under ONE day header instead of repeating the
  // date on every card. Key AND label are both the canonical UTC day (W12
  // timezone consistency): the key feeds `?date=`, which the planning
  // projection resolves in UTC, so deriving it in the ambient zone put the
  // group header and the agenda on different days for anyone off UTC.
  // Entries arrive created_at-desc, so consecutive same-day rows group in
  // order; no sort, no new data.
  const entryDayGroups: {
    key: string;
    label: string;
    /** ISO day (YYYY-MM-DD) — the ?date= navigation key for this group. */
    isoKey: string;
    totalMinutes: number;
    entries: JournalEntryRow[];
  }[] = [];
  /**
   * THE DAY AN ENTRY BELONGS TO — the day WORKED, resolved by THE canonical
   * work-time rule (`resolveWorkDayDetail`, work-time.ts).
   *
   * THE REGRESSION THIS CLOSES. The calendar started placing entries on their
   * own `work_date`; this page kept grouping by `created_at`. The same entry
   * then had two different days depending on which surface you asked, and the
   * diary's own "open in calendar" link — built from THIS key — sent the worker
   * to a day the calendar had just moved the entry off, landing them on an
   * empty day view. Yesterday's shift logged tonight is the ordinary case, so
   * this was not an edge: it was the normal path.
   *
   * DIARY DAY = MODEL DAY (issue #1689, lane B). The page then picked the
   * FIRST `work_date` row it found, while the model (`deriveEntryWorkTime`
   * → `resolveWorkDayDetail`) takes the LATEST stated one — an entry whose
   * work date was corrected sat under its old day in the diary and under
   * its corrected day in the period tile above it. One rule now decides the
   * day for the diary card, the calendar and every figure. `created_at`
   * remains the fallback for entries that never carried a work date.
   */
  const isoDayOf = (e: JournalEntryRow): string =>
    resolveWorkDayDetail(e.journal_entry_metrics ?? [], e.created_at).day;
  // Evidence drill-down (W5 slice 3): resolve ?skill= against the worker's
  // OWN skill set and narrow the diary to entries linked to it. Unknown slug
  // or links unavailable → no filter, never an invented empty diary. The
  // filter feeds ONLY the diary grouping — profile strips and CV-bridge
  // counts stay global truths (the ?date= precedent).
  const skillFilter =
    skillFilterSlug && skillLinksReady
      ? (availableSkillsForLinks.find((s) => s.slug === skillFilterSlug) ?? null)
      : null;
  const diaryEntries = skillFilter
    ? (entries ?? []).filter((e) =>
        (linksByEntry.get(e.id) ?? []).includes(skillFilter.id),
      )
    : (entries ?? []);
  // Entries arrive `created_at`-desc, which is no longer the same order as the
  // day worked — so they are re-sorted by the resolved day before grouping.
  // Without this an entry logged today for last week would open its own group
  // between two of today's rows instead of joining last week's day.
  const diaryEntriesByDay = [...diaryEntries].sort((a, b) => {
    const cmp = isoDayOf(b).localeCompare(isoDayOf(a));
    return cmp !== 0 ? cmp : b.created_at.localeCompare(a.created_at);
  });
  for (const e of diaryEntriesByDay) {
    const isoKey = isoDayOf(e);
    const label = formatUtcDate(isoKey, locale) ?? "";
    // Day total through THE canonical work-time rule (owner ruling
    // 2026-08-18). This used to read only the entry-level `quantity` metric,
    // so an entry recorded as per-activity fragments ("3 val. plyteles, 2 val.
    // glaistas") showed NO hours here while the calendar and the timesheet
    // showed 5 — the exact three-answers defect `work-time.ts` was written to
    // end. `days`-unit and non-time quantities still never become hours.
    const mins = Math.round(
      deriveEntryWorkTime({
        entryId: e.id,
        createdAt: e.created_at,
        originalText: e.original_text,
        metrics: e.journal_entry_metrics ?? [],
      }).totalHours * 60,
    );
    const last = entryDayGroups[entryDayGroups.length - 1];
    // Keyed by the ISO day, not by the formatted label: two different days can
    // format identically in some locales, and the key is what `?date=` filters
    // on — so the label must never be the identity.
    if (last && last.isoKey === isoKey) {
      last.entries.push(e);
      last.totalMinutes += mins;
    } else {
      entryDayGroups.push({
        key: isoKey,
        label,
        isoKey,
        totalMinutes: mins,
        entries: [e],
      });
    }
  }
  // Day filter (calendar-driven navigation): a selected ?date= narrows the
  // diary to that one day; no match → the full diary with an honest note.
  const filteredDayGroups = selectedDate
    ? entryDayGroups.filter((g) => g.isoKey === selectedDate)
    : entryDayGroups;
  const dayFilterActive = selectedDate !== null && filteredDayGroups.length > 0;
  const visibleDayGroups = dayFilterActive ? filteredDayGroups : entryDayGroups;
  const journalEvidenceActive: EvidenceStatus[] = ["self_declared"];
  if (
    evidenceStatuses.some((s) => s === "submitted" || s === "changes_requested")
  )
    journalEvidenceActive.push("awaiting_confirmation");
  if (evidenceStatuses.some((s) => s === "approved"))
    journalEvidenceActive.push("confirmed");

  // Journal → CV bridge (IA: one path between the work log and the CV it
  // feeds). Honest counts only — confirmed entries are what surface as proof
  // on the Verified CV; the link makes that relationship visible instead of
  // leaving the worker to wonder where a logged entry "went".
  const confirmedEntryCount = evidenceStatuses.filter(
    (s) => s === "approved",
  ).length;
  const totalEntryCount = (entries ?? []).length;

  // Proof-engine loop strip (Sprint v2 §3) — the journal is the PROOF ENGINE,
  // not a diary: one dense line showing the real loop state from data already
  // loaded on this page (no extra queries): entries in the model's 30-day
  // period (`entriesThisMonth`, derived below the model), distinct declared
  // skills with journal-entry evidence links, manager/client CONFIRMED
  // skills. Counts are honest zeros until real activity exists.
  const evidencedSkillIds = new Set<string>();
  for (const ids of linksByEntry.values()) {
    for (const id of ids) evidencedSkillIds.add(id);
  }

  // "Work in numbers" (issue #1689): derived from EXACTLY the entries, links
  // and declared skills loaded above — no second read, so the figures can
  // never disagree with the diary beneath them. Unreadable entries or links
  // → the section is withheld rather than rendered as zero hours (SEP-7).
  const todayIso = new Date().toISOString().slice(0, 10);
  const workIntelligence =
    entries && skillLinksReady
      ? assembleWorkIntelligence({
          entries,
          linksByEntry,
          provenanceByEntry,
          skillRows: (skillIdRows ?? []) as unknown as WorkerSkillSourceRow[],
          todayIso,
          focus: periodKey,
          coverage: entriesRead.ok
            ? {
                entriesRead: entriesRead.coverage.entriesRead,
                truncated: entriesRead.coverage.truncated,
                linksTruncated: linkRead.truncated,
              }
            : undefined,
          // Evidence strength needs to know which entries carry photos —
          // one bounded read over the live ids already in hand.
          photoCountByEntry: await readPhotoCountsByEntry(
            supabase,
            entries.map((e) => e.id),
          ),
          organizationRecords,
        })
      : null;
  // THE STRIP'S MONTH IS THE MODEL'S (issue #1689, lane B). This counted
  // entries by the `created_at` CALENDAR month while the section's "30
  // days" tile counted by the work day over a rolling window — two numbers
  // for one word. The strip now reads the model's own `month` row (30 UTC
  // days ending today, by the day WORKED) and names it with the section's
  // period label. When the model is withheld (links unreadable) the same
  // rule is applied by hand over the loaded entries — the model's day and
  // the model's bounds, never a third definition.
  const monthBounds = workPeriodBounds("month", todayIso);
  const entriesThisMonth =
    workIntelligence?.periods.find((p) => p.key === "month")?.entries ??
    (entries ?? []).filter((e) => {
      const day = resolveWorkDayDetail(e.journal_entry_metrics ?? [], e.created_at).day;
      return day >= (monthBounds.startIso ?? day) && day <= monthBounds.endIso;
    }).length;
  // The profession / unit / context label helpers the full figures block
  // needed moved with it to the station (`numbers/page.tsx`); the summary
  // card here names skills only, through the one catalogue reader above.

  // Mano CV identity lead — the player-card/avatar identity that opens the Mano
  // CV surface, above the work records. Worker-scoped real data only (null for
  // non-worker accounts, which never reach this branch). The same premium card
  // used elsewhere; `/dashboard/player-card` redirects here.
  //
  // Four serial reads become two round trips, issuing exactly the same set of
  // reads as before: the avatar never depended on the card, and the labels and
  // the thermometer are both gated on the SAME `manoCard` non-null check — so
  // they resolve together, and neither is fetched when there is no card.
  const [manoCard, manoAvatar] = await Promise.all([
    getWorkerPlayerCard(),
    getOwnAvatar(),
  ]);
  const [manoCardLabels, manoThermometer] = manoCard
    ? await Promise.all([
        buildPlayerCardLabels(manoCard),
        getOwnThermometer().then(toThermometerView),
      ])
    : [null, null];

  return (
    <div className="flex flex-col gap-6">
      <TelemetryView
        event={FUNNEL_EVENTS.journalViewed}
        metadata={{ surface: "journal" }}
      />
      <header id="mano-cv-top" className="flex flex-col gap-1 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("navTitle")}
          </h1>
          <Link
            href="/dashboard"
            className="shrink-0 rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
            data-testid="room-my-spaces-link"
          >
            {tSpaces("mySpaces")} →
          </Link>
        </div>
        <p
          className="text-sm leading-relaxed text-text-secondary"
          data-testid="journal-nav-subtitle"
        >
          {t("navSubtitle")}
        </p>
      </header>

      {/* The page-local quick-nav strip is gone (target worker IA 2026-09-13
          §4: a second nav strip is card soup) — three first-level blocks
          lead on a phone: recording, today's records, one numbers card. */}

      {/* Mano CV identity lead: player-card/avatar identity at the top of the
          Mano CV surface; the work records follow below. IA cleanup v2 (#5):
          the readiness PANEL (detailed pillars + next steps) is collapsed into
          a disclosure so the readiness signal is shown ONCE prominently (the
          player card), not twice stacked — the actionable detail stays one tap
          away without lengthening the page. */}
      {/* Owner UX recovery v1: the journal leads with the WORK RECORDS, not
          the CV identity. The player card (and its readiness detail) stays
          one tap away in a single disclosure — the diary is no longer pushed
          below a full identity block on every visit. */}
      {/* OWNER RULING 2026-08-28 — SUPERSEDES the 2026-07-30 always-open rule.
          That rule existed for ONE reason: a closed disclosure made the avatar
          menu's "Mano kortelė" deep-link land on a 40px summary row. The link
          was the casualty, not the collapse. #1317 removed that limitation by
          generalising `DetailsHashOpener` — it opens the disclosure for its own
          id AND for any id nested inside it — so the deep link now arrives at an
          OPEN card whether or not the default is open.
          With the technical reason gone, the default reverts to what the page is
          for: the Journal's first viewport is the work RECORDS and the composer,
          not 2118px of identity block the visitor did not ask for on every
          visit. Nothing is hidden and nothing moves: the same card, the same
          readiness panel, the same anchor, the same quick-nav entry and the same
          avatar-menu link — one tap, or zero taps when you arrived by link. */}
      {manoCard && manoCardLabels ? (
        <details
          id="mano-cv-identity"
          className="group order-4 rounded-md border border-border-subtle bg-surface-1/50 scroll-mt-20"
          data-testid="mano-cv-player-card-lead"
        >
          <summary className="cursor-pointer list-none px-4 py-2.5 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="transition-transform group-open:rotate-90"
              >
                ›
              </span>
              {tTabs("playerCard")}
            </span>
          </summary>
          {/* The deep link is what made this disclosure open-by-default; this
              is the mechanism that replaces it. Mounted INSIDE the disclosure
              so it can never be separated from the element it answers for. */}
          <DetailsHashOpener targetId="mano-cv-identity" />
          <div className="flex flex-col gap-4 px-4 pb-4">
            <WorkerPlayerCard
              card={manoCard}
              labels={manoCardLabels}
              thermometer={manoThermometer}
              avatarUrl={manoAvatar.signedUrl}
            />
            <WorkerReadinessPanel card={manoCard} />
          </div>
        </details>
      ) : null}

      {/* P0 UX rescue: removed the read-only project-context note and the
          self-progress counter (noise, not actionable here). The pilot note is
          kept but demoted to ONE compact footnote — it is guard-required
          (journal-evidence-clarity + product-readiness) and stays honest
          (private + not yet externally confirmed). */}
      <p className="order-6 text-meta leading-relaxed text-text-muted">
        {t("pilotBackboneNote")}
      </p>

      {/* v4 — when the worker arrived via ?editing=<id> from the entries
          list, prefill the composer with that entry's original_text and
          flip its save path to the supersede RPC. Only unconfirmed
          entries are eligible (the lookup filters by zero confirmations);
          a confirmed-id is silently ignored so the worker can't be tricked
          into "editing" a confirmed entry — they would need the explicit
          correction-request UI for that. */}
      {!anyReviewEnabled && (
        <p
          className="order-5 text-meta leading-relaxed text-text-muted"
          data-testid="journal-review-not-enabled-note"
        >
          {t("reviewNotEnabledNote")}
        </p>
      )}
      {/* RECORDING FIRST (target worker IA 2026-09-13 §2, "Mano darbas"):
          the compact text-first flow is the default — one sentence (what ·
          where · how long · optional photo) → the readback of what was
          understood → one confirm — over the SAME deterministic reader and
          the SAME createJournalEntry path the conversation uses. The full
          composer renders for an EDIT (?editing=<id> — the supersede path
          stays canonical) and behind the explicit "detaliau" door
          (?compose=full); it is never the first thing a worker sees. The
          conversation and the voice door stay reachable as text links inside
          the recorder (§1.5: nothing removed). */}
      <div id="journal-composer" className="order-1">
        {editingEntry ? (
          <div className="flex flex-col gap-2">
            <JournalEntryComposer
              // Remount the composer whenever the edit target changes (see
              // git history: stale create-mode text on client-side ?editing
              // navigation).
              key={editingId ?? "new"}
              engagements={engagements}
              contextResolution={contextResolution}
              directions={directions}
              workerSkills={workerSkills}
              editingEntry={editingEntry}
              templates={journalTemplates}
            />
          </div>
        ) : composeFull ? (
          <div className="flex flex-col gap-2" data-testid="journal-compose-full">
            <JournalEntryComposer
              key="new"
              engagements={engagements}
              contextResolution={contextResolution}
              directions={directions}
              workerSkills={workerSkills}
              templates={journalTemplates}
            />
            <Link
              href={"/dashboard/journal#journal-composer" as "/dashboard"}
              className="inline-flex min-h-11 items-center self-start text-support font-medium text-brand-blue underline-offset-4 hover:underline"
              data-testid="journal-compose-full-back"
            >
              ← {t("record.detailedBack")}
            </Link>
          </div>
        ) : (
          <JournalQuickRecord
            locale={locale}
            labels={workLogLabels}
            otherDoors={
              <p
                className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-muted"
                data-testid="journal-log-via-chat"
              >
                <span>{t("logViaChatBody")}</span>
                <Link
                  // `?intent=log-work` — the chat opens the work-log flow on
                  // arrival, never the generic greeting.
                  href={"/dashboard?intent=log-work" as "/dashboard"}
                  className="inline-flex min-h-11 items-center font-medium text-brand-blue hover:underline"
                  data-testid="journal-log-via-chat-cta"
                >
                  {t("logViaChatCta")} →
                </Link>
                {/* W5 slice 2: the voice surface keeps its door. */}
                <Link
                  href="/dashboard/journal/voice"
                  className="inline-flex min-h-11 items-center font-medium text-brand-blue hover:underline"
                  data-testid="journal-log-via-voice-cta"
                >
                  {t("logViaVoiceCta")} →
                </Link>
                <Link
                  href={"/dashboard/journal?compose=full#journal-composer" as "/dashboard"}
                  className="inline-flex min-h-11 items-center font-medium text-brand-blue hover:underline"
                  data-testid="journal-compose-full-link"
                >
                  {t("record.detailed")} →
                </Link>
              </p>
            }
          />
        )}
      </div>

      {/* MANO VEIKLA SKAIČIAIS — one compact card (target IA §2): the
          dominant-skill sentence and this period's hours, from the SAME
          model the diary beneath was derived from, with the station as the
          figures' stable destination. UNKNOWN (unreadable entries or links)
          is said as such — never a zero that reads as "no work" (SEP-7). */}
      {(() => {
        const wi = workIntelligence;
        const rows = wi ? skillRows(wi, skillNameOf).filter((r) => r.name !== null) : [];
        const answer = dominantAnswer(wi, rows);
        const period = wi ? focusPeriod(wi) : null;
        const scope = wi ? scopeText(wi, locale, tIntel) : tIntel("numbers.scope.all");
        const openChecks = wi ? splitChecks(wi.checks).open.length : 0;
        return (
          <section
            id="work-intelligence"
            className="order-3 scroll-mt-20"
            data-testid="journal-numbers-summary"
            data-answer={answer.kind}
            data-period={wi?.scope ?? periodKey}
          >
            <Card compact className="flex flex-col gap-3">
              <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
                {tIntel("numbers.stationTitle")}
              </h2>
              <DominantLead
                answer={answer}
                period={period}
                scope={scope}
                locale={locale}
                t={tIntel}
                compact
              />
              {openChecks > 0 ? (
                <p
                  className="text-meta leading-relaxed text-state-warning"
                  data-testid="journal-numbers-open-checks"
                  data-open-checks={openChecks}
                >
                  {tIntel("numbers.checksOpen", { count: openChecks })}
                </p>
              ) : null}
              <Link
                href={
                  `${WORK_IN_NUMBERS_HREF}?period=${wi?.focus ?? periodKey}` as "/dashboard"
                }
                className="inline-flex min-h-11 items-center self-start text-support font-medium text-brand-blue underline-offset-4 hover:underline"
                data-testid="journal-numbers-link"
              >
                {tIntel("numbers.openStation")} →
              </Link>
            </Card>
          </section>
        );
      })()}

      {/* Entry list — compact recent history AFTER the composer (Wagon 5
          first-view order). Newest day open, older days collapsed. Visual
          order is set with `order-*` on these flex-column children. */}
      <section
        id="journal-entries"
        className="order-2 flex flex-col gap-3 scroll-mt-4"
        data-testid="journal-entries"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-baseline gap-2 font-display text-lg font-semibold text-text-primary">
            {t("listTitle")}
            {(entries ?? []).length > 0 && (
              <span
                className="font-mono text-xs font-normal text-text-muted"
                data-testid="journal-entries-count"
              >
                {(entries ?? []).length}
              </span>
            )}
          </h2>
          {/* The ONE primary action lives in the log-via-chat block above
              (owner audit §6.1) — no duplicate gradient CTA here. */}
        </div>
        {/* Evidence drill-down (W5 slice 3): a player-card evidence bar lands
            here with ?skill=<slug>. The strip names the active filter and the
            REAL count, and offers the one way back — never a silent subset. */}
        {skillFilter && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-2"
            data-testid="journal-skill-filter"
          >
            <span className="text-sm leading-relaxed text-text-primary">
              {t("skillFilterActive", {
                name: skillFilter.name,
                count: diaryEntries.length,
              })}
            </span>
            <Link
              href={"/dashboard/journal#journal-entries" as "/dashboard"}
              data-testid="journal-skill-filter-clear"
              className="inline-flex min-h-[2rem] items-center rounded-md border border-ink-500 px-2.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              {t("skillFilterClear")}
            </Link>
          </div>
        )}
        {/* Calendar-driven day navigation (owner UX recovery v1): the diary's
            days as compact chips — tap a day to see exactly that day, tap the
            calendar link to see the SAME day with bookings, projects and
            tasks on the one canonical calendar. Real days only (only days
            that actually have entries become chips). */}
        {entryDayGroups.length > 1 && (
          <nav
            aria-label={t("dayNav.title")}
            data-testid="journal-day-nav"
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            <Link
              href={"/dashboard/journal#journal-entries" as "/dashboard"}
              data-testid="journal-day-nav-all"
              aria-current={!dayFilterActive ? "page" : undefined}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                !dayFilterActive
                  ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue"
              }`}
            >
              {t("dayNav.all")}
            </Link>
            {entryDayGroups.slice(0, 21).map((g) => (
              <Link
                key={g.isoKey}
                href={
                  `/dashboard/journal?date=${g.isoKey}#journal-entries` as "/dashboard"
                }
                data-testid={`journal-day-nav-${g.isoKey}`}
                aria-current={
                  dayFilterActive && selectedDate === g.isoKey ? "page" : undefined
                }
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors ${
                  dayFilterActive && selectedDate === g.isoKey
                    ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                    : "border-ink-500 text-text-secondary hover:border-brand-blue"
                }`}
              >
                {formatUtcDate(g.isoKey, locale, {
                  month: "short",
                  day: "numeric",
                })}
                <span className="ml-1 text-meta text-text-muted">
                  {g.entries.length}
                </span>
              </Link>
            ))}
            {dayFilterActive && selectedDate && (
              <Link
                href={
                  `/dashboard/planning?view=day&date=${selectedDate}` as "/dashboard"
                }
                data-testid="journal-day-open-calendar"
                className="ml-auto shrink-0 rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
              >
                {t("dayNav.openInCalendar")} →
              </Link>
            )}
          </nav>
        )}
        {/* Wagon 5 first view: the status/legend/count lines are REAL and
            stay word-for-word — but behind ONE deliberate disclosure, so the
            default view is input + history, not a wall of technical status.
            (journal-evidence-clarity honesty copy unchanged inside.) */}
        <details
          className="group rounded-md border border-border-subtle bg-surface-1/40"
          data-testid="journal-status-details"
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary">
            {t("statusExplainer")}
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3">
        {/* Honest "who can confirm" line above the entry list: the status chips
            below show "confirmed / awaiting", so name plainly who can actually
            move an entry to confirmed today — only manager / owner / external
            (client) manager. Until then it stays self-declared. No broad
            confirmer is implied. */}
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="journal-who-can-confirm"
        >
          {t("whoCanConfirm")}
        </p>
        {/* Evidence Status Strip — one compact legend in the status zone (not
            per row, to avoid overloading the list) that visually separates a
            worker's own self-declared record from a real confirmation. */}
        {(entries ?? []).length > 0 && (
          <EvidenceStatusStrip
            active={journalEvidenceActive}
            data-testid="journal-evidence-status-strip"
          />
        )}
        {/* Journal → CV bridge: make the one path between the work log and the
            CV it feeds visible. Honest counts only when entries exist; with no
            entries yet the line stays as a quiet zero-state so the direct CV
            link is ALWAYS reachable from the journal (cv-workspace-ia). */}
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="journal-cv-bridge"
        >
          {totalEntryCount > 0
            ? t("cvBridge", {
                confirmed: confirmedEntryCount,
                total: totalEntryCount,
              })
            : t("cvBridgeEmpty")}{" "}
          <Link
            href="/cv"
            className="font-medium text-brand-blue hover:underline"
            data-testid="journal-cv-bridge-link"
          >
            {t("cvBridgeLink")} →
          </Link>
        </p>
        {/* Proof-engine loop strip — ONE dense row, real counts only:
            įrašai → įgūdžių įrodymai → CV → pasiūlymai. */}
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="journal-proof-loop"
        >
          {t("proofLoop.stripPeriod", {
            entries: entriesThisMonth,
            period: t("intelligence.period.month"),
            evidenced: evidencedSkillIds.size,
            confirmed: verifiedSkillIds.size,
          })}{" "}
          <Link
            href="/cv"
            className="font-medium text-brand-blue hover:underline"
            data-testid="journal-proof-loop-cv-link"
          >
            {t("proofLoop.cvLink")} →
          </Link>
        </p>
          </div>
        </details>
        {(entries ?? []).length === 0 ? (
          <EmptyState
            testId="journal-empty-state"
            title={t("listEmptyTitle")}
            why={t("listEmpty")}
            next={t("listEmptyNext")}
            // Same hand-off as the log-via-chat CTA: land IN the work-log
            // flow, not on the generic greeting. "Create your first entry"
            // that drops the worker on the home screen is the exact
            // interaction the tester read as being thrown out of the journal.
            cta={{ label: t("listEmptyCta"), href: "/dashboard?intent=log-work" }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {visibleDayGroups.map((group, idx) => {
              // Compact day card: date + entry count + summed hours (only when
              // the day has time entries). Newest day open, older days collapse
              // so the records surface stays a tidy diary, not an endless raw
              // feed — every entry is still kept under its exact day.
              const totalLabel =
                group.totalMinutes > 0
                  ? formatDuration(
                      group.totalMinutes,
                      "minutes",
                      locale === "en" ? "en" : "lt",
                    )
                  : null;
              return (
                <details
                  key={group.key}
                  open={idx === 0}
                  className="group card-border"
                  data-testid="journal-day-group"
                  data-day={group.key}
                >
                  <summary className="flex min-h-[3rem] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="text-text-muted transition-transform group-open:rotate-90"
                      >
                        ▸
                      </span>
                      <span
                        className="font-display text-sm font-semibold text-text-primary"
                        data-testid="journal-day-header"
                      >
                        {group.label}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
                      {totalLabel && (
                        <span data-testid="journal-day-hours">
                          {totalLabel}
                        </span>
                      )}
                      <span
                        className="rounded-full border border-ink-500 px-1.5 py-0.5"
                        data-testid="journal-day-count"
                      >
                        {group.entries.length}
                      </span>
                    </span>
                  </summary>
                  <ul className="flex flex-col gap-3 px-4 pb-4">
                    {group.entries.map((e) => {
                      // Evidence Decision Timeline v1 — the real, ordered human-decision
                      // history (append-only rows). Empty while still submitted → the
                      // timeline shows "created → waiting", never a fabricated step.
                      // This is the SINGLE status display per entry; the old top-right
                      // status chip was removed (polish v1) — it repeated the timeline's
                      // terminal step and used different words for the same state.
                      const timeline = deriveReviewTimeline(
                        e.journal_entry_confirmations,
                      );
                      /**
                       * The answer to "who can confirm this?", per entry.
                       *
                       * The recorded decision always wins; the context only
                       * decides what the honest WAITING state is. A row with no
                       * organization behind it is `self_reported` — real,
                       * permanent, legitimate evidence that simply nobody has
                       * verified — never a blank pretending to be fine.
                       */
                      const verification = deriveWorkVerificationState({
                        reviewResult: deriveReviewResult(
                          e.journal_entry_confirmations,
                        ),
                        context: e.engagement_context_id
                          ? (contextFacts.get(e.engagement_context_id) ?? null)
                          : null,
                      });
                      const metrics = e.journal_entry_metrics ?? [];
                      const area =
                        metrics.find((m) => m.metric_slug === "quantity") ??
                        metrics.find((m) => m.metric_slug === "area_done");
                      const site = metrics.find(
                        (m) => m.metric_slug === "site_name",
                      );
                      const dir = metrics.find(
                        (m) => m.metric_slug === "work_direction",
                      );
                      // Owner §12 — the entry's own module fields (a
                      // placement's supervision, a volunteer's field
                      // project), shown back in plain words. Read from the
                      // rows already loaded; nothing for an entry without.
                      const moduleValues = Object.entries(
                        readModuleFieldValues(metrics),
                      );
                      // v3 — Delete control is offered only when the entry has no
                      // external confirmations yet. The RPC re-enforces the same
                      // rule server-side, so a stale client can't escalate.
                      const canDelete =
                        (e.journal_entry_confirmations ?? []).length === 0;
                      // Edit-in-place (journal compact UX v1): the same full
                      // editable state the `?editing=` flow reconstructs, built
                      // per unconfirmed entry so the row's drawer-based editor
                      // opens over the list — no navigation, the worker's
                      // scroll position / selected day stay exactly as-is.
                      const rowEditingEntry = canDelete
                        ? buildEditingEntry({
                            id: e.id,
                            originalText: e.original_text,
                            metrics: e.journal_entry_metrics,
                            engagementContextId: e.engagement_context_id ?? null,
                            linkedSkillSlugs: (linksByEntry.get(e.id) ?? [])
                              .map((sid) => skillIdToSlug.get(sid))
                              .filter((s): s is string => !!s),
                          })
                        : null;
                      // Per-entry chip SOURCE (PR B). Recognize skills from THIS entry's
                      // real text, then classify each linked chip honestly. An unsupported
                      // old link (e.g. a construction chip on a dog-walking entry) becomes
                      // "stale_needs_review" instead of clean current evidence.
                      const linkedForEntry = linksByEntry.get(e.id) ?? [];
                      // ONE render-time recognition pass per entry (pure, no DB
                      // write): it yields the recognized slugs the stale-link
                      // classifier consumes AND the detected section content
                      // (owner smoke follow-up 2026-07-02 — old entries never
                      // showed detected skills because recognition output was
                      // compose-time only and discarded at render).
                      const detectedForEntry = buildEntryDetectedSignals({
                        text: e.original_text ?? "",
                        locale,
                        declaredSkills: availableSkillsForLinks,
                        skillNameOf,
                      });
                      const recognizedSlugs = detectedForEntry.recognizedSlugs;
                      // PENDING candidates of this saved entry — the ONE
                      // derivation over the saved text and the entry's own
                      // markers, decidable on the card (#1689, 2026-09-12);
                      // before, a candidate could be decided only right after
                      // the save. Pure, no write; the server re-derives and
                      // membership-checks every decision.
                      const candidatesForEntry = pendingEntryCandidates({
                        text: e.original_text ?? "",
                        metrics: e.journal_entry_metrics,
                        declaredSlugs: declaredSlugSet,
                        linkedSlugs: new Set(
                          linkedForEntry
                            .map((id) => idToSlug.get(id))
                            .filter((x): x is string => !!x),
                        ),
                        skillNameOf,
                      });
                      const skillSources = buildEntrySkillSources({
                        linkedSkillIds: linkedForEntry,
                        idToSlug,
                        verifiedSkillIds,
                        recognizedSlugs,
                        recognizableSlugs,
                        provenanceBySkillId: provenanceByEntry.get(e.id),
                      });
                      // "Sistema suprato" — the structured signals the current text
                      // produced (direction / quantity). The entry's LOCATION gets its
                      // own always-present line below the text (user-journey repair v1):
                      // the location is the entry's OWN saved snapshot (site_name metric)
                      // and an entry without one honestly says "Vieta nenurodyta" —
                      // it is never inherited from the worker's current/profile location.
                      const hasUnderstood =
                        !!dir?.value_text || area?.value_numeric != null;
                      return (
                        <JournalEntryRow
                          key={e.id}
                          entryId={e.id}
                          canDelete={canDelete}
                          editSlot={
                            rowEditingEntry ? (
                              <JournalEntryEditLauncher
                                // RSC-passed slot elements need an explicit key:
                                // the row renders this beside its delete control
                                // (an array position), and Flight-deserialized
                                // elements can't be marked as static children.
                                key="edit-launcher"
                                entry={rowEditingEntry}
                                engagements={engagements}
                                directions={directions}
                                workerSkills={workerSkills}
                              />
                            ) : undefined
                          }
                          skillLinks={
                            skillLinksReady
                              ? {
                                  availableSkills: availableSkillsForLinks,
                                  linkedSkillIds: linkedForEntry,
                                  skillSources,
                                  detected: {
                                    skills: detectedForEntry.skills,
                                    labels: detectedForEntry.labels,
                                  },
                                  candidates: candidatesForEntry,
                                }
                              : undefined
                          }
                          statusSlot={
                            <>
                              <EvidenceDecisionTimeline
                                createdAt={e.created_at}
                                events={timeline}
                              />
                            </>
                          }
                        >
                          {/* 1 · Entry text — first, so the worker immediately sees
                        what they wrote. Long unbroken strings wrap cleanly. */}
                          <div className="flex flex-col gap-1">
                            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                              {t("entry.textLabel")}
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                              {e.original_text}
                            </p>
                            {/* RECOVERY HINT (audit v1). Until 2026-08-20 a
                                parsed duration the worker had not yet reviewed
                                was dropped silently while the entry saved: 14
                                live entries lost hours that way. The composer
                                can no longer do that, but those entries keep
                                their words and their missing time until their
                                OWN worker acts.

                                This TELLS, it does not repair. No value is
                                pre-filled and nothing is submitted — the
                                worker's own words are shown back as evidence
                                and they confirm their hours through the normal
                                edit flow, which supersedes rather than
                                overwrites. Reading only: this adds no query
                                and widens no visibility, because the journal
                                page already lists the worker's OWN entries
                                under their own RLS. */}
                            {(() => {
                              const unrecorded = detectUnrecordedHours(
                                e.original_text,
                                e.journal_entry_metrics,
                              );
                              if (!unrecorded.hasUnrecordedHours) return null;
                              return (
                                <p
                                  className="text-meta leading-relaxed text-state-warning"
                                  data-testid={`journal-unrecorded-hours-${e.id}`}
                                >
                                  {t("entry.unrecordedHours", {
                                    mentions: unrecorded.mentions.join(", "),
                                  })}
                                </p>
                              );
                            })()}
                            {/* Entry location — the entry's own saved snapshot only.
                                No snapshot → honest "Vieta nenurodyta" (never the
                                worker's current or profile location). */}
                            {moduleValues.length > 0 && (
                              <p
                                className="text-meta leading-relaxed text-text-muted"
                                data-testid={`journal-entry-module-fields-${e.id}`}
                              >
                                {moduleValues
                                  .map(
                                    ([slug, value]) =>
                                      `${t(`moduleFields.fields.${slug}`)}: ${value}`,
                                  )
                                  .join(" · ")}
                              </p>
                            )}
                            <p
                              className="text-meta text-text-muted"
                              data-testid={`journal-entry-location-${e.id}`}
                            >
                              {t("entry.locationLabel")}:{" "}
                              {site?.value_text ?? t("entry.locationUnset")}
                              {/* Who submitted (owner UX recovery v1) — this
                                  surface is the worker's own diary, so the
                                  submitter is the signed-in worker; named
                                  explicitly so an entry is never anonymous. */}
                              {submitterName ? (
                                <span
                                  data-testid={`journal-entry-submitter-${e.id}`}
                                >
                                  {" · "}
                                  {t("entry.submittedBy")}: {submitterName}
                                </span>
                              ) : null}
                            </p>
                            {/* Workspace context (rebuild W1): a MULTI-engagement
                                worker sees which company/relationship each entry
                                belongs to — same accent hue as the workspace chip.
                                One engagement → no chip (nothing ambiguous). */}
                            {engagements.length > 1 &&
                              e.engagement_context_id &&
                              engagementChips.has(e.engagement_context_id) && (
                                <p
                                  className="flex items-center gap-1.5 text-meta text-text-muted"
                                  data-testid={`journal-entry-context-${e.id}`}
                                >
                                  <span
                                    className={`size-2 flex-none rounded-full ${engagementChips.get(e.engagement_context_id)!.dot}`}
                                    aria-hidden
                                  />
                                  {engagementChips.get(e.engagement_context_id)!.label}
                                </p>
                              )}
                            {/* WHO CAN CONFIRM THIS. Shown on every entry that
                                is not already decided, because "nobody yet" is
                                the answer a worker most needs and the one the
                                product used to withhold. The next action is a
                                real destination, never advice. */}
                            {verification.nextAction !== "none" && (
                              <p
                                className="flex flex-wrap items-center gap-1.5 text-meta text-text-muted"
                                data-testid={`journal-entry-verification-${e.id}`}
                                data-verification-state={verification.state}
                                data-next-action={verification.nextAction}
                              >
                                <span className="text-text-secondary">
                                  {tVerify(`state.${verification.state}`)}
                                </span>
                                {verification.nextAction ===
                                "identify_verifier" ? (
                                  <Link
                                    href={IDENTIFY_VERIFIER_HREF as "/dashboard"}
                                    className="underline underline-offset-2 hover:text-text-primary"
                                    data-testid={`journal-entry-identify-verifier-${e.id}`}
                                  >
                                    {tVerify("action.identify_verifier")}
                                  </Link>
                                ) : (
                                  <span>
                                    {tVerify(`action.${verification.nextAction}`)}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                          {/* 2 · Sistema suprato — current signals from the current
                        text. Plain labelled values, never a badge wall. */}
                          {hasUnderstood && (
                            <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                              <p
                                className="font-mono text-meta uppercase tracking-label text-text-secondary"
                                data-testid={`journal-entry-understood-${e.id}`}
                              >
                                {t("entry.understoodLabel")}
                              </p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 break-words text-meta text-text-muted">
                                {dir?.value_text && (
                                  <span className="min-w-0 break-words">
                                    {tProf(dir.value_text)}
                                  </span>
                                )}
                                {area?.value_numeric != null && (
                                  <span>
                                    {/* Time-class units (hours / minutes / days) get the
                                  human-readable formatter so a saved "195 min" row
                                  reads "3 val. 15 min." in the entries list. Other
                                  quantity units fall through to the unit label. */}
                                    {area.unit_slug === "hours" ||
                                    area.unit_slug === "minutes" ||
                                    area.unit_slug === "days"
                                      ? formatDuration(
                                          area.value_numeric,
                                          area.unit_slug,
                                          locale === "en" ? "en" : "lt",
                                        )
                                      : `${area.value_numeric} ${
                                          area.unit_slug
                                            ? tUnit(area.unit_slug)
                                            : ""
                                        }`}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </JournalEntryRow>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* "Susiję su jūsų įrašais" — journal→jobs context (Job Recommendation
          Engine surfacing). Self-contained component, ONE insertion point;
          deterministic journal_entry_skills ∩ recommendation skill sets;
          honest empty → renders nothing. order-6 keeps it after the diary
          and composer in the visual order. */}
      <JournalJobContext workerId={worker.id} locale={locale} />
    </div>
  );
}
