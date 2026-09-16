import { setRequestLocale, getTranslations } from "next-intl/server";
import { FolderPlus, History, UserPlus, UserSearch } from "lucide-react";

import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import {
  getOwnedCompanyById,
  type CompanyReadResult,
} from "@/lib/company/company-setup";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
import { listClaimablePublicIntakes } from "@/lib/company/claim-public-intake";
import { listMyConnectionInvites } from "@/lib/agency/bridge-read";
import { listAgencyClients } from "@/lib/agency/clients";
import {
  listActiveCompanyWorkers,
  listCompanyWorkerInvitations,
} from "@/lib/company/company-workers";
import { getTeamBrigadesData } from "@/lib/company/team-brigades";
import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";
import { loadCompanyHomeField } from "@/lib/company/company-home-field";
import { CompanyHomeFieldSection } from "@/components/app/company-home-field-section";
import { CompanyNoProfileGuide } from "@/components/app/company-next-actions";

// The employer demand kinds the home field's "what we are missing" reads —
// a dual-role user's buyer service requests stay in the buyer room.
const EMPLOYER_DEMAND_KINDS = ["company_request", "agency_offer"] as const;

/**
 * DABAR — the organization's first screen (owner IA correction 2026-09-16,
 * design/final/03 §0, §2).
 *
 * It answers four questions and nothing else:
 *   WHAT IS HAPPENING   the home field (frozen design §2.6 C1): each active
 *                       project as one row [now | next DERIVED | risk], who is
 *                       free now, what is missing within four weeks, what
 *                       needs you, partners — every object a door to the
 *                       SAME page or action the chat would dispatch;
 *   WHAT NEEDS ME       the decisions strip — pending journal reviews,
 *                       pending invitations, claimable public intakes; zero
 *                       pending = no strip, never fake urgency;
 *   WHAT CAN I DO       four primary actions — a need, a project, an
 *                       invitation, the historical import;
 *   WHERE CAN I GO      the organization doors, rendered by the layout above
 *                       this page on EVERY organization route.
 *
 * Everything that used to stack below (twenty-odd sections across six
 * domains) now lives behind its door: People, Work (`/dashboard/projects`),
 * Needs, Calendar, Partners, Learning, History, Settings. Same components,
 * same reads, same words — reached through one door instead of one scroll.
 * Regrowth is guarded (`lib/guards/product-ia-anti-slop.test.ts`).
 */
export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("roleDashboards.company");
  const tDoors = await getTranslations("organizationDoors.pages.now");
  const tSpaces = await getTranslations("spaces");
  const tRooms = await getTranslations("companyActionRooms");

  // The ACTIVE WORKSPACE's company (membership-validated; `getOwnedCompanyById`
  // re-checks creator ownership row-side). No valid company workspace → the
  // clean setup guide, never empty technical blocks.
  const employerCtx = await resolveEmployerCompanyContext();
  const companyProfile: CompanyReadResult =
    employerCtx.kind === "ok"
      ? await getOwnedCompanyById(employerCtx.companyId)
      : employerCtx.reason === "needs-migration"
        ? { kind: "needs-migration" }
        : { kind: "ok", row: null };
  // A company row with NO legal name is the unnamed shell the setup form
  // completes — a nameless workspace is not a workspace.
  const setupIncomplete =
    companyProfile.kind === "ok" &&
    companyProfile.row !== null &&
    companyProfile.row.legalName === null;
  if (companyProfile.kind === "ok" && (companyProfile.row === null || setupIncomplete)) {
    return (
      <div className="flex flex-col gap-6" data-testid="company-dashboard">
        <TelemetryView
          event={FUNNEL_EVENTS.companyDashboardViewed}
          metadata={{ surface: "company", step: setupIncomplete ? "setup_incomplete" : "no_profile" }}
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
  const companyRow = companyProfile.kind === "ok" ? companyProfile.row : null;
  const isStaffingAgency = companyRow?.companyType === "staffing_agency";
  const isCompanyOwner = !!companyRow;

  // WHAT DOES THIS ORGANIZATION DO? — answered against the `organizations`
  // row this company mirrors; a separate axis from `companyType`.
  const orgContext = await getActiveOrganizationContext();
  const capabilityOrgId =
    orgContext.organizations.find((o) => o.legacyCompanyId === companyRow?.id)?.id ??
    orgContext.activeOrganizationId;
  const declaredCapabilities = capabilityOrgId
    ? await readOrganizationCapabilities(capabilityOrgId)
    : [];

  // ONE parallel batch. The roster read is shared with the home field's
  // who-is-free answer (QA Q-3), so it is created once and both subscribe.
  const rosterRead = companyRow ? listActiveCompanyWorkers(companyRow.id) : null;
  const [
    demandReadback,
    claimableIntakes,
    clientInvites,
    agencyClientsState,
    rInvitations,
    teamBrigades,
    reviewPendingCount,
    rHomeField,
  ] = await Promise.all([
    listOwnCustomerRequests(EMPLOYER_DEMAND_KINDS),
    listClaimablePublicIntakes(),
    isCompanyOwner && !isStaffingAgency ? listMyConnectionInvites() : null,
    isStaffingAgency ? listAgencyClients() : null,
    companyRow ? listCompanyWorkerInvitations(companyRow.id) : null,
    companyRow ? getTeamBrigadesData() : Promise.resolve({ applied: false } as const),
    companyRow ? countReviewablePendingEntries() : Promise.resolve(0),
    companyRow ? loadCompanyHomeField({ roster: rosterRead }) : null,
  ] as const);

  const pendingCount =
    rInvitations && rInvitations.kind === "ok"
      ? rInvitations.rows.filter((i) => i.status === "pending").length
      : 0;

  const decisionEntries = [
    { key: "review", count: reviewPendingCount, href: `/${locale}/dashboard/inbox` },
    {
      key: "invitations",
      count: pendingCount,
      href: `/${locale}/dashboard/company/people#company-invitations`,
    },
    {
      key: "claims",
      count: claimableIntakes.length,
      href: `/${locale}/dashboard/company/needs#company-claims`,
    },
  ].filter((e) => e.count > 0);

  const primaryActions = [
    {
      key: "need",
      href: "/dashboard/company/needs#demand-intake",
      label: tDoors("newNeed"),
      icon: <UserSearch className="h-4 w-4" aria-hidden />,
    },
    {
      key: "project",
      href: "/dashboard/company/projects/new",
      label: tDoors("newProject"),
      icon: <FolderPlus className="h-4 w-4" aria-hidden />,
    },
    {
      key: "invite",
      href: "/dashboard/network?type=join_as_employee",
      label: tDoors("invite"),
      icon: <UserPlus className="h-4 w-4" aria-hidden />,
    },
    {
      key: "history",
      href: "/dashboard/company/history",
      label: tDoors("importHistory"),
      icon: <History className="h-4 w-4" aria-hidden />,
    },
  ] as const;

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
        <p
          className="font-mono text-meta uppercase tracking-label text-brand-orange"
          data-testid="company-context"
        >
          {tRooms("company.context")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{tDoors("subtitle")}</p>
        {/* ONE canonical company profile — the workspace re-labels itself
            from companies.company_type after every save/refresh. An agency is
            this same profile with type 'staffing_agency'. */}
        {companyRow ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className="rounded-sm border border-brand-cyan/40 bg-brand-cyan/5 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
              data-testid="company-dashboard-type-chip"
            >
              {t(`setup.companyTypeOptions.${companyRow.companyType}`)}
            </span>
            {companyRow.companyType === "staffing_agency" ? (
              <span className="text-meta text-text-muted" data-testid="company-dashboard-type-note">
                {t("typeNotes.staffing_agency")}
              </span>
            ) : companyRow.companyType === "client_customer" ? (
              <span className="text-meta text-text-muted" data-testid="company-dashboard-type-note">
                {t("typeNotes.client_customer")}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* WHAT NEEDS ME — count-gated; zero pending = no strip. */}
      {decisionEntries.length > 0 ? (
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
      ) : null}

      {/* WHAT IS HAPPENING — the home field (frozen design §2.6 C1). */}
      {rHomeField ? (
        <CompanyHomeFieldSection
          locale={locale}
          capabilities={declaredCapabilities}
          field={rHomeField}
          needs={
            demandReadback.kind === "ok"
              ? {
                  kind: "ok",
                  // NEEDS, not every request the organisation owns: an agency's
                  // own `agency_offer` is capacity it HAS.
                  rows: demandReadback.rows.filter((r) => r.direction === "demand"),
                }
              : demandReadback.kind === "needs-migration"
                ? { kind: "needs-migration" }
                : { kind: "error" }
          }
          partners={{
            agencies: clientInvites && clientInvites.kind === "ok" ? clientInvites.rows : null,
            clients:
              agencyClientsState && agencyClientsState.kind === "ok"
                ? agencyClientsState.rows
                : null,
            teams: teamBrigades.applied
              ? teamBrigades.teams.map((tm) => ({
                  id: tm.id,
                  name: tm.name,
                  members: tm.members.length,
                }))
              : null,
          }}
        />
      ) : null}

      {/* WHAT CAN I DO — the four primary actions, each the canonical one. */}
      <nav
        aria-label={tDoors("primaryActions")}
        data-testid="company-primary-actions"
        className="flex flex-wrap gap-2"
      >
        {primaryActions.map((a) => (
          <Link
            key={a.key}
            href={a.href as "/dashboard"}
            data-testid={`company-primary-action-${a.key}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-brand-blue/50 bg-brand-blue/10 px-3 py-2 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {a.icon}
            {a.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
