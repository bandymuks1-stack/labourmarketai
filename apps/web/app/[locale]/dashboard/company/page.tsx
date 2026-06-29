import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { FeatureNote } from "@/components/app/feature-note";
import { CompanyActionNextActions } from "@/components/app/company-action-next-actions";
import { DemandDraftForm } from "@/components/app/demand-draft-form";
import { CompanyScoutingBridge } from "@/components/app/company-scouting-bridge";
import { TeamRosterEmptyState } from "@/components/app/team-roster-empty-state";
import { CompanyWorkersSection } from "@/components/app/company-workers-section";
import { OrgMembersPanel } from "@/components/app/org-members-panel";
import { getOrgMembersData } from "@/lib/operations/org-members";
import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";
import { getManagerEvidence } from "@/lib/operations/manager-evidence";
import { ManagerEvidenceCard } from "@/components/app/manager-evidence-card";
import { getWorkerReadiness } from "@/lib/company/worker-readiness";
import { WorkerReadinessSummary } from "@/components/app/worker-readiness-summary";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import {
  getOwnCompany,
  listActiveCompanyWorkers,
  listCompanyWorkerInvitations,
} from "@/lib/company/company-workers";
import { getDemandDraft } from "@/lib/demand/demand-drafts";
import { isOperationsRoleEnabled } from "@/lib/operations/role-capabilities";
import { getCompanyProjectContext } from "@/lib/company/project-context";
import { getOwnCompany as getOwnCompanyProfile } from "@/lib/company/company-setup";
import {
  CompanyNextActions,
  CompanyNoProfileGuide,
} from "@/components/app/company-next-actions";
import { CompanyReadinessSummary } from "@/components/app/company-readiness-summary";

// Owner sequence: what is needed → where → when → which skills → role on THIS
// need → accommodation/language → extra notes. The project/demand role is a
// per-need question (not a permanent company identity) and is stored in the
// existing customer_requests.payload jsonb — no DB migration.
const COMPANY_FIELDS = [
  { key: "title" as const, labelKey: "field.title.label", placeholderKey: "field.title.placeholder", variant: "text" as const },
  { key: "location" as const, labelKey: "field.location.label", placeholderKey: "field.location.placeholder", variant: "text" as const },
  { key: "timing" as const, labelKey: "field.timing.label", placeholderKey: "field.timing.placeholder", variant: "text" as const },
  { key: "capabilities" as const, labelKey: "field.capabilities.label", placeholderKey: "field.capabilities.placeholder", variant: "text" as const },
  { key: "projectRole" as const, labelKey: "field.projectRole.label", placeholderKey: "field.projectRole.placeholder", variant: "optioncards" as const, selectOptionsKey: "projectRole", optionColumns: 2 as const, helpKey: "field.projectRole.help" },
  { key: "accommodation" as const, labelKey: "field.accommodation.label", placeholderKey: "field.accommodation.placeholder", variant: "optioncards" as const, selectOptionsKey: "accommodation", optionColumns: 3 as const },
  { key: "languages" as const, labelKey: "field.languages.label", placeholderKey: "field.languages.placeholder", variant: "text" as const },
  { key: "notes" as const, labelKey: "field.notes.label", placeholderKey: "field.notes.placeholder", variant: "textarea" as const },
];

const ACCOMMODATION_OPTIONS = [
  { value: "yes", labelKey: "field.accommodation.options.yes" },
  { value: "no", labelKey: "field.accommodation.options.no" },
  { value: "unknown", labelKey: "field.accommodation.options.unknown" },
];

// Role the organisation takes ON THIS specific need — situational, not a
// permanent identity. Stored as payload.projectRole (free jsonb, no enum/migration).
const PROJECT_ROLE_OPTIONS = [
  { value: "client", labelKey: "field.projectRole.options.client" },
  { value: "general_contractor", labelKey: "field.projectRole.options.general_contractor" },
  { value: "contractor", labelKey: "field.projectRole.options.contractor" },
  { value: "subcontractor", labelKey: "field.projectRole.options.subcontractor" },
  { value: "labour_supplier", labelKey: "field.projectRole.options.labour_supplier" },
  { value: "service_provider", labelKey: "field.projectRole.options.service_provider" },
  { value: "other", labelKey: "field.projectRole.options.other" },
];

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("roleDashboards.company");
  const tSpaces = await getTranslations("spaces");
  const tRooms = await getTranslations("companyActionRooms");

  // Automatic-first status + next actions. Read the caller's OWN company
  // profile (RLS-scoped). When a company-role holder has no company row yet,
  // show a clean guide to the setup route — never empty technical blocks.
  const companyProfile = await getOwnCompanyProfile();
  if (companyProfile.kind === "ok" && companyProfile.row === null) {
    return (
      <div className="flex flex-col gap-6" data-testid="company-dashboard">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("title")}
          </h1>
        </header>
        <CompanyNoProfileGuide />
      </div>
    );
  }
  const companyRow =
    companyProfile.kind === "ok" ? companyProfile.row : null;

  const tWorkers = await getTranslations("roleDashboards.company.workers");
  const existingDraft = await getDemandDraft("company_request");

  const ownCompany = await getOwnCompany();
  const workersResult = ownCompany
    ? await listActiveCompanyWorkers(ownCompany.id)
    : ({ kind: "ok", rows: [] } as const);
  const invitationsResult = ownCompany
    ? await listCompanyWorkerInvitations(ownCompany.id)
    : ({ kind: "ok", rows: [] } as const);
  const orgMembers = ownCompany
    ? await getOrgMembersData("company", ownCompany.id)
    : null;
  const tOrg = await getTranslations("orgMembers");
  const tOps = await getTranslations("companyOps");
  // Slice 1 — operational status counts from existing data (read-back only).
  const acceptedCount = workersResult.kind === "ok" ? workersResult.rows.length : 0;
  // Slice 9 — per-worker work-readiness SIGNALS (not a rating), computed from
  // existing RLS-readable data (worker_skills + journal_entries + reviewable set).
  const activeWorkerRows = workersResult.kind === "ok" ? workersResult.rows : [];
  const readinessMap = await getWorkerReadiness(
    activeWorkerRows.map((w) => w.workerId),
  );
  const readinessRows = activeWorkerRows.map((w) => ({
    workerName: w.displayName ?? (w.email ? w.email.split("@")[0] : "—"),
    readiness: readinessMap.get(w.workerId) ?? {
      journalEntries: 0,
      declaredSkills: 0,
      confirmedSkills: 0,
      openReviewItems: 0,
      lastActivity: null,
    },
  }));
  const pendingCount =
    invitationsResult.kind === "ok"
      ? invitationsResult.rows.filter((i) => i.status === "pending").length
      : 0;
  const memberCount = orgMembers?.members.length ?? 0;
  const reviewCount =
    orgMembers?.members.filter((m) => m.reviewEnabled).length ?? 0;
  // Slice 3 — pending entries the owner can review now (gated RPC; 0 if none).
  const reviewPendingCount = ownCompany ? await countReviewablePendingEntries() : 0;
  // Project/client context readiness (read-only): the data model is live but
  // empty — show a truthful empty state, never a fabricated project/client.
  const projectContext = await getCompanyProjectContext(ownCompany?.id ?? null);
  // System-evidenced management activity (computed from the caller's own
  // recorded review actions — read-only, never an external verification).
  const managerEvidence = await getManagerEvidence();
  const orgMembersLabels = {
    title: tOrg("title"),
    intro: tOrg("intro"),
    reviewOn: tOrg("reviewOn"),
    reviewOff: tOrg("reviewOff"),
    enable: tOrg("enable"),
    disable: tOrg("disable"),
    addTitle: tOrg("addTitle"),
    addButton: tOrg("addButton"),
    noMembers: tOrg("noMembers"),
    noAddable: tOrg("noAddable"),
    allAdded: tOrg("allAdded"),
    reviewEnabledBadge: tOrg("reviewEnabledBadge"),
    reviewDisabledBadge: tOrg("reviewDisabledBadge"),
  };

  const workersLabels = {
    title: tWorkers("title"),
    subtitle: tWorkers("subtitle"),
    activeWorkersHeading: tWorkers("activeWorkersHeading"),
    noWorkersHeading: tWorkers("noWorkersHeading"),
    noWorkersBody: tWorkers("noWorkersBody"),
    inviteHeading: tWorkers("inviteHeading"),
    inviteDescription: tWorkers("inviteDescription"),
    inviteEmailLabel: tWorkers("inviteEmailLabel"),
    inviteEmailPlaceholder: tWorkers("inviteEmailPlaceholder"),
    inviteNoteLabel: tWorkers("inviteNoteLabel"),
    inviteNoteHint: tWorkers("inviteNoteHint"),
    inviteSubmit: tWorkers("inviteSubmit"),
    invitationsHeading: tWorkers("invitationsHeading"),
    invitationsEmpty: tWorkers("invitationsEmpty"),
    statusInvited: tWorkers("statusInvited"),
    statusAlreadyPending: tWorkers("statusAlreadyPending"),
    statusAlreadyLinked: tWorkers("statusAlreadyLinked"),
    statusNotOwner: tWorkers("statusNotOwner"),
    statusInvalidEmail: tWorkers("statusInvalidEmail"),
    statusError: tWorkers("statusError"),
    statusNoCompany: tWorkers("statusNoCompany"),
    migrationBlockerHeading: tWorkers("migrationBlockerHeading"),
    migrationBlockerBody: tWorkers("migrationBlockerBody"),
    columnEmail: tWorkers("columnEmail"),
    columnStatus: tWorkers("columnStatus"),
    columnInvitedAt: tWorkers("columnInvitedAt"),
    coordinationHeading: tWorkers("coordinationHeading"),
    coordinationBody: tWorkers("coordinationBody"),
    coordinationNextAction: tWorkers("coordinationNextAction"),
    operations: {
      columnHeading: tWorkers("operations.columnHeading"),
      setupNote: tWorkers("operations.setupNote"),
      notAssigned: tWorkers("operations.notAssigned"),
      reviewEnabled: tWorkers("operations.reviewEnabled"),
      reviewNotEnabled: tWorkers("operations.reviewNotEnabled"),
      roleLabels: {
        worker: tWorkers("operations.roleLabels.worker"),
        foreman: tWorkers("operations.roleLabels.foreman"),
        project_manager: tWorkers("operations.roleLabels.project_manager"),
        company_admin: tWorkers("operations.roleLabels.company_admin"),
        agency_admin: tWorkers("operations.roleLabels.agency_admin"),
      },
      nextActionLabels: {
        assign_role: tWorkers("operations.nextActionLabels.assign_role"),
        await_role_enablement: tWorkers(
          "operations.nextActionLabels.await_role_enablement",
        ),
        enable_review: tWorkers("operations.nextActionLabels.enable_review"),
        review_entries: tWorkers("operations.nextActionLabels.review_entries"),
        link_worker: tWorkers("operations.nextActionLabels.link_worker"),
      },
      assign: {
        heading: tWorkers("operations.assign.heading"),
        roleLabel: tWorkers("operations.assign.roleLabel"),
        none: tWorkers("operations.assign.none"),
        titleLabel: tWorkers("operations.assign.titleLabel"),
        titlePlaceholder: tWorkers("operations.assign.titlePlaceholder"),
        save: tWorkers("operations.assign.save"),
        saving: tWorkers("operations.assign.saving"),
        reviewToggleLabel: tWorkers("operations.assign.reviewToggleLabel"),
        reviewDisabledNote: tWorkers("operations.assign.reviewDisabledNote"),
        outcomeAssigned: tWorkers("operations.assign.outcomeAssigned"),
        outcomeCleared: tWorkers("operations.assign.outcomeCleared"),
        outcomeNotOwner: tWorkers("operations.assign.outcomeNotOwner"),
        outcomeNotLinked: tWorkers("operations.assign.outcomeNotLinked"),
        outcomeInvalidRole: tWorkers("operations.assign.outcomeInvalidRole"),
        outcomeReviewNotAllowed: tWorkers(
          "operations.assign.outcomeReviewNotAllowed",
        ),
        outcomeError: tWorkers("operations.assign.outcomeError"),
        outcomeNeedsMigration: tWorkers(
          "operations.assign.outcomeNeedsMigration",
        ),
        readyForSetup: tWorkers("operations.assign.readyForSetup"),
        bridgeReasons: {
          connected: tWorkers("operations.assign.bridgeReasons.connected"),
          review_not_enabled: tWorkers(
            "operations.assign.bridgeReasons.review_not_enabled",
          ),
          missing_engagement_context: tWorkers(
            "operations.assign.bridgeReasons.missing_engagement_context",
          ),
          role_not_assigned: tWorkers(
            "operations.assign.bridgeReasons.role_not_assigned",
          ),
          relationship_not_found: tWorkers(
            "operations.assign.bridgeReasons.relationship_not_found",
          ),
          not_allowed: tWorkers("operations.assign.bridgeReasons.not_allowed"),
          not_enabled: tWorkers("operations.assign.bridgeReasons.not_enabled"),
        },
        provision: {
          button: tWorkers("operations.assign.provision.button"),
          provisioning: tWorkers("operations.assign.provision.provisioning"),
          outcomeConnected: tWorkers("operations.assign.provision.outcomeConnected"),
          outcomeAlreadyConnected: tWorkers(
            "operations.assign.provision.outcomeAlreadyConnected",
          ),
          outcomeNotOwner: tWorkers("operations.assign.provision.outcomeNotOwner"),
          outcomeNotLinked: tWorkers("operations.assign.provision.outcomeNotLinked"),
          outcomeProfileMissing: tWorkers(
            "operations.assign.provision.outcomeProfileMissing",
          ),
          outcomeRoleNotAssigned: tWorkers(
            "operations.assign.provision.outcomeRoleNotAssigned",
          ),
          outcomeRoleNotAllowed: tWorkers(
            "operations.assign.provision.outcomeRoleNotAllowed",
          ),
          outcomeOrganizationMissing: tWorkers(
            "operations.assign.provision.outcomeOrganizationMissing",
          ),
          outcomeError: tWorkers("operations.assign.provision.outcomeError"),
          outcomeNeedsMigration: tWorkers(
            "operations.assign.provision.outcomeNeedsMigration",
          ),
        },
        review: {
          toggleLabel: tWorkers("operations.assign.review.toggleLabel"),
          enableButton: tWorkers("operations.assign.review.enableButton"),
          enabling: tWorkers("operations.assign.review.enabling"),
          disableButton: tWorkers("operations.assign.review.disableButton"),
          disabling: tWorkers("operations.assign.review.disabling"),
          blockerNotReady: tWorkers("operations.assign.review.blockerNotReady"),
          outcomeEnabled: tWorkers("operations.assign.review.outcomeEnabled"),
          outcomeAlreadyEnabled: tWorkers(
            "operations.assign.review.outcomeAlreadyEnabled",
          ),
          outcomeDisabled: tWorkers("operations.assign.review.outcomeDisabled"),
          outcomeAlreadyDisabled: tWorkers(
            "operations.assign.review.outcomeAlreadyDisabled",
          ),
          outcomeNotOwner: tWorkers("operations.assign.review.outcomeNotOwner"),
          outcomeNotLinked: tWorkers("operations.assign.review.outcomeNotLinked"),
          outcomeRoleNotAssigned: tWorkers(
            "operations.assign.review.outcomeRoleNotAssigned",
          ),
          outcomeRoleNotAllowed: tWorkers(
            "operations.assign.review.outcomeRoleNotAllowed",
          ),
          outcomeProfileMissing: tWorkers(
            "operations.assign.review.outcomeProfileMissing",
          ),
          outcomeOrganizationMissing: tWorkers(
            "operations.assign.review.outcomeOrganizationMissing",
          ),
          outcomeEngagementMissing: tWorkers(
            "operations.assign.review.outcomeEngagementMissing",
          ),
          outcomeError: tWorkers("operations.assign.review.outcomeError"),
          outcomeNeedsMigration: tWorkers(
            "operations.assign.review.outcomeNeedsMigration",
          ),
        },
        // roleOptionLabels are injected at render from operations.roleLabels.
        roleOptionLabels: {},
      },
    },
  };

  return (
    <div className="flex flex-col gap-6" data-testid="company-dashboard">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="shrink-0 text-xs font-medium text-brand-blue transition-colors hover:underline"
            data-testid="back-to-action-center"
          >
            ← {tRooms("backToActions")}
          </Link>
          <Link
            href="/dashboard/account"
            className="shrink-0 rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
            data-testid="room-my-spaces-link"
          >
            {tSpaces("mySpaces")} →
          </Link>
        </div>
        {/* Breadcrumb: this is the company identity workspace, framed as an
            action context, not a separate system. */}
        <p
          className="font-mono text-[10px] uppercase tracking-label text-brand-orange"
          data-testid="company-context"
        >
          {tRooms("company.context")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        {/* ONE canonical company profile — the workspace re-labels itself
            from companies.company_type after every save/refresh. An agency
            is this same profile with type 'staffing_agency', never a
            separate root role or a stale legacy mode. */}
        {companyRow ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className="rounded-sm border border-brand-cyan/40 bg-brand-cyan/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-cyan"
              data-testid="company-dashboard-type-chip"
            >
              {t(`setup.companyTypeOptions.${companyRow.companyType}`)}
            </span>
            {companyRow.companyType === "staffing_agency" ? (
              <span
                className="text-[11px] text-text-muted"
                data-testid="company-dashboard-type-note"
              >
                {t("typeNotes.staffing_agency")}
              </span>
            ) : companyRow.companyType === "client_customer" ? (
              <span
                className="text-[11px] text-text-muted"
                data-testid="company-dashboard-type-note"
              >
                {t("typeNotes.client_customer")}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <FeatureNote testId="feature-note-company">
        {(await getTranslations("featureNotes"))("companySpace")}
      </FeatureNote>

      <CompanyActionNextActions
        room="company"
        primaryHref="/dashboard/company/projects/new"
      />

      {companyRow ? <CompanyNextActions company={companyRow} /> : null}
      {companyRow ? (
        <CompanyReadinessSummary
          company={{
            legalName: companyRow.legalName,
            country: companyRow.country,
            registrationCode: companyRow.registrationCode,
            contactEmail: companyRow.contactEmail,
            companyType: companyRow.companyType,
            verificationStatus: companyRow.verificationStatus,
          }}
        />
      ) : null}

      <section
        className="card-border flex flex-col gap-4 p-5"
        data-testid="company-ops-workspace"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {tOps("title")}
          </h2>
          <p className="text-sm text-text-secondary">{tOps("intro")}</p>
        </header>
        <dl
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          data-testid="company-ops-counts"
        >
          {[
            { key: "pending", value: pendingCount },
            { key: "accepted", value: acceptedCount },
            { key: "members", value: memberCount },
            { key: "review", value: reviewCount },
          ].map((c) => (
            <div
              key={c.key}
              className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
              data-testid={`company-ops-count-${c.key}`}
            >
              <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {tOps(`counts.${c.key}`)}
              </dt>
              <dd className="font-display text-xl font-semibold text-text-primary">
                {c.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-4">
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {tOps("teamTitle")}
            </h3>
            <p className="text-xs leading-relaxed text-text-secondary">{tOps("teamBody")}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-4">
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {tOps("reviewTitle")}
            </h3>
            <p className="text-xs leading-relaxed text-text-secondary">{tOps("reviewSteps")}</p>
            <Link
              href="/dashboard/inbox"
              className="self-start text-xs font-semibold text-brand-blue hover:underline"
              data-testid="company-ops-review-link"
            >
              {tOps("reviewCta")}
              {reviewPendingCount > 0 ? ` (${reviewPendingCount})` : ""} →
            </Link>
          </div>
          <div
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-4"
            data-testid="company-ops-projects"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-sm font-semibold text-text-primary">
                {tOps("projectsTitle")}
              </h3>
              <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-medium text-brand-blue">
                {tOps("projectsReadyBadge")}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">{tOps("projectsBody")}</p>
            <p className="text-[11px] text-text-muted" data-testid="company-ops-projects-count">
              {tOps("projectsCount")}:{" "}
              <span className="font-semibold text-text-primary">{projectContext.projects}</span>
              {projectContext.projects === 0 ? ` · ${tOps("projectsEmpty")}` : ""}
            </p>
            <p className="text-[11px] leading-relaxed text-text-muted" data-testid="company-ops-projects-linking">
              {tOps("projectsLinkingNote")}
            </p>
            <Link
              href="/dashboard/company/projects/new"
              className="w-fit rounded-md border border-brand-blue/40 px-3 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
              data-testid="company-ops-projects-create"
            >
              {tOps("createProject.entryCta")}
            </Link>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-4">
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {tOps("needsTitle")}
            </h3>
            <p className="text-xs leading-relaxed text-text-secondary">{tOps("needsBody")}</p>
            <Link
              href="/dashboard"
              className="self-start text-xs font-semibold text-brand-blue hover:underline"
              data-testid="company-ops-needs-link"
            >
              {tOps("needsCta")} →
            </Link>
          </div>
        </div>
      </section>

      {/* Assignment connections (§8.5): the player-card roster/assignment links
          into the plan (bookings), the map (where the team is) and the record
          (evidence/reports). Existing routes only — the company control center
          previously had no path to the calendar or the map. Navigation only. */}
      <section
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="company-assignment-connections"
      >
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {tOps("connections.title")}
        </span>
        <p className="text-xs text-text-secondary">{tOps("connections.intro")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            {
              key: "calendar",
              href: "/dashboard/bookings",
              label: tOps("connections.calendar"),
              note: tOps("connections.calendarNote"),
            },
            {
              key: "map",
              href: "/dashboard/market-map",
              label: tOps("connections.map"),
              note: tOps("connections.mapNote"),
            },
            {
              key: "evidence",
              href: "/dashboard/reports/evidence",
              label: tOps("connections.evidence"),
              note: tOps("connections.evidenceNote"),
            },
          ].map((l) => (
            <Link
              key={l.key}
              href={l.href as "/dashboard"}
              data-testid={`company-assignment-connection-${l.key}`}
              className="flex min-h-[3.25rem] flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
            >
              <span className="font-semibold">{l.label}</span>
              <span className="text-xs text-text-muted">{l.note}</span>
            </Link>
          ))}
        </div>
      </section>

      {managerEvidence && <ManagerEvidenceCard evidence={managerEvidence} />}

      <section
        className="card-border flex flex-col gap-2 p-4"
        data-testid="company-dashboard-pilot-disclaimer"
      >
        <p className="text-sm text-text-secondary">{t("pilotDisclaimer")}</p>
      </section>

      <OrgTier1Warning />

      <TeamRosterEmptyState variant="company" />

      <div id="company-team" className="scroll-mt-20">
        <CompanyWorkersSection
          workersResult={workersResult}
          invitationsResult={invitationsResult}
          labels={workersLabels}
          roleCoordinationEnabled={isOperationsRoleEnabled("foreman")}
          canAssignRoles
        />
      </div>

      <WorkerReadinessSummary rows={readinessRows} />

      {orgMembers && (
        <OrgMembersPanel
          orgId={orgMembers.orgId}
          members={orgMembers.members}
          addable={orgMembers.addable}
          labels={orgMembersLabels}
        />
      )}

      <section
        id="company-requests"
        className="card-border flex flex-col gap-4 p-5 scroll-mt-20"
        data-testid="company-dashboard-first-action"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("firstAction.title")}
          </h2>
          <p className="text-sm text-text-secondary">
            {t("firstAction.body")}
          </p>
        </header>
        {/* Persistent (reload-safe) empty / saved-private state. The form's own
            "saved" line only appears right after an in-session save; this tells
            the company, on every visit, whether a private draft exists — and is
            careful to NEVER imply it was submitted, sent, matched, or reviewed. */}
        {existingDraft ? (
          <p
            className="rounded-md border border-state-success/30 bg-state-success/5 px-3 py-2 text-xs text-state-success"
            data-testid="company-request-saved-state"
          >
            ✓ {t("firstAction.savedState")}
          </p>
        ) : (
          <p
            className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-secondary"
            data-testid="company-request-empty-state"
          >
            {t("firstAction.emptyState")}
          </p>
        )}
        <DemandDraftForm
          draftType="company_request"
          fields={COMPANY_FIELDS}
          i18nNamespace="roleDashboards.company.draftForm"
          initialDraft={existingDraft}
          selectOptions={{
            accommodation: ACCOMMODATION_OPTIONS,
            projectRole: PROJECT_ROLE_OPTIONS,
          }}
        />
      </section>

      <CompanyScoutingBridge />

      <Link
        href="/dashboard/profile"
        className="self-start text-sm text-brand-blue hover:underline"
        data-testid="company-dashboard-profile-link"
      >
        {t("profileLink")} →
      </Link>
    </div>
  );
}
