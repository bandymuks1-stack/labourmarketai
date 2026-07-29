"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  addStageAction,
  updateStageStatusAction,
  deleteStageAction,
} from "@/lib/projects/stages-actions";
import {
  STAGE_STATUSES,
  type ProjectStage,
  type ProjectStagesData,
  type StageStatus,
} from "@/lib/projects/stages-model";

/**
 * Project stages panel (Wagon 6 — Project Operations Core, slice 1) on the
 * EXISTING manager-only project operations surface.
 *
 * Ordered sub-phases of the project. Managers add a stage, set its real status
 * (planned / in progress / blocked / done / cancelled) and record real planned
 * dates. NO fabricated progress percentage — the panel shows only real facts.
 * Pre-apply (owner-gated migration unapplied) it degrades to an honest "not
 * yet available" state; no stage is faked.
 */

const STATUS_TONE: Record<StageStatus, string> = {
  planned: "border-ink-500 text-text-secondary",
  in_progress: "border-brand-blue/40 text-brand-blue",
  blocked: "border-state-warning/40 text-state-warning",
  done: "border-state-success/40 text-state-success",
  cancelled: "border-ink-500 text-text-muted",
};

function StageRow({
  stage,
  onDone,
}: {
  stage: ProjectStage;
  onDone: (msg: string) => void;
}) {
  const t = useTranslations("projectStages");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<StageStatus>(stage.status);
  const [blockedReason, setBlockedReason] = useState(stage.blockedReason ?? "");

  function applyStatus(next: StageStatus) {
    setStatus(next);
    if (next === "blocked" && !blockedReason.trim()) return; // wait for a reason
    startTransition(async () => {
      const res = await updateStageStatusAction({
        stageId: stage.id,
        status: next,
        blockedReason: next === "blocked" ? blockedReason.trim() : undefined,
      });
      if (!res.ok) setStatus(stage.status); // no fake success — revert the badge
      onDone(res.ok ? t("outcome.updated") : t(`outcome.${res.code}`));
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteStageAction({ stageId: stage.id });
      onDone(res.ok ? t("outcome.deleted") : t(`outcome.${res.code}`));
    });
  }

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid="project-stage-row"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-meta text-text-muted">
          #{stage.stageOrder}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {stage.name}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[status]}`}
          data-testid="project-stage-status-badge"
        >
          {t(`statuses.${status}`)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-meta text-text-secondary" htmlFor={`stage-status-${stage.id}`}>
          {t("statusLabel")}
        </label>
        <select
          id={`stage-status-${stage.id}`}
          className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
          value={status}
          disabled={pending}
          onChange={(e) => applyStatus(e.target.value as StageStatus)}
          data-testid="project-stage-status-select"
        >
          {STAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        {(stage.plannedStart || stage.plannedEnd) && (
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("plannedLabel")}: {stage.plannedStart ?? "—"} → {stage.plannedEnd ?? "—"}
          </span>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="ml-auto rounded-md border border-ink-500 px-2 py-1 text-meta text-text-muted transition-colors hover:border-state-danger hover:text-state-danger"
          data-testid="project-stage-delete"
        >
          {t("delete")}
        </button>
      </div>

      {status === "blocked" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={t("blockedReasonLabel")}
            value={blockedReason}
            maxLength={500}
            onChange={(e) => setBlockedReason(e.target.value)}
            placeholder={t("blockedReasonPlaceholder")}
            className="flex-1 rounded-md border border-state-warning/40 bg-ink-800 px-2 py-1 text-xs text-text-primary"
            data-testid="project-stage-blocked-reason"
          />
          <Button
            type="button"
            size="sm"
            disabled={pending || !blockedReason.trim()}
            onClick={() => applyStatus("blocked")}
          >
            {t("saveBlocked")}
          </Button>
        </div>
      )}
    </li>
  );
}

export function ProjectStagesPanel({
  projectId,
  data,
}: {
  projectId: string;
  data: ProjectStagesData;
}) {
  const router = useRouter();
  const t = useTranslations("projectStages");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function report(m: string) {
    setMsg(m);
    router.refresh();
  }

  function add() {
    setMsg(null);
    startTransition(async () => {
      const res = await addStageAction({
        projectId,
        name: name.trim(),
        plannedStart: plannedStart || undefined,
        plannedEnd: plannedEnd || undefined,
      });
      if (res.ok) {
        setName("");
        setPlannedStart("");
        setPlannedEnd("");
        report(t("outcome.added"));
      } else {
        report(t(`outcome.${res.code}`));
      }
    });
  }

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="project-stages-panel"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
        <p className="text-meta leading-relaxed text-text-muted">{t("honestNote")}</p>
      </header>

      {!data.applied ? (
        <p className="text-sm text-text-muted" data-testid="project-stages-preapply">
          {t("preApply")}
        </p>
      ) : (
        <>
          {data.stages.length === 0 ? (
            <p className="text-sm text-text-secondary" data-testid="project-stages-empty">
              {t("empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="project-stages-list">
              {data.stages.map((s) => (
                <StageRow key={s.id} stage={s} onDone={report} />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("addHeading")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={t("nameLabel")}
                value={name}
                maxLength={160}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="min-w-40 flex-1 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary"
                data-testid="project-stage-name"
              />
              <input
                type="date"
                aria-label={t("plannedStartLabel")}
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                data-testid="project-stage-planned-start"
              />
              <input
                type="date"
                aria-label={t("plannedEndLabel")}
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                data-testid="project-stage-planned-end"
              />
              <Button
                type="button"
                size="sm"
                disabled={pending || name.trim().length === 0}
                onClick={add}
                data-testid="project-stage-add"
              >
                {pending ? t("saving") : t("add")}
              </Button>
            </div>
          </div>
        </>
      )}

      {msg && (
        <p className="text-xs text-text-secondary" data-testid="project-stages-msg">
          {msg}
        </p>
      )}
    </section>
  );
}
