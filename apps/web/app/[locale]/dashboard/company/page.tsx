import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  CalendarDays,
  FolderKanban,
  Images,
  MailPlus,
  MapPin,
  UsersRound,
} from "lucide-react";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { Link } from "@/lib/i18n/navigation";
import { OrgTier1Warning } from "@/components/app/org-tier1-warning";
import { FeatureNote } from "@/components/app/feature-note";
import { CompanyActionNextActions } from "@/components/app/company-action-next-actions";
import { ClaimPublicIntakeCard } from "@/components/app/claim-public-intake-card";
import { listClaimablePublicIntakes } from "@/lib/company/claim-public-intake";
import { DemandRequestButton } from "@/components/app/demand-request-button";
import { DemandRequestsReadback } from "@/components/app/demand-requests-readback";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
import { CompanyScoutingBridge } from "@/components/app/company-scouting-bridge";
import { AgencyClientsSection } from "@/components/app/agency-clients-section";
import { AgencyBridgeSection } from "@/components/app/agency-bridge-section";
import { ClientAgencyBridgeSection } from "@/components/app/client-agency-bridge-section";
// Real two-subject agency->client bridge (issue #859): connection + share +
// candidate offer between a staffing agency and a REAL separate client company.
import {
  listAgencyConnections,
  listMyConnectionInvites,
  listSharedRequestsForAgency,
  listAgencyOfferProgress,
} from "@/lib/agency/bridge-read";
// Client-management module ONLY (reuses customers-investigation outcome +
// canonical customer_requests) — never the legacy lib/agency pool world.
import { listAgencyClients, listAgencyDemands } from "@/lib/agency/clients";
import { TeamRosterEmptyState } from "@/components/app/team-roster-empty-state";
import { TeamBrigadesPanel } from "@/components/app/team-brigades-panel";
import { getTeamBrigadesData } from "@/lib/company/team-brigades";
import { CompanyWorkersSection } from "@/components/app/company-workers-section";
import { CompanyLocationsSection } from "@/components/app/company-locations-section";
import { CompanyGallerySection } from "@/components/app/company-gallery-section";
import { getCompanyLocations } from "@/lib/company/company-locations";
import { listManagedProjects } from "@/lib/projects/projects";
import { getProjectGallerySummary } from "@/lib/journal/project-gallery";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import { OrgMembersPanel } from "@/components/app/org-members-panel";
import { BusinessPublicProfilePanel } from "@/components/app/business-public-profile-panel";
import { getBusinessPublicSettings } from "@/lib/company/public-profile";
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
import { HelpRequestPanel } from "@/components/app/help-request-panel";
import { isOperationsRoleEnabled } from "@/lib/operations/role-capabilities";
import { getCompanyProjectContext } from "@/lib/company/project-context";
import { getOwnCompany as getOwnCompanyProfile } from "@/lib/company/company-setup";
import {
  CompanyNextActions,
  CompanyNoProfileGuide,
} from "@/components/app/company-next-actions";
import { CompanyReadinessSummary } from "@/components/app/company-readiness-summary";

// W3 rows 7/8/25: the light COMPANY_FIELDS draft form is absorbed by the full
// demand wizard below (its private save-draft leg writes the same canonical
// draft through save_demand_draft). The employer demand kinds the owner
// readback is scoped to — a dual-role user's buyer service requests stay in
// the buyer room.
const EMPLOYER_DEMAND_KINDS = ["company_request", "agency_offer"] as const;

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("roleDashboards.company");
  const tNetwork = await getTranslations("network");
  const tSpaces = await getTranslations("spaces");
  const tRooms = await getTranslations("companyActionRooms");

  // Automatic-first status + next actions. Read the caller's OWN company
  // profile (RLS-scoped). When a company-role holder has no company row yet,
  // show a clean guide to the setup route — never empty technical blocks.
  const companyProfile = await getOwnCompanyProfile();
  if (companyProfile.kind === "ok" && companyProfile.row === null) {
    return (
      <div className="flex flex-col gap-6" data-testid="company-dashboard">
        <TelemetryView
          event={FUNNEL_EVENTS.companyDashboardViewed}
          metadata={{ surface: "company", step: "no_profile" }}
        />
        <header className="flex flex-col gap-1">
          <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
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

  // P5 agency client management — staffing-agency mode ONLY. Reads the
  // caller's own agency_clients (owner-gated migration → honest gated state)
  // + their OWN canonical customer_requests rows. Never fetched for other
  // company types.
  const isStaffingAgency = companyRow?.companyType === "staffing_agency";
  const agencyClientsState = isStaffingAgency ? await listAgencyClients() : null;
  const agencyDemandsState = isStaffingAgency ? await listAgencyDemands() : null;

  const tWorkers = await getTranslations("roleDashboards.company.workers");
  // W3 rows 7/8/25 — the ONE owner readback (moved from /dashboard/advanced),
  // scoped to the employer demand kinds. Same RLS-scoped own-rows read.
  const demandReadback = await listOwnCustomerRequests(EMPLOYER_DEMAND_KINDS);
  // Canonical-journey P3 — the caller's own claimable public intakes
  // (authenticated-email match; [] on any missing state, never an error).
  const tClaim = await getTranslations("companyClaimIntake");
  const claimableIntakes = await listClaimablePublicIntakes();

  // W3 rows 7/8/25 — the FULL demand wizard now lives HERE (the action's own
  // advancedRoute), not on the dying advanced page. Intent follows the
  // company's own type: a staffing agency supplies candidates (partner), any
  // other company hires (hire_workers) — same rule the wizard's draft-close
  // leg already used.
  const demandIntent = isStaffingAgency ? ("partner" as const) : ("hire_workers" as const);
  const demandPilotKey = demandIntent === "hire_workers" ? "hire" : "partner";
  const tWow = await getTranslations("auth.dashboard.wow");
  const tFlow = await getTranslations("auth.dashboard.wow.flow");
  const tReadback = await getTranslations("demandReadback");
  const tReqStatus = await getTranslations(
    "roleDashboards.buyer.requests.understanding.requestStatus",
  );
  const readbackLabels = {
    heading: tReadback("heading"),
    note: tReadback("note"),
    workerVisibilityNote: tReadback("workerVisibilityNote"),
    empty: tReadback("empty"),
    created: tReadback("created"),
    manageHelp: tReadback("manageHelp"),
    scoutLink: tReadback("scoutLink"),
    status: {
      draft: tReqStatus("draft"),
      submitted: tReqStatus("submitted"),
      in_review: tReqStatus("in_review"),
      needs_followup: tReqStatus("needs_followup"),
      approved: tReqStatus("approved"),
      closed: tReqStatus("closed"),
    },
    statusOther: tReadback("statusOther"),
    detailsLabel: tReadback("detailsLabel"),
    fields: {
      description: tReadback("fields.description"),
      role: tReadback("fields.role"),
      location: tReadback("fields.location"),
      skills: tReadback("fields.skills"),
      urgency: tReadback("fields.urgency"),
      notes: tReadback("fields.notes"),
    },
    urgencyValues: {
      flexible: tWow("demand.form.urgencyFlexible"),
      this_week: tWow("demand.form.urgencyThisWeek"),
      urgent: tWow("demand.form.urgencyUrgent"),
    },
  };

  const ownCompany = await getOwnCompany();
  // Real two-subject bridge (issue #859): agency side reads its connections /
  // shared requests / offer progress; the non-agency company side reads its
  // inbound connection invites. Both degrade to needs-migration honestly.
  const isCompanyOwner = !!companyRow;
  const bridgeConnections =
    isStaffingAgency && ownCompany ? await listAgencyConnections(ownCompany.id) : null;
  const bridgeShared = isStaffingAgency ? await listSharedRequestsForAgency() : null;
  const bridgeProgress = isStaffingAgency ? await listAgencyOfferProgress() : null;
  const clientInvites =
    isCompanyOwner && !isStaffingAgency ? await listMyConnectionInvites() : null;
  const clientDemands =
    isCompanyOwner && !isStaffingAgency ? await listAgencyDemands() : null;
  const workersResult = ownCompany
    ? await listActiveCompanyWorkers(ownCompany.id)
    : ({ kind: "ok", rows: [] } as const);
  const invitationsResult = ownCompany
    ? await listCompanyWorkerInvitations(ownCompany.id)
    : ({ kind: "ok", rows: [] } as const);
  const orgMembers = ownCompany
    ? await getOrgMembersData("company", ownCompany.id)
    : null;

  // W13 slice 2 — public business showcase profile publication settings
  // (owner/manager gated; default private; honest gated state pre-migration).
  const businessPublicSettings = orgMembers
    ? await getBusinessPublicSettings(orgMembers.orgId)
    : null;

  // F12.4/5 company geography (owner-gated migration → honest gated state)
  // + F13 company gallery (real photo counts across managed projects).
  const companyLocations = await getCompanyLocations();
  const managedProjects = ownCompany ? await listManagedProjects() : [];
  const companyGalleryProjects = await Promise.all(
    managedProjects.slice(0, 12).map(async (p) => ({
      projectId: p.id,
      title: p.title,
      photoCount: (await getProjectGallerySummary(p.id)).photoCount,
    })),
  );

  const tOrg = await getTranslations("orgMembers");
  const tOps = await getTranslations("companyOps");
  const tLocs = await getTranslations("companyLocations");
  const tCompanyGallery = await getTranslations("companyGallery");
  const tTabs = await getTranslations("auth.dashboard.tabs");
  const tCountries = await getTranslations("labourMarket");
  const companyLocationsLabels = {
    title: tLocs("title"),
    subtitle: tLocs("subtitle"),
    kindHeadquarters: tLocs("kindHeadquarters"),
    kindOperating: tLocs("kindOperating"),
    kindDesiredMarket: tLocs("kindDesiredMarket"),
    countryLabel: tLocs("countryLabel"),
    cityLabel: tLocs("cityLabel"),
    regionLabel: tLocs("regionLabel"),
    addButton: tLocs("addButton"),
    removeButton: tLocs("removeButton"),
    empty: tLocs("empty"),
    gatedHeading: tLocs("gatedHeading"),
    gatedBody: tLocs("gatedBody"),
    errorLabel: tLocs("errorLabel"),
    countries: Object.fromEntries(
      MARKET_COUNTRIES.map((c) => [c, tCountries(`countryNames.${c}`)]),
    ),
    countryCodes: MARKET_COUNTRIES,
  };
  const companyGalleryLabels = {
    title: tCompanyGallery("title"),
    subtitle: tCompanyGallery("subtitle"),
    photosLabel: tCompanyGallery("photosLabel"),
    openLabel: tCompanyGallery("openLabel"),
    empty: tCompanyGallery("empty"),
  };
  // P5: "Klientai" panel labels — resolved only in staffing-agency mode.
  const tAgencyClients = isStaffingAgency
    ? await getTranslations("agencyClients")
    : null;
  const agencyClientsLabels = tAgencyClients
    ? {
        title: tAgencyClients("title"),
        subtitle: tAgencyClients("subtitle"),
        gatedHeading: tAgencyClients("gatedHeading"),
        gatedBody: tAgencyClients("gatedBody"),
        notLinkable: tAgencyClients("notLinkable"),
        clientsEmpty: tAgencyClients("clientsEmpty"),
        demandsHeading: tAgencyClients("demandsHeading"),
        demandsEmpty: tAgencyClients("demandsEmpty"),
        demandsEmptyCta: tAgencyClients("demandsEmptyCta"),
        unassignedHeading: tAgencyClients("unassignedHeading"),
        noLinkedDemands: tAgencyClients("noLinkedDemands"),
        openScouting: tAgencyClients("openScouting"),
        addHeading: tAgencyClients("addHeading"),
        nameLabel: tAgencyClients("nameLabel"),
        contactNameLabel: tAgencyClients("contactNameLabel"),
        contactEmailLabel: tAgencyClients("contactEmailLabel"),
        noteLabel: tAgencyClients("noteLabel"),
        addButton: tAgencyClients("addButton"),
        removeButton: tAgencyClients("removeButton"),
        assignLabel: tAgencyClients("assignLabel"),
        assignNone: tAgencyClients("assignNone"),
        assignButton: tAgencyClients("assignButton"),
        errorLabel: tAgencyClients("errorLabel"),
        statuses: {
          draft: tAgencyClients("status.draft"),
          submitted: tAgencyClients("status.submitted"),
          in_review: tAgencyClients("status.in_review"),
          needs_followup: tAgencyClients("status.needs_followup"),
          approved: tAgencyClients("status.approved"),
          closed: tAgencyClients("status.closed"),
        },
      }
    : null;
  // Real two-subject bridge labels (issue #859).
  const tAB = isStaffingAgency ? await getTranslations("agencyBridge") : null;
  const agencyBridgeLabels = tAB
    ? {
        title: tAB("title"), subtitle: tAB("subtitle"),
        gatedHeading: tAB("gatedHeading"), gatedBody: tAB("gatedBody"),
        connectionsHeading: tAB("connectionsHeading"), inviteEmailLabel: tAB("inviteEmailLabel"),
        inviteButton: tAB("inviteButton"), revokeButton: tAB("revokeButton"),
        noConnections: tAB("noConnections"), sharedHeading: tAB("sharedHeading"),
        noShared: tAB("noShared"), workerLabel: tAB("workerLabel"),
        workerPlaceholder: tAB("workerPlaceholder"), offerButton: tAB("offerButton"),
        noRoster: tAB("noRoster"), progressHeading: tAB("progressHeading"),
        noOffers: tAB("noOffers"), withdrawButton: tAB("withdrawButton"),
        openScouting: tAB("openScouting"), errorLabel: tAB("errorLabel"),
        statusLabels: {
          pending: tAB("status.pending"), active: tAB("status.active"),
          declined: tAB("status.declined"), revoked: tAB("status.revoked"),
        },
        stageLabels: {
          offered: tAB("stage.offered"), reviewed: tAB("stage.reviewed"),
          contacted: tAB("stage.contacted"), rejected: tAB("stage.rejected"),
          booking_started: tAB("stage.booking_started"), accepted: tAB("stage.accepted"),
        },
      }
    : null;
  const tCB = isCompanyOwner && !isStaffingAgency ? await getTranslations("clientBridge") : null;
  const clientBridgeLabels = tCB
    ? {
        title: tCB("title"), subtitle: tCB("subtitle"),
        gatedHeading: tCB("gatedHeading"), gatedBody: tCB("gatedBody"),
        invitesHeading: tCB("invitesHeading"), noInvites: tCB("noInvites"),
        acceptButton: tCB("acceptButton"), declineButton: tCB("declineButton"),
        activeHeading: tCB("activeHeading"), noActive: tCB("noActive"),
        revokeButton: tCB("revokeButton"), shareLabel: tCB("shareLabel"),
        sharePlaceholder: tCB("sharePlaceholder"), shareButton: tCB("shareButton"),
        noDemands: tCB("noDemands"), errorLabel: tCB("errorLabel"),
        fromAgency: tCB("fromAgency"),
      }
    : null;
  const bridgeRosterOptions =
    isStaffingAgency && workersResult.kind === "ok"
      ? workersResult.rows
          .filter((w) => w.status === "active")
          .map((w) => ({
            workerId: w.workerId,
            label: w.displayName ?? (w.email ? w.email.split("@")[0] : `#${w.workerId.slice(0, 6)}`),
          }))
      : [];
  const clientBridgeDemands =
    clientDemands?.kind === "ok"
      ? clientDemands.rows.map((d) => ({ id: d.id, title: d.title }))
      : [];
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
  // Teams/brigades minimum (§8.3): probe + read-only load. Reports
  // { applied: false } until the owner applies 20260705220000.
  const teamBrigades = ownCompany
    ? await getTeamBrigadesData()
    : ({ applied: false } as const);
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
    openProfile: tWorkers("openProfile"),
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
      <TelemetryView
        event={FUNNEL_EVENTS.companyDashboardViewed}
        metadata={{ surface: "company", role_context: "company" }}
      />
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
            href="/dashboard"
            className="shrink-0 rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
            data-testid="room-my-spaces-link"
          >
            {tSpaces("mySpaces")} →
          </Link>
        </div>
        {/* Breadcrumb: this is the company identity workspace, framed as an
            action context, not a separate system. */}
        <p
          className="font-mono text-meta uppercase tracking-label text-brand-orange"
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
              className="rounded-sm border border-brand-cyan/40 bg-brand-cyan/5 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-cyan"
              data-testid="company-dashboard-type-chip"
            >
              {t(`setup.companyTypeOptions.${companyRow.companyType}`)}
            </span>
            {companyRow.companyType === "staffing_agency" ? (
              <span
                className="text-meta text-text-muted"
                data-testid="company-dashboard-type-note"
              >
                {t("typeNotes.staffing_agency")}
              </span>
            ) : companyRow.companyType === "client_customer" ? (
              <span
                className="text-meta text-text-muted"
                data-testid="company-dashboard-type-note"
              >
                {t("typeNotes.client_customer")}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* F3 (production UX repair v2): compact icon-led control bar — every
          core company area is one glance + one tap away, with real counters.
          Long explanations stay inside their sections, never up here. */}
      <nav
        aria-label={t("title")}
        data-testid="company-control-bar"
        className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
      >
        {[
          {
            key: "team",
            href: "#company-team",
            icon: <UsersRound className="h-4 w-4" aria-hidden />,
            label: tWorkers("activeWorkersHeading"),
            count: acceptedCount,
          },
          {
            key: "projects",
            href: `/${locale}/dashboard/projects`,
            icon: <FolderKanban className="h-4 w-4" aria-hidden />,
            label: tRooms("company.projectsLabel"),
            count: managedProjects.length,
          },
          {
            key: "invitations",
            href: "#company-invitations",
            icon: <MailPlus className="h-4 w-4" aria-hidden />,
            label: tWorkers("invitationsHeading"),
            count:
              invitationsResult.kind === "ok"
                ? invitationsResult.rows.length
                : 0,
          },
          {
            key: "locations",
            href: "#company-locations",
            icon: <MapPin className="h-4 w-4" aria-hidden />,
            label: tLocs("title"),
            count:
              companyLocations.kind === "ok"
                ? companyLocations.rows.length
                : 0,
          },
          {
            key: "gallery",
            href: "#company-gallery",
            icon: <Images className="h-4 w-4" aria-hidden />,
            label: tCompanyGallery("title"),
            count: companyGalleryProjects.reduce(
              (n, p) => n + p.photoCount,
              0,
            ),
          },
          {
            key: "calendar",
            href: `/${locale}/dashboard/planning`,
            icon: <CalendarDays className="h-4 w-4" aria-hidden />,
            label: tTabs("planning"),
            count: null,
          },
        ].map((item) => (
          <a
            key={item.key}
            href={item.href}
            data-testid={`company-control-${item.key}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            {item.icon}
            {item.label}
            {typeof item.count === "number" ? (
              <span className="rounded-full bg-ink-700 px-1.5 py-0.5 font-mono text-meta text-text-primary tabular-nums">
                {item.count}
              </span>
            ) : null}
          </a>
        ))}
      </nav>

      {/* Decision-first strip (company architecture v1): the overview LEADS
          with what actually waits for the owner's decision — pending journal
          reviews, pending worker invitations, claimable public intakes. All
          counts REUSE reads this page already performs (no new queries);
          count-gated exactly like the spine strip — zero pending = no strip,
          never fake urgency. */}
      {(() => {
        const decisionEntries = [
          {
            key: "review",
            count: reviewPendingCount,
            href: `/${locale}/dashboard/inbox`,
          },
          {
            key: "invitations",
            count: pendingCount,
            href: "#company-invitations",
          },
          {
            key: "claims",
            count: claimableIntakes.length,
            href: "#company-claims",
          },
        ].filter((e) => e.count > 0);
        if (decisionEntries.length === 0) return null;
        return (
          <section
            aria-label={t("decisions.title")}
            data-testid="company-decisions-strip"
            className="flex flex-col gap-2"
          >
            <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
              {t("decisions.title")}
            </p>
            <div className="flex flex-wrap gap-2">
              {decisionEntries.map((e) => (
                <a
                  key={e.key}
                  href={e.href}
                  data-testid={`company-decision-${e.key}`}
                  className="inline-flex items-center gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/5 px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-brand-orange"
                >
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-orange px-1.5 text-xs font-bold text-white tabular-nums">
                    {e.count}
                  </span>
                  {t(`decisions.${e.key}`)}
                </a>
              ))}
            </div>
          </section>
        );
      })()}

      <FeatureNote testId="feature-note-company">
        {(await getTranslations("featureNotes"))("companySpace")}
      </FeatureNote>

      {/* Honest data-driven status header (name, verification status, what to
          fix) — consolidated next to the ONE action center below
          (canonical-user-journey v1). */}
      {companyRow ? <CompanyNextActions company={companyRow} /> : null}

      {/* Canonical-journey P3 — claim bridge: the caller's own PUBLIC
          /company-need submissions (matched by their authenticated email)
          continue here as a real draft demand instead of dead-ending in the
          operator queue. Renders nothing when there is nothing to claim. */}
      {claimableIntakes.length > 0 ? (
        <div id="company-claims" className="scroll-mt-20">
        <ClaimPublicIntakeCard
          locale={locale}
          intakes={claimableIntakes}
          labels={{
            title: tClaim("title"),
            body: tClaim("body"),
            claimCta: tClaim("claimCta"),
            claimed: tClaim("claimed"),
            error: tClaim("error"),
            workersLabel: tClaim("workersLabel"),
          }}
        />
        </div>
      ) : null}

      <CompanyActionNextActions
        room="company"
        primaryHref="/dashboard/company/projects/new"
      />

      {/* Staffing-agency operating MODE (Direction A, owner decision
          2026-07-05): an agency is this same company profile with
          company_type='staffing_agency' — never a separate dashboard. The
          mode surfaces ONLY the agency-relevant actions that are already
          real on the canonical path: the worker roster/invitations below
          (company_workers), the demand wizard's partner intent (writes
          kind='agency_offer' to customer_requests), and scouting. Renders
          strictly when companyRow.companyType === "staffing_agency". */}
      {companyRow && companyRow.companyType === "staffing_agency" ? (
        <>
        <section
          className="card-border flex flex-col gap-3 p-5"
          data-testid="company-agency-mode"
        >
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("agencyMode.title")}
            </h2>
            <p className="text-sm text-text-secondary">
              {t("agencyMode.intro")}
            </p>
          </header>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                key: "roster",
                href: "/dashboard/company#company-team" as string | null,
              },
              {
                // W3 rows 7/8/25: the wizard now lives on THIS page — the
                // old role-switch server action is no longer needed here.
                key: "offer",
                href: "/dashboard/company#demand-intake" as string | null,
              },
              {
                key: "scouting",
                href: "/dashboard/company/scouting" as string | null,
              },
            ].map((a) => {
              const body = (
                <>
                  <span className="font-semibold">
                    {t(`agencyMode.actions.${a.key}.label`)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {t(`agencyMode.actions.${a.key}.note`)}
                  </span>
                </>
              );
              const className =
                "flex min-h-[3.25rem] w-full flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:border-brand-blue";
              return (
                <Link
                  key={a.key}
                  href={(a.href ?? "/dashboard/company") as "/dashboard"}
                  data-testid={`company-agency-mode-action-${a.key}`}
                  className={className}
                >
                  {body}
                </Link>
              );
            })}
          </div>
          <p
            className="text-meta leading-relaxed text-text-muted"
            data-testid="company-agency-mode-legacy-note"
          >
            {t("agencyMode.legacyNote")}
          </p>
        </section>
        {/* P5 "Klientai": client → need → candidates path for the agency,
            INSIDE the same canonical workspace. Client records are gated on
            the owner-approved migration (honest degraded state until then);
            the demand list + scouting links are real today. */}
        {agencyClientsState && agencyDemandsState && agencyClientsLabels ? (
          <AgencyClientsSection
            clients={agencyClientsState}
            demands={agencyDemandsState}
            locale={locale}
            labels={agencyClientsLabels}
          />
        ) : null}
        {/* REAL two-subject bridge (issue #859) — agency side: invite a REAL
            client company, see only shared requests, offer a roster worker,
            watch the derived review stage. Owner-gated migration → honest
            gated state until applied. */}
        {bridgeConnections && bridgeShared && bridgeProgress && agencyBridgeLabels && ownCompany ? (
          <AgencyBridgeSection
            agencyCompanyId={ownCompany.id}
            connections={bridgeConnections}
            shared={bridgeShared}
            progress={bridgeProgress}
            roster={bridgeRosterOptions}
            labels={agencyBridgeLabels}
            locale={locale}
          />
        ) : null}
        </>
      ) : null}

      {/* REAL two-subject bridge — client side: a real (non-agency) company
          accepts a staffing agency's connection, shares specific OWN requests,
          and reviews proposed candidates on its OWN scouting surface. */}
      {companyRow && companyRow.companyType !== "staffing_agency" && clientInvites && clientBridgeLabels && ownCompany ? (
        <ClientAgencyBridgeSection
          invites={clientInvites}
          clientCompanyId={ownCompany.id}
          demands={clientBridgeDemands}
          labels={clientBridgeLabels}
        />
      ) : null}

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
          {/* Dead-UI rule D (owner smoke 2026-07-05): each counter navigates
              to the section/queue it counts — same card language as the
              clickable cards around it, now honestly earned. */}
          {[
            { key: "pending", value: pendingCount, href: "#company-team" },
            { key: "accepted", value: acceptedCount, href: "#company-team" },
            { key: "members", value: memberCount, href: "#company-team" },
            { key: "review", value: reviewCount, href: `/${locale}/dashboard/inbox` },
          ].map((c) => (
            <a
              key={c.key}
              href={c.href}
              className="flex min-h-11 flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              data-testid={`company-ops-count-${c.key}`}
            >
              <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                {tOps(`counts.${c.key}`)}
              </dt>
              <dd className="font-display text-xl font-semibold text-text-primary">
                {c.value}
              </dd>
            </a>
          ))}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-4">
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {tOps("teamTitle")}
            </h3>
            <p className="text-xs leading-relaxed text-text-secondary">{tOps("teamBody")}</p>
            {/* Dead-UI repair: the three sibling cards all carry a CTA — this
                one now leads to the team section it describes. */}
            <a
              href="#company-team"
              className="self-start text-xs font-semibold text-brand-blue hover:underline"
              data-testid="company-ops-team-link"
            >
              {tOps("teamTitle")} →
            </a>
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
              <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-meta font-medium text-brand-blue">
                {tOps("projectsReadyBadge")}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">{tOps("projectsBody")}</p>
            <p className="text-meta text-text-muted" data-testid="company-ops-projects-count">
              {tOps("projectsCount")}:{" "}
              <span className="font-semibold text-text-primary">{projectContext.projects}</span>
              {projectContext.projects === 0 ? ` · ${tOps("projectsEmpty")}` : ""}
            </p>
            <p className="text-meta leading-relaxed text-text-muted" data-testid="company-ops-projects-linking">
              {tOps("projectsLinkingNote")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/company/projects/new"
                className="w-fit rounded-md border border-brand-blue/40 px-3 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
                data-testid="company-ops-projects-create"
              >
                {tOps("createProject.entryCta")}
              </Link>
              {/* The working assignments board exists at /dashboard/projects
                  but was never reachable from here (audit finding F-D5). */}
              <Link
                href="/dashboard/projects"
                className="w-fit rounded-md border border-ink-500 px-3 py-1 text-xs font-medium text-text-secondary hover:border-brand-blue hover:text-text-primary"
                data-testid="company-ops-projects-manage"
              >
                {tOps("projectsManageCta")} →
              </Link>
            </div>
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
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {tOps("connections.title")}
        </span>
        <p className="text-xs text-text-secondary">{tOps("connections.intro")}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            {
              // Workforce planning zone (Labour Market OS P10) — the visual
              // upcoming-work / capacity / gap view INSIDE this workspace.
              key: "workforce",
              href: "/dashboard/company/planning",
              label: tOps("connections.workforce"),
              note: tOps("connections.workforceNote"),
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

      {/* Teams / brigades (§8.3, branch 13 + Trust Connect Teams v1): a
          brigade is an organizations row (organization_type='team');
          membership arrives ONLY via an accepted join_team invitation (the
          accept is the consent); capability = honest read-only counts from
          members' existing worker_skills; team details + the enquiry inbox
          degrade honestly until the owner applies 20260716130000 /
          20260716131000. Until 20260705220000 is applied the probe reports
          not-applied and the existing honest roster empty state stays —
          nothing is faked. */}
      {teamBrigades.applied ? (
        <TeamBrigadesPanel
          teams={teamBrigades.teams}
          locale={locale}
          invitationsApplied={teamBrigades.invitationsApplied}
          detailsApplied={teamBrigades.detailsApplied}
          enquiriesApplied={teamBrigades.enquiriesApplied}
        />
      ) : (
        <TeamRosterEmptyState variant="company" />
      )}

      {/* Canonical Pakviesti (core-network area B): every invite context
          funnels into the ONE invitation surface on /dashboard/network. */}
      <Link
        href={"/dashboard/network?type=join_as_employee" as "/dashboard"}
        data-testid="company-invite-link"
        className="flex w-fit items-center gap-2 rounded-md border border-brand-blue/50 px-4 py-2 text-sm font-medium text-brand-blue transition-colors hover:border-brand-blue"
      >
        {tNetwork("invite.title")}
      </Link>

      <div id="company-team" className="scroll-mt-20">
        <CompanyWorkersSection
          workersResult={workersResult}
          invitationsResult={invitationsResult}
          labels={workersLabels}
          roleCoordinationEnabled={isOperationsRoleEnabled("foreman")}
          canAssignRoles
        />
      </div>

      {/* F12.4/5: company operating geography — HQ / operating locations /
          desired markets. Owner-gated migration; honest gated state until
          the owner applies it. */}
      <div id="company-locations" className="scroll-mt-20">
        <CompanyLocationsSection
          state={companyLocations}
          labels={companyLocationsLabels}
        />
      </div>

      {/* F13: company gallery — photo evidence across the company's own
          projects (existing journal-photo projection; same RLS, read-only). */}
      <div id="company-gallery" className="scroll-mt-20">
        <CompanyGallerySection
          projects={companyGalleryProjects}
          labels={companyGalleryLabels}
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

      {orgMembers && businessPublicSettings && (
        <div id="public-business-profile" className="scroll-mt-20">
          <BusinessPublicProfilePanel
            orgId={orgMembers.orgId}
            needsMigration={businessPublicSettings.kind === "needs-migration"}
            settings={
              businessPublicSettings.kind === "ok"
                ? businessPublicSettings.settings
                : null
            }
            locale={locale}
          />
        </div>
      )}

      {/* W3 rows 7/8/25 — the CANONICAL demand intake. The FULL wizard
          (describe → criteria → review, structured v2, estimate builder,
          prefill, draft auto-continue, private save-draft leg) moved here
          from the deleted /dashboard/advanced mount. #demand-intake is the
          stable anchor every demand door in the product targets. */}
      <section
        id="company-requests"
        className="card-border flex flex-col gap-5 p-5 scroll-mt-20 sm:p-6"
        data-testid="company-dashboard-first-action"
      >
        <div
          id="demand-intake"
          data-testid="demand-intake-section"
          className="flex flex-col gap-5 scroll-mt-20"
        >
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-brand-cyan">
              <span className="live-dot" aria-hidden />
              {tFlow("company.eyebrow")}
            </span>
            <h2 className="font-display text-2xl font-semibold tracking-tightest text-text-primary">
              {tWow(`demand.${demandPilotKey}.title`)}
            </h2>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-secondary">
              {tWow(`demand.${demandPilotKey}.body`)}
            </p>
          </div>
          <DemandRequestButton
            intent={demandIntent}
            stepTitles={[tFlow("company.c1"), tFlow("company.c2"), tFlow("company.c3")]}
          />
          {/* Static-stepper honesty note (guarded): the steps show progress,
              they are not live modules. */}
          <p
            className="text-meta leading-relaxed text-text-muted"
            data-testid="journey-progress-helper"
          >
            {tWow("demand.progressHelper")}
          </p>
        </div>
      </section>

      {/* The ONE owner readback of what this organisation already asked for
          (moved from /dashboard/advanced) — honest stored status only, with
          the per-demand scouting deep link as the operational follow-up. */}
      <DemandRequestsReadback
        result={demandReadback}
        labels={readbackLabels}
        locale={locale}
      />

      {/* WAGON 10 (areas 18+19) — typed INTERNAL help requests: recruiter /
          accounting / legal / document check / demand-filling help. Creates
          an operator-visible customer_requests record; sends nothing. */}
      {/* Demand-context select stays empty here by design: the panel keeps
          no demand picker in the company room; the RPC still accepts an
          optional demand pointer for the surfaces that own that list. */}
      <HelpRequestPanel demandOptions={[]} />

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
