import { getTranslations } from "next-intl/server";

import {
  deriveStepProgress,
  type WorkflowApproverSlotRow,
  type WorkflowInstanceStepRow,
  type WorkflowTransitionRow,
} from "@/lib/approvals/approvals-model";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * WorkflowTimeline — the ONE reusable rendering of a workflow instance's
 * progress: its ordered steps, each step's approver slots and recorded
 * decisions (with reasons), and the append-only transition history under a
 * native disclosure. Pure presentation over rows the caller already read
 * through the RLS-scoped read service; no IO, no client state, no actions
 * of its own (decision controls belong to the approvals section).
 *
 * Reused by every later module that runs on the engine (requests, expenses,
 * timesheets, trips, decisions): pass the instance's rows, get the same
 * honest timeline everywhere.
 */

const STEP_TONE: Record<WorkflowInstanceStepRow["status"], string> = {
  waiting: "border-ink-500 text-text-muted",
  active: "border-brand-blue/50 text-brand-blue",
  approved: "border-state-success/50 text-state-success",
  rejected: "border-state-danger/50 text-state-danger",
  skipped: "border-ink-500 text-text-muted",
  escalated: "border-state-warning/50 text-state-warning",
};

export async function WorkflowTimeline({
  locale,
  steps,
  slots,
  transitions,
}: {
  locale: string;
  steps: readonly WorkflowInstanceStepRow[];
  slots: readonly WorkflowApproverSlotRow[];
  transitions: readonly WorkflowTransitionRow[];
}) {
  const t = await getTranslations("approvals");
  const dateFmt = createUtcFormatter(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const ordered = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

  return (
    <div className="flex flex-col gap-2" data-testid="workflow-timeline">
      <ol className="flex flex-col gap-2">
        {ordered.map((step) => {
          const stepSlots = slots.filter(
            (s) => s.instanceStepId === step.id,
          );
          const progress = deriveStepProgress(
            step.approvalMode,
            stepSlots.map((s) => s.decision),
          );
          return (
            <li
              key={step.id}
              className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/30 p-2"
              data-testid={`workflow-timeline-step-${step.stepOrder}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {step.stepOrder}.
                </span>
                <span className="text-sm font-medium text-text-primary">
                  {step.name}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STEP_TONE[step.status]}`}
                >
                  {t(`stepStatus.${step.status}`)}
                </span>
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t(`mode.${step.approvalMode}`)}
                </span>
                {progress.total > 0 ? (
                  <span className="text-meta text-text-muted">
                    {t("timeline.progress", {
                      approved: progress.approved,
                      total: progress.total,
                    })}
                  </span>
                ) : null}
                {step.deadlineAt ? (
                  <span className="text-meta text-text-muted">
                    {t("timeline.deadline")}: {dateFmt(step.deadlineAt)}
                  </span>
                ) : null}
              </div>
              {stepSlots.some((s) => s.decision !== null) ? (
                <ul className="flex flex-col gap-0.5">
                  {stepSlots
                    .filter((s) => s.decision !== null)
                    .map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"
                      >
                        <span
                          className={
                            s.decision === "approved"
                              ? "text-state-success"
                              : "text-state-danger"
                          }
                        >
                          {t(`decision.${s.decision}`)}
                        </span>
                        {s.decidedAt ? (
                          <span className="text-text-muted">
                            {dateFmt(s.decidedAt)}
                          </span>
                        ) : null}
                        {s.reason ? (
                          <span className="break-words text-text-muted">
                            „{s.reason}“
                          </span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>

      {transitions.length > 0 ? (
        <details className="rounded-md border border-ink-600 bg-ink-800/20 p-2">
          <summary className="cursor-pointer text-xs text-text-secondary">
            {t("timeline.historyTitle")} ({transitions.length})
          </summary>
          <ol className="mt-2 flex flex-col gap-1">
            {transitions.map((tr) => (
              <li
                key={tr.id}
                className="flex flex-wrap items-center gap-2 text-xs text-text-muted"
                data-testid={`workflow-transition-${tr.action}`}
              >
                <span className="font-mono text-meta uppercase tracking-label">
                  {t(`transition.${tr.action}`)}
                </span>
                {tr.stepOrder !== null ? (
                  <span>
                    {t("timeline.stepLabel")} {tr.stepOrder}
                  </span>
                ) : null}
                <span>{dateFmt(tr.createdAt)}</span>
                {tr.reason ? (
                  <span className="break-words">„{tr.reason}“</span>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
