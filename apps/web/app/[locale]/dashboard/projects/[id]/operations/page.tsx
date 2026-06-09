import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getProjectOperations } from "@/lib/projects/operations";
import {
  OPERATIONAL_STATUSES,
  READINESS_STATUSES,
  type OperationalStatus,
  type ReadinessStatus,
} from "@/lib/projects/operations-derive";
import { DEFAULT_READINESS_ITEM_KEYS } from "@/lib/projects/readiness-items";
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
    candidatesAction: t("actions.candidates"),
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
    // v2 — operational status
    statusTitle: t("statusTitle"),
    statusEmpty: t("statusEmpty"),
    statusHelper: t("statusHelper"),
    save: t("save"),
    saving: t("saving"),
    saved: t("saved"),
    saveError: t("saveError"),
    needsMigration: t("needsMigration"),
    statusLabels: Object.fromEntries(
      OPERATIONAL_STATUSES.map((s) => [s, t(`statuses.${s}`)]),
    ) as Record<OperationalStatus, string>,
    // v2 — checklist
    checklist: {
      title: t("checklist.title"),
      empty: t("checklist.empty"),
      seed: t("checklist.seed"),
      addItem: t("checklist.addItem"),
      addPlaceholder: t("checklist.addPlaceholder"),
      missing: t("checklist.missing"),
      received: t("checklist.received"),
      checked: t("checklist.checked"),
      blocked: t("checklist.blocked"),
      helper: t("checklist.helper"),
    },
    readinessStatusLabels: Object.fromEntries(
      READINESS_STATUSES.map((s) => [s, t(`readinessStatuses.${s}`)]),
    ) as Record<ReadinessStatus, string>,
    defaultItemLabels: Object.fromEntries(
      DEFAULT_READINESS_ITEM_KEYS.map((k) => [k, t(`defaults.${k}`)]),
    ) as Record<string, string>,
    // v2 — filters
    filters: {
      title: t("filters.title"),
      all: t("filters.all"),
      byStatus: t("filters.byStatus"),
      anyStatus: t("filters.anyStatus"),
      missingDocs: t("filters.missingDocs"),
      ready: t("filters.ready"),
      needsSkillInfo: t("filters.needsSkillInfo"),
      followUp: t("filters.followUp"),
      none: t("filters.none"),
    },
    counters2: {
      withMissingDocs: t("counters2.withMissingDocs"),
      docsReceived: t("counters2.docsReceived"),
      docsChecked: t("counters2.docsChecked"),
      docsBlocked: t("counters2.docsBlocked"),
    },
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <ProjectOperationsBoard
        ops={ops}
        labels={labels}
        locale={locale}
        projectId={id}
        csvHref={`/${locale}/dashboard/projects/${id}/operations/report`}
      />
    </div>
  );
}
