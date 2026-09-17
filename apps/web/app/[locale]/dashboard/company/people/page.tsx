import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import {
  listActiveCompanyWorkers,
  listCompanyWorkerInvitations,
} from "@/lib/company/company-workers";
import { getOrgMembersData } from "@/lib/operations/org-members";
import { getTeamBrigadesData } from "@/lib/company/team-brigades";
import { getWorkerReadiness } from "@/lib/company/worker-readiness";
import { getManagerEvidence } from "@/lib/operations/manager-evidence";
import {
  listRosterLinkCandidatesFromEngagements,
  mergeRosterLinkCandidates,
} from "@/lib/organization-evidence/roster-link-candidates";
import { createClient } from "@/lib/supabase/server";
import { isOperationsRoleEnabled } from "@/lib/operations/role-capabilities";
import { isLifecycleNotice } from "@/lib/lifecycle/lifecycle-model";
import {
  readOrgMembersLabels,
  readWorkersLabels,
} from "@/lib/company/company-section-labels";
import { CompanyWorkersSection } from "@/components/app/company-workers-section";
import { TeamRecordedWork } from "@/components/app/organization/team-recorded-work";
import { TeamBrigadesPanel } from "@/components/app/team-brigades-panel";
import { TeamRosterEmptyState } from "@/components/app/team-roster-empty-state";
import { PeopleImportPanel } from "@/components/app/people-import-panel";
import { OrganizationRosterSection } from "@/components/app/organization-roster-section";
import { WorkerReadinessSummary } from "@/components/app/worker-readiness-summary";
import { ManagerEvidenceCard } from "@/components/app/manager-evidence-card";
import { OrgMembersPanel } from "@/components/app/org-members-panel";
import { LifecycleSection } from "../lifecycle-section";
import { CompanyNoProfileGuide } from "@/components/app/company-next-actions";

/**
 * ŽMONĖS — the organization's people door (owner IA correction 2026-09-16,
 * design/final/03 §2).
 *
 * Every section here was a section of the 1,709-line company hub; each is
 * rendered by the SAME component with the SAME reads and the SAME words, so
 * nothing a manager could do there is lost — it is simply reachable through
 * one door instead of buried under six other domains. The order follows the
 * question the door answers: who is with us now (roster, recorded work) →
 * teams → bringing people in (invite, import, roster readback) → readiness →
 * membership and lifecycle.
 *
 * The four "ops counts" KPI tiles of the hub are one summary sentence now:
 * the numbers stay, the tiles go (constitution §8 — a number is interactive
 * only where it is an operational entry point).
 */
export default async function CompanyPeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = (await searchParams) ?? {};
  const rawLc = typeof sp.lc === "string" ? sp.lc : "";
  const lifecycleNotice = isLifecycleNotice(rawLc) ? rawLc : null;
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("organizationDoors.pages.people");
  const tNetwork = await getTranslations("network");

  const employerCtx = await resolveEmployerCompanyContext();
  const companyProfile =
    employerCtx.kind === "ok" ? await getOwnedCompanyById(employerCtx.companyId) : null;
  const companyRow =
    companyProfile && companyProfile.kind === "ok" ? companyProfile.row : null;
  if (!companyRow) {
    return (
      <div className="flex flex-col gap-6" data-testid="company-people">
        <CompanyNoProfileGuide />
      </div>
    );
  }
  const isStaffingAgency = companyRow.companyType === "staffing_agency";

  const orgContext = await getActiveOrganizationContext();
  const capabilityOrgId =
    orgContext.organizations.find((o) => o.legacyCompanyId === companyRow.id)?.id ??
    orgContext.activeOrganizationId;
  const declaredCapabilities = capabilityOrgId
    ? await readOrganizationCapabilities(capabilityOrgId)
    : [];

  const [rWorkers, rInvitations, orgMembers, teamBrigades, managerEvidence] =
    await Promise.all([
      listActiveCompanyWorkers(companyRow.id),
      listCompanyWorkerInvitations(companyRow.id),
      getOrgMembersData("company", companyRow.id),
      getTeamBrigadesData(),
      getManagerEvidence(),
    ]);
  const workersResult = rWorkers ?? ({ kind: "ok", rows: [] } as const);
  const invitationsResult = rInvitations ?? ({ kind: "ok", rows: [] } as const);
  const activeWorkerRows = workersResult.kind === "ok" ? workersResult.rows : [];
  // Roster-link candidates = the DATABASE's rule (active engagement or
  // membership + a worker row), not the legacy company_workers list alone —
  // the organization's own owner, named on its timesheet, is eligible too.
  const engagementCandidates = capabilityOrgId
    ? await listRosterLinkCandidatesFromEngagements(await createClient(), capabilityOrgId)
    : [];
  const readinessMap = await getWorkerReadiness(activeWorkerRows.map((w) => w.workerId));
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
  const reviewCount = orgMembers?.members.filter((m) => m.reviewEnabled).length ?? 0;

  const [workersLabels, orgMembersLabels] = await Promise.all([
    readWorkersLabels(),
    readOrgMembersLabels(),
  ]);

  return (
    <div className="flex flex-col gap-6" data-testid="company-people">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        <p
          className="font-mono text-meta text-text-muted tabular-nums"
          data-testid="company-people-summary"
        >
          {t("summary", {
            active: activeWorkerRows.length,
            pending: pendingCount,
            members: memberCount,
            review: reviewCount,
          })}
        </p>
      </header>

      <div id="company-team" className="scroll-mt-20">
        <CompanyWorkersSection
          workersResult={workersResult}
          invitationsResult={invitationsResult}
          labels={workersLabels}
          roleCoordinationEnabled={isOperationsRoleEnabled("foreman")}
          canAssignRoles
        />
        {/* Užfiksuotas darbas (owner req. 15–17, #1724): the roster's
            recorded work through THE one work-intelligence reader, one call
            per row as this manager, bounded to the rows above. */}
        <TeamRecordedWork
          locale={locale}
          members={activeWorkerRows.map((w) => ({
            workerId: w.workerId,
            displayName: w.displayName,
            email: w.email,
          }))}
        />
      </div>

      {/* Canonical Pakviesti (core-network area B): every invite context
          funnels into the ONE invitation surface on /dashboard/network. */}
      <Link
        href={"/dashboard/network?type=join_as_employee" as "/dashboard"}
        data-testid="company-invite-link"
        className="flex w-fit items-center gap-2 rounded-md border border-brand-blue/50 px-4 py-2 text-sm font-medium text-brand-blue transition-colors hover:border-brand-blue"
      >
        {tNetwork("invite.title")}
      </Link>

      {/* Teams / brigades (§8.3): a brigade is an organizations row
          (organization_type='team'); membership arrives ONLY via an accepted
          join_team invitation; honest not-applied state otherwise. */}
      {teamBrigades.applied ? (
        <TeamBrigadesPanel
          teams={teamBrigades.teams}
          locale={locale}
          invitationsApplied={teamBrigades.invitationsApplied}
          detailsApplied={teamBrigades.detailsApplied}
          enquiriesApplied={teamBrigades.enquiriesApplied}
        />
      ) : (
        <TeamRosterEmptyState variant={isStaffingAgency ? "agency" : "company"} />
      )}

      {/* BRINGING PEOPLE IN. The relationship that LEADS follows what the
          workspace declared; every other truthful relationship stays
          available, because an agency still employs people and a school
          still hires. */}
      {capabilityOrgId ? (
        <div id="people-import-section" className="scroll-mt-20">
          <PeopleImportPanel
            organizationName={(companyRow.displayName || companyRow.legalName || "").trim()}
            suggested={
              declaredCapabilities.includes("training_provider")
                ? "student"
                : isStaffingAgency ||
                    declaredCapabilities.includes("workforce_provider") ||
                    declaredCapabilities.includes("recruitment_partner")
                  ? "candidate"
                  : "employee"
            }
          />
        </div>
      ) : null}

      {/* THE ROSTER, READ BACK — directly under the panel that fills it. */}
      {capabilityOrgId ? (
        <OrganizationRosterSection
          locale={locale}
          linkCandidates={mergeRosterLinkCandidates(
            activeWorkerRows
              .filter((w) => w.status === "active")
              .map((w) => ({ workerId: w.workerId, profileId: w.profileId, name: w.displayName ?? w.email ?? w.workerId })),
            engagementCandidates,
          )}
        />
      ) : null}

      <WorkerReadinessSummary rows={readinessRows} />

      {managerEvidence && <ManagerEvidenceCard evidence={managerEvidence} />}

      {orgMembers && (
        <OrgMembersPanel
          orgId={orgMembers.orgId}
          members={orgMembers.members}
          addable={orgMembers.addable}
          labels={orgMembersLabels}
        />
      )}

      {/* Employment lifecycle on the SAME canonical engagement_contexts rows
          the members panel above manages. Honest gated state until applied. */}
      {orgMembers && (
        <LifecycleSection locale={locale} orgId={orgMembers.orgId} notice={lifecycleNotice} />
      )}
    </div>
  );
}
