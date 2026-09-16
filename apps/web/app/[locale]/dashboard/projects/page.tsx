import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyActionNextActions } from "@/components/app/company-action-next-actions";
import { listProjectAssignments } from "@/lib/projects/projects";
import { listProjectMap } from "@/lib/projects/map";
import { getProjectsProgress } from "@/lib/projects/progress";
import { listManagedWorkers } from "@/lib/instructions/instructions";
import { listBookingEngagementWorkers } from "@/lib/projects/booking-engagement-workers";
import {
  ProjectAssignmentManager,
  type ProjectManagerLabels,
} from "@/components/app/project-assignment-manager";
import { ProjectMap } from "@/components/app/arena/project-map";
import { ConfirmPulse } from "@/components/app/arena/confirm-pulse";
import { listWorkerProjects } from "@/lib/projects/worker-project-access";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOrgWorkObjects } from "@/lib/objects/objects";
import { listManagedProjects } from "@/lib/projects/projects";
import { getOrgMembersData } from "@/lib/operations/org-members";
import { listOrganizationMembers } from "@/lib/company/memberships";
import { getProjectGallerySummary } from "@/lib/journal/project-gallery";
import {
  readCompanyGalleryLabels,
  readWorkObjectsLabels,
} from "@/lib/company/company-section-labels";
import { WorkObjectsSection } from "@/components/app/work-objects-section";
import { CompanyGallerySection } from "@/components/app/company-gallery-section";
import { OrganizationDoorsServer } from "@/components/app/organization/organization-doors-server";
import { getCompanyProjectContext } from "@/lib/company/project-context";
import { MapPin } from "lucide-react";
import { type Role } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * The manager MAP (TASK 07 slice 2 — MAP → ARENA → DRAFT, living-arena skin
 * over the F4 surface). MAP: arena cards with real team sizes, one click to
 * the ARENA (operations). Pulse: the S3.5 confirm queue woven into the
 * rhythm. DRAFT: the existing gated create/assign flow — every write still
 * goes through the project + caller-roster RPCs; the human decides. Honest
 * empty states throughout.
 */
export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const showArchived = (await searchParams).archived === "1";
  const t = await getTranslations("projects");
  const tRooms = await getTranslations("companyActionRooms");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role = (profile?.active_role as Role) ?? "worker";
  if (!MANAGER_ROLES.has(role)) {
    // RC2 role-aware routing (F11): a worker who lands here gets THEIR OWN
    // projects (real assignments under RLS), never a dead "managers only"
    // explanation. Honest empty state when they have no assignments yet.
    const myProjects = await listWorkerProjects();
    return (
      <div
        className="mx-auto flex w-full max-w-content flex-col gap-4"
        data-testid="worker-projects-list"
      >
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("myProjectsTitle")}
        </h1>
        {myProjects.length === 0 ? (
          <p className="card-border p-4 text-sm text-text-secondary">
            {t("myProjectsEmpty")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {myProjects.map((p) => (
              <li key={p.projectId}>
                <Link
                  href={`/dashboard/projects/${p.projectId}`}
                  data-testid="worker-project-card"
                  className="card-border flex flex-col gap-2 p-4 transition-colors hover:border-brand-blue"
                >
                  <span className="font-display text-base font-semibold tracking-tightest text-text-primary">
                    {p.title ?? t("untitledProject")}
                  </span>
                  {p.city || p.country ? (
                    <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-secondary">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {[p.city, p.country].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                  <span
                    className={
                      p.assignmentStatus === "active"
                        ? "w-fit rounded-full border border-state-success/40 bg-state-success/10 px-2.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-success"
                        : "w-fit rounded-full border border-ink-500 bg-ink-800 px-2.5 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary"
                    }
                  >
                    {p.assignmentStatus === "active"
                      ? t("assignmentActive")
                      : t("assignmentEnded")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // DARBAI is one of the organization doors (IA 2026-09-16): the objects /
  // sites register and the project gallery lived only inside the company
  // hub; they belong with the projects they are attached to. Same reads,
  // same components as the hub used; the manager's ONE company context
  // scopes them, and a manager without a company workspace simply sees the
  // projects surface as before.
  const employerCtx = await resolveEmployerCompanyContext();
  const ownCompanyId = employerCtx.kind === "ok" ? employerCtx.companyId : null;
  const [
    allProjects,
    workers,
    engagementResult,
    workObjectsRead,
    managedProjects,
    orgMembers,
    tDoors,
    workObjectsLabels,
    companyGalleryLabels,
  ] = await Promise.all([
    listProjectMap(),
    listManagedWorkers(),
    // Accepted-booking engagement candidates (bridge v1) — a SEPARATE list,
    // never merged into the roster read; empty + honest until the owner
    // applies migration 20260723120000.
    listBookingEngagementWorkers(),
    getOrgWorkObjects(),
    ownCompanyId ? listManagedProjects() : Promise.resolve([]),
    ownCompanyId ? getOrgMembersData("company", ownCompanyId) : Promise.resolve(null),
    getTranslations("organizationDoors"),
    readWorkObjectsLabels(),
    readCompanyGalleryLabels(),
  ]);
  // The projects card the company hub used to carry (count · structurally
  // ready · the honest linking note · create) — now beside the projects it
  // counts. Read-only: `getCompanyProjectContext` performs no writes.
  const [projectContext, tOps] = await Promise.all([
    getCompanyProjectContext(ownCompanyId),
    getTranslations("companyOps"),
  ]);
  const [orgMembersForObjects, companyGalleryProjects] = await Promise.all([
    orgMembers ? listOrganizationMembers(orgMembers.orgId) : Promise.resolve(null),
    Promise.all(
      managedProjects.slice(0, 12).map(async (p) => ({
        projectId: p.id,
        title: p.title,
        photoCount: (await getProjectGallerySummary(p.id)).photoCount,
      })),
    ),
  ]);

  // Train D — archived filtering: a COMPLETED project is finished work.
  // The map and the draft (assignment) flow show ACTIVE work by default;
  // finished projects live behind an honest toggle (count always visible,
  // no dead buttons — a completed project accepts no new assignments, and
  // the RPC refuses them anyway).
  const archivedProjects = allProjects.filter((p) => p.status === "completed");
  const activeProjects = allProjects.filter((p) => p.status !== "completed");
  const projects = showArchived ? archivedProjects : activeProjects;

  // Train D — derived progress (tasks + stages done/total, computed at
  // read time; no stored number anywhere).
  const progressById = await getProjectsProgress(projects.map((p) => p.id));

  const withAssignments = await Promise.all(
    activeProjects.map(async (p) => ({
      ...p,
      assignments: await listProjectAssignments(p.id),
    })),
  );

  const labels: ProjectManagerLabels = {
    createTitle: t("create.title"),
    createNameLabel: t("create.nameLabel"),
    createNamePlaceholder: t("create.namePlaceholder"),
    createCityLabel: t("create.cityLabel"),
    createCityPlaceholder: t("create.cityPlaceholder"),
    createSubmit: t("create.submit"),
    noCompany: t("create.noCompany"),
    assignTitle: t("assign.title"),
    projectLabel: t("assign.projectLabel"),
    projectPlaceholder: t("assign.projectPlaceholder"),
    workerLabel: t("assign.workerLabel"),
    workerPlaceholder: t("assign.workerPlaceholder"),
    assignSubmit: t("assign.submit"),
    assigned: t("assign.assigned"),
    notAuthorized: t("assign.notAuthorized"),
    needsMigration: t("needsMigration"),
    errorMsg: t("error"),
    noProjects: t("noProjects"),
    noWorkers: t("assign.noWorkers"),
    assignmentsTitle: t("assignmentsTitle"),
    noAssignments: t("noAssignments"),
    end: t("end"),
    sending: t("sending"),
    assignFromRoster: t("assign.fromRoster"),
    openBoard: t("map.openArena"),
    rosterGroupLabel: t("assign.rosterGroup"),
    engagementGroupLabel: t("assign.engagementGroup"),
    reservationCollidesTitle: t("assign.reservation.collidesTitle"),
    reservationNotBlocking: t("assign.reservation.notBlocking"),
    reservationUnknown: t("assign.reservation.unknown"),
    reservationSource: {
      project: t("assign.reservation.source.project"),
      booking: t("assign.reservation.source.booking"),
      trip: t("assign.reservation.source.trip"),
      absence: t("assign.reservation.source.absence"),
    },
  };

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      {ownCompanyId ? <OrganizationDoorsServer ariaLabel={tDoors("label")} /> : null}
      <header className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="self-start text-xs font-medium text-brand-blue transition-colors hover:underline"
          data-testid="back-to-action-center"
        >
          ← {tRooms("backToActions")}
        </Link>
        <p
          className="font-mono text-meta uppercase tracking-label text-brand-orange"
          data-testid="company-context"
        >
          {tRooms("projects.context")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
        {/* WAGON 6 — compact operating-model explainer: one honest line +
            a link to the full /about#sports-model section. No game layer. */}
        <p
          className="mt-1 max-w-prose rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          data-testid="projects-model-note"
        >
          {t("model.note")}{" "}
          <Link
            href="/about#sports-model"
            className="whitespace-nowrap text-brand-blue hover:underline"
          >
            {t("model.link")} →
          </Link>
        </p>
      </header>

      <CompanyActionNextActions
        room="projects"
        primaryHref="/dashboard/company/projects/new"
      />
      {ownCompanyId ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-4"
          data-testid="company-ops-projects"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-text-primary">
              {tOps("projectsTitle")}
            </h2>
            <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-meta font-medium text-brand-blue">
              {tOps("projectsReadyBadge")}
            </span>
          </div>
          <p className="text-meta text-text-muted" data-testid="company-ops-projects-count">
            {tOps("projectsCount")}:{" "}
            <span className="font-semibold text-text-primary">{projectContext.projects}</span>
            {projectContext.projects === 0 ? ` · ${tOps("projectsEmpty")}` : ""}
          </p>
          <p className="text-meta leading-relaxed text-text-muted" data-testid="company-ops-projects-linking">
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
      ) : null}

      {/* ARENA rhythm: the real S3.5 confirm queue pulse, never a fake. */}
      <ConfirmPulse />

      {/* Train D — active/archived switch: finished work stays reachable,
          never mixed into the operating map. */}
      <nav
        className="flex flex-wrap items-center gap-3"
        aria-label={t("archiveToggle.label")}
        data-testid="projects-archive-toggle"
      >
        <Link
          href="/dashboard/projects"
          aria-current={!showArchived ? "true" : undefined}
          className={`text-xs font-semibold ${!showArchived ? "text-brand-blue" : "text-text-muted hover:text-brand-blue"}`}
          data-testid="projects-view-active"
        >
          {t("archiveToggle.active")} ({activeProjects.length})
        </Link>
        <Link
          href={"/dashboard/projects?archived=1" as "/dashboard"}
          aria-current={showArchived ? "true" : undefined}
          className={`text-xs font-semibold ${showArchived ? "text-brand-blue" : "text-text-muted hover:text-brand-blue"}`}
          data-testid="projects-view-archived"
        >
          {t("archiveToggle.archived")} ({archivedProjects.length})
        </Link>
      </nav>

      {/* MAP — projects → teams → people; one click into each ARENA. */}
      {showArchived && projects.length === 0 ? (
        <p
          className="card-border p-4 text-sm text-text-secondary"
          data-testid="projects-archived-empty"
        >
          {t("archiveToggle.empty")}
        </p>
      ) : null}
      <ProjectMap
        projects={projects}
        locale={locale}
        progress={progressById}
      />

      {/* DRAFT — the gated create/assign flow (human decision, RPC writes). */}
      <section className="flex flex-col gap-3" data-testid="draft-section">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("draft.title")}
        </h2>
        <ProjectAssignmentManager
          projects={withAssignments}
          workers={workers}
          engagementWorkers={[...engagementResult.workers]}
          labels={labels}
        />
      </section>

      {/* OBJECTS / SITES — the canonical work_objects entity (membership-based
          authority), where people, hours and photos are attached. Honest
          gated state until applied. */}
      <div id="company-locations" className="flex flex-col gap-2 scroll-mt-20">
        <p className="text-xs text-text-secondary">{tDoors("pages.work.objectsIntro")}</p>
        <WorkObjectsSection
          state={
            workObjectsRead.kind === "ok"
              ? { kind: "ok", rows: workObjectsRead.rows }
              : workObjectsRead.kind === "needs-migration"
                ? { kind: "needs-migration" }
                : workObjectsRead.kind === "no-company"
                  ? { kind: "ok", rows: [] }
                  : { kind: "error" }
          }
          projects={managedProjects.map((p) => ({
            id: p.id,
            title: p.title ?? p.id.slice(0, 8),
          }))}
          members={
            orgMembersForObjects && orgMembersForObjects.kind === "ok"
              ? orgMembersForObjects.members
                  .filter((m) => m.status === "active")
                  .map((m) => ({
                    profileId: m.profileId,
                    name: m.fullName ?? m.email ?? m.profileId.slice(0, 8),
                  }))
              : []
          }
          labels={workObjectsLabels}
        />
      </div>

      {/* F13: company gallery — photo evidence across the company's own
          projects (existing journal-photo projection; same RLS, read-only). */}
      <div id="company-gallery" className="scroll-mt-20">
        <CompanyGallerySection projects={companyGalleryProjects} labels={companyGalleryLabels} />
      </div>
    </div>
  );
}
