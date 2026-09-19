import "server-only";
import { getTranslations } from "next-intl/server";

import { OPPORTUNITY_TYPES } from "@/lib/demand/structured-demand-v2";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

/**
 * ORGANIZATION SECTION LABELS — the message plumbing the company hub used to
 * carry inline (owner IA correction 2026-09-16, design/final/03 §1.1).
 *
 * Each function resolves ONE section's copy in the active locale, exactly as
 * the 1,709-line hub resolved it, so the door pages (`/dashboard/company/*`)
 * compose the SAME sections with the SAME words. Moving the text out of the
 * page is what lets a door page be a hundred lines instead of a copy of the
 * hub. No key changed; no copy changed.
 */

export async function readDemandReadbackLabels() {
  const tReadback = await getTranslations("demandReadback");
  const tStructured = await getTranslations("structuredDemand");
  const tWow = await getTranslations("auth.dashboard.wow");
  const tReqStatus = await getTranslations(
    "roleDashboards.buyer.requests.understanding.requestStatus",
  );
  return {
    syntheticTitle: {
      hiringWorkers: tReadback("syntheticTitle.hiringWorkers"),
      agencyPartnership: tReadback("syntheticTitle.agencyPartnership"),
    },
    heading: tReadback("heading"),
    note: tReadback("note"),
    // The supply half of the same readback — capacity this organisation has
    // OFFERED, which is the opposite direction to what it asked for.
    supplyHeading: tReadback("supplyHeading"),
    supplyNote: tReadback("supplyNote"),
    workerVisibilityNote: tReadback("workerVisibilityNote"),
    empty: tReadback("empty"),
    created: tReadback("created"),
    manageHelp: tReadback("manageHelp"),
    scoutLink: tReadback("scoutLink"),
    repeatLink: tReadback("repeatLink"),
    status: {
      draft: tReqStatus("draft"),
      submitted: tReqStatus("submitted"),
      in_review: tReqStatus("in_review"),
      needs_followup: tReqStatus("needs_followup"),
      approved: tReqStatus("approved"),
      closed: tReqStatus("closed"),
    },
    statusOther: tReadback("statusOther"),
    capacityNeeded: (count: number) => tReadback("capacityNeeded", { count }),
    capacityInterested: (count: number) => tReadback("capacityInterested", { count }),
    detailsLabel: tReadback("detailsLabel"),
    fields: {
      description: tReadback("fields.description"),
      role: tReadback("fields.role"),
      location: tReadback("fields.location"),
      skills: tReadback("fields.skills"),
      urgency: tReadback("fields.urgency"),
      notes: tReadback("fields.notes"),
      opportunityType: tReadback("fields.opportunityType"),
    },
    opportunityTypeValues: Object.fromEntries(
      OPPORTUNITY_TYPES.map((v) => [v, tStructured(`opportunityType.${v}`)]),
    ),
    urgencyValues: {
      flexible: tWow("demand.form.urgencyFlexible"),
      this_week: tWow("demand.form.urgencyThisWeek"),
      urgent: tWow("demand.form.urgencyUrgent"),
    },
  };
}

export async function readWorkObjectsLabels() {
  const tLocs = await getTranslations("workObjects");
  const tCountries = await getTranslations("labourMarket");
  return {
    title: tLocs("title"),
    subtitle: tLocs("subtitle"),
    nameLabel: tLocs("nameLabel"),
    countryLabel: tLocs("countryLabel"),
    regionLabel: tLocs("regionLabel"),
    cityLabel: tLocs("cityLabel"),
    addressLabel: tLocs("addressLabel"),
    projectLabel: tLocs("projectLabel"),
    projectNone: tLocs("projectNone"),
    responsibleLabel: tLocs("responsibleLabel"),
    responsibleNone: tLocs("responsibleNone"),
    responsibleSave: tLocs("responsibleSave"),
    addButton: tLocs("addButton"),
    editButton: tLocs("editButton"),
    saveButton: tLocs("saveButton"),
    archiveButton: tLocs("archiveButton"),
    restoreButton: tLocs("restoreButton"),
    archivedHeading: tLocs("archivedHeading"),
    archivedBadge: tLocs("archivedBadge"),
    empty: tLocs("empty"),
    gatedHeading: tLocs("gatedHeading"),
    gatedBody: tLocs("gatedBody"),
    errorLabel: tLocs("errorLabel"),
    notAuthorizedLabel: tLocs("notAuthorizedLabel"),
    savedLabel: tLocs("savedLabel"),
    countries: Object.fromEntries(
      MARKET_COUNTRIES.map((c) => [c, tCountries(`countryNames.${c}`)]),
    ),
    countryCodes: MARKET_COUNTRIES,
  };
}

export async function readCompanyGalleryLabels() {
  const tCompanyGallery = await getTranslations("companyGallery");
  return {
    title: tCompanyGallery("title"),
    subtitle: tCompanyGallery("subtitle"),
    photosLabel: tCompanyGallery("photosLabel"),
    openLabel: tCompanyGallery("openLabel"),
    empty: tCompanyGallery("empty"),
  };
}

export async function readAgencyClientsLabels() {
  const tAgencyClients = await getTranslations("agencyClients");
  return {
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
  };
}

export async function readAgencyBridgeLabels() {
  const tAB = await getTranslations("agencyBridge");
  return {
    title: tAB("title"),
    subtitle: tAB("subtitle"),
    gatedHeading: tAB("gatedHeading"),
    gatedBody: tAB("gatedBody"),
    connectionsHeading: tAB("connectionsHeading"),
    inviteEmailLabel: tAB("inviteEmailLabel"),
    inviteButton: tAB("inviteButton"),
    revokeButton: tAB("revokeButton"),
    noConnections: tAB("noConnections"),
    sharedHeading: tAB("sharedHeading"),
    noShared: tAB("noShared"),
    workerLabel: tAB("workerLabel"),
    workerPlaceholder: tAB("workerPlaceholder"),
    offerButton: tAB("offerButton"),
    noRoster: tAB("noRoster"),
    goToRoster: tAB("goToRoster"),
    invalidLabel: tAB("invalidLabel"),
    progressHeading: tAB("progressHeading"),
    noOffers: tAB("noOffers"),
    withdrawButton: tAB("withdrawButton"),
    openScouting: tAB("openScouting"),
    errorLabel: tAB("errorLabel"),
    statusLabels: {
      pending: tAB("status.pending"),
      active: tAB("status.active"),
      declined: tAB("status.declined"),
      revoked: tAB("status.revoked"),
    },
    stageLabels: {
      offered: tAB("stage.offered"),
      reviewed: tAB("stage.reviewed"),
      contacted: tAB("stage.contacted"),
      rejected: tAB("stage.rejected"),
      booking_started: tAB("stage.booking_started"),
      accepted: tAB("stage.accepted"),
      // the client's explicit decision on a candidate (20260903101000)
      decision_accepted: tAB("stage.decision_accepted"),
      decision_declined: tAB("stage.decision_declined"),
    },
  };
}

export async function readClientBridgeLabels() {
  const tCB = await getTranslations("clientBridge");
  return {
    title: tCB("title"),
    subtitle: tCB("subtitle"),
    gatedHeading: tCB("gatedHeading"),
    gatedBody: tCB("gatedBody"),
    invitesHeading: tCB("invitesHeading"),
    noInvites: tCB("noInvites"),
    acceptButton: tCB("acceptButton"),
    declineButton: tCB("declineButton"),
    activeHeading: tCB("activeHeading"),
    noActive: tCB("noActive"),
    revokeButton: tCB("revokeButton"),
    shareLabel: tCB("shareLabel"),
    sharePlaceholder: tCB("sharePlaceholder"),
    shareButton: tCB("shareButton"),
    noDemands: tCB("noDemands"),
    errorLabel: tCB("errorLabel"),
    fromAgency: tCB("fromAgency"),
    sharedHeading: tCB("sharedHeading"),
    noShared: tCB("noShared"),
    unshareButton: tCB("unshareButton"),
  };
}

export async function readOrgMembersLabels() {
  const tOrg = await getTranslations("orgMembers");
  return {
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
    // W9 slice 1 — membership revocation.
    remove: tOrg("remove"),
    removeConfirm: tOrg("removeConfirm"),
    removeCancel: tOrg("removeCancel"),
    removeReasonLabel: tOrg("removeReasonLabel"),
    ownerLocked: tOrg("ownerLocked"),
    removed: tOrg("removed"),
    // R-4 GREEN — confirmation authority for governance members.
    authorityTitle: tOrg("authority.title"),
    authorityIntro: tOrg("authority.intro"),
    authorityGrant: tOrg("authority.grant"),
    authorityGranted: tOrg("authority.granted"),
    roles: {
      owner: tOrg("roles.owner"),
      admin: tOrg("roles.admin"),
      manager: tOrg("roles.manager"),
      external_manager: tOrg("roles.external_manager"),
      employee: tOrg("roles.employee"),
      collaborator: tOrg("roles.collaborator"),
      consultant: tOrg("roles.consultant"),
      freelancer: tOrg("roles.freelancer"),
      viewer: tOrg("roles.viewer"),
    },
  };
}

export async function readWorkersLabels() {
  const tWorkers = await getTranslations("roleDashboards.company.workers");
  return {
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
          outcomeConnected: tWorkers(
            "operations.assign.provision.outcomeConnected",
          ),
          outcomeAlreadyConnected: tWorkers(
            "operations.assign.provision.outcomeAlreadyConnected",
          ),
          outcomeNotOwner: tWorkers(
            "operations.assign.provision.outcomeNotOwner",
          ),
          outcomeNotLinked: tWorkers(
            "operations.assign.provision.outcomeNotLinked",
          ),
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
          outcomeNotLinked: tWorkers(
            "operations.assign.review.outcomeNotLinked",
          ),
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
}
