import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  listManagedProjects,
  listProjectAssignments,
} from "@/lib/projects/projects";
import { listManagedWorkers } from "@/lib/instructions/instructions";
import {
  ProjectAssignmentManager,
  type ProjectManagerLabels,
} from "@/components/app/project-assignment-manager";
import { type Role } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * F4 — manager surface to create projects and assign roster workers to them
 * (the prerequisite for project-scoped instructions, F5). Manager-only; every
 * write is gated by the project + caller-roster RPCs. Honest empty states.
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
    listManagedProjects(),
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
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
      </header>
      <ProjectAssignmentManager
        projects={withAssignments}
        workers={workers}
        labels={labels}
      />
      {withAssignments.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("operationsTitle")}
          </h2>
          <ul className="flex flex-col gap-1">
            {withAssignments.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${locale}/dashboard/projects/${p.id}/operations`}
                  className="text-sm text-brand-cyan hover:underline"
                  data-testid="project-operations-link"
                >
                  {(p.title ?? t("untitledFallback")) + " →"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
