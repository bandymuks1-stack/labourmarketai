import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { listProjectAssignments } from "@/lib/projects/projects";
import { listProjectMap } from "@/lib/projects/map";
import { listManagedWorkers } from "@/lib/instructions/instructions";
import {
  ProjectAssignmentManager,
  type ProjectManagerLabels,
} from "@/components/app/project-assignment-manager";
import { ProjectMap } from "@/components/app/arena/project-map";
import { ConfirmPulse } from "@/components/app/arena/confirm-pulse";
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("projects");

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
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="card-border p-4 text-sm text-text-secondary">
          {t("managerOnly")}
        </p>
      </div>
    );
  }

  const [projects, workers] = await Promise.all([
    listProjectMap(),
    listManagedWorkers(),
  ]);
  const withAssignments = await Promise.all(
    projects.map(async (p) => ({
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
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          <span className="live-dot" aria-hidden />
          {t("map.eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
      </header>

      {/* ARENA rhythm: the real S3.5 confirm queue pulse, never a fake. */}
      <ConfirmPulse />

      {/* MAP — projects → teams → people; one click into each ARENA. */}
      <ProjectMap projects={projects} locale={locale} />

      {/* DRAFT — the gated create/assign flow (human decision, RPC writes). */}
      <section className="flex flex-col gap-3" data-testid="draft-section">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("draft.title")}
        </h2>
        <ProjectAssignmentManager
          projects={withAssignments}
          workers={workers}
          labels={labels}
        />
      </section>
    </div>
  );
}
