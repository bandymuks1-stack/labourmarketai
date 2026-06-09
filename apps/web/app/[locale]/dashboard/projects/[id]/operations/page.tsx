import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getProjectOperations } from "@/lib/projects/operations";
import {
  ProjectOperationsBoard,
  type OperationsBoardLabels,
} from "@/components/app/project-operations-board";
import { type Role } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * Pilot Operations Launch v1 — project worker operations board.
 *
 * Manager-only, project-scoped. Every read goes through the project's EXISTING
 * RLS (a manager reads only projects they manage and only their workers'
 * employer-visible signals). No migration, no new grant, no service_role.
 */
export default async function ProjectOperationsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("projectOps");

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
          {t("eyebrow")}
        </h1>
        <p className="card-border p-4 text-sm text-text-secondary">{t("managerOnly")}</p>
      </div>
    );
  }

  const ops = await getProjectOperations(id);
  if (!ops) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("eyebrow")}
        </h1>
        <p className="card-border p-4 text-sm text-text-secondary" data-testid="ops-not-authorized">
          {t("notAuthorized")}
        </p>
      </div>
    );
  }

  const labels: OperationsBoardLabels = {
    eyebrow: t("eyebrow"),
    untitledProject: t("untitledProject"),
    statusLabel: t("statusLabel"),
    locationLabel: t("locationLabel"),
    startLabel: t("startLabel"),
    notSet: t("notSet"),
    schemaNote: t("schemaNote"),
    countersTitle: t("countersTitle"),
    totalAssigned: t("counters.totalAssigned"),
    ready: t("counters.ready"),
    readyBasis: t("counters.readyBasis"),
    needsDeclaredSkills: t("counters.needsDeclaredSkills"),
    needsEvidence: t("counters.needsEvidence"),
    needsFollowUp: t("counters.needsFollowUp"),
    openReviewItems: t("counters.openReviewItems"),
    instructionsSent: t("counters.instructionsSent"),
    actionsTitle: t("actionsTitle"),
    assignAction: t("actions.assign"),
    instructionsAction: t("actions.instructions"),
    csvAction: t("actions.csv"),
    printAction: t("actions.print"),
    workersTitle: t("workersTitle"),
    noWorkers: t("noWorkers"),
    readyChip: t("worker.readyChip"),
    notReadyChip: t("worker.notReadyChip"),
    declaredSkills: t("worker.declaredSkills"),
    confirmedSkills: t("worker.confirmedSkills"),
    evidence: t("worker.evidence"),
    reviewItems: t("worker.reviewItems"),
    lastActivity: t("worker.lastActivity"),
    noActivity: t("worker.noActivity"),
    assignedAt: t("worker.assignedAt"),
    missingTitle: t("worker.missingTitle"),
    missingName: t("worker.missingName"),
    missingDeclaredSkills: t("worker.missingDeclaredSkills"),
    missingEvidence: t("worker.missingEvidence"),
    followUpChip: t("worker.followUpChip"),
    playerCardLink: t("worker.playerCardLink"),
    instructionLink: t("worker.instructionLink"),
    skillClarifyLink: t("worker.skillClarifyLink"),
    notesTitle: t("notesTitle"),
    documentsNote: t("notes.documents"),
    candidateSkillNote: t("notes.candidateSkill"),
    readinessHonestyNote: t("notes.readiness"),
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <ProjectOperationsBoard
        ops={ops}
        labels={labels}
        locale={locale}
        csvHref={`/${locale}/dashboard/projects/${id}/operations/report`}
      />
    </div>
  );
}
