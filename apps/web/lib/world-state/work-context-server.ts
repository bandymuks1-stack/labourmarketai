import "server-only";

import { getTranslations } from "next-intl/server";

import { getPlanning } from "@/lib/planning/planning";
import { visibleRange } from "@/lib/planning/planning-model";
import {
  buildWorkContext,
  deriveNextBestActions,
} from "@/lib/conversation/context-intelligence";
import {
  listMyPendingWorkerInvitations,
  type PendingWorkerInvitation,
} from "@/lib/worker/invitations";
import type { WorkerInvitationsLabels } from "@/components/app/worker-invitations";
import type { ContextFact, ContextRecommendation } from "./entity-context";

/**
 * The Context Panel with NOTHING selected — "what is going on with my work
 * right now" (W3).
 *
 * The panel is always available, so it must always have something true to say.
 * With no entity selected it shows the person's real work context: what covers
 * today, real conflicts, overdue tasks, the nearest deadline — and at most two
 * next steps the data actually supports.
 *
 * NO SECOND ENGINE. Every fact comes from the Context Intelligence Engine
 * (`buildWorkContext` / `deriveNextBestActions`, PR #892) over the canonical
 * Time Engine read (`getPlanning`). The conversation's agenda readback
 * (`lib/conversation/agenda-summary.ts`) is the same engine rendered as a
 * sentence; this is the same engine rendered as a persistent panel. One
 * calculation, two presentations — never a second calendar, never a second
 * conflict rule, and no read of its own.
 *
 * Empty is EMPTY. A quiet window says so; it never fills the panel with
 * placeholder cards or a fabricated "you're all caught up" claim about data
 * that was not read.
 *
 * W3 ROW 6 — PENDING INVITATIONS LIVE HERE. An invitation is an ATTENTION
 * item, not an answer somebody asked for: nobody types "show me my
 * invitations", they are told. So it is not a result kind and not a route —
 * it is part of "what needs you now", which is exactly what this context is.
 * The spine already counted it into the same context; now the person can also
 * ACT on it here, through the one existing accept path.
 */

export interface WorkContextView {
  /** One honest headline about the current window. */
  readonly headline: string;
  /** Only facts that are REAL. A quiet window yields an empty list. */
  readonly facts: readonly ContextFact[];
  /** At most two, from the deterministic engine. */
  readonly recommendations: readonly ContextRecommendation[];
  /**
   * Pending company/agency invitations, with the copy the canonical
   * `WorkerInvitations` control needs. `null` when there are none — the panel
   * then renders nothing for it rather than an empty "no invitations" card,
   * which would be a claim nobody asked to have answered.
   */
  readonly invitations: {
    readonly rows: readonly PendingWorkerInvitation[];
    readonly labels: WorkerInvitationsLabels;
  } | null;
}

export type WorkContextResult =
  | { readonly kind: "context"; readonly view: WorkContextView }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Chip id per suggestion kind.
 *
 *  Deliberately partial. A suggestion is given an action ONLY when that action
 *  can be performed without leaving the workspace: logging work and the
 *  calendar readback both happen inside the conversation. "You have N overdue
 *  tasks" has no in-workspace action yet — tasks are not a resolvable entity
 *  until their resolver is registered — so it is stated as a fact rather than
 *  wired to a link that would throw the person out of the workspace. */
const CHIP_FOR_SUGGESTION: Record<string, string | null> = {
  "overdue-tasks": null,
  "log-today": "logwork",
  "reserve-tomorrow": "agenda",
};

export async function resolveWorkContext(locale: string): Promise<WorkContextResult> {
  const tPanel = await getTranslations({ locale, namespace: "workspace.panel" });

  const todayIso = new Date().toISOString().slice(0, 10);
  const range = visibleRange("agenda", todayIso);
  // Independent reads — the Time Engine window and "who is waiting on me" have
  // nothing to say to each other, so they run together.
  const [planning, pendingInvitations] = await Promise.all([
    getPlanning({ rangeStart: range.start, rangeEnd: range.end }),
    listMyPendingWorkerInvitations(),
  ]);
  const invitations = await resolveInvitations(locale, pendingInvitations);

  if (planning.status !== "ok") {
    // The time read failed. An invitation does not depend on it, and somebody
    // real is waiting on this person — so it still shows, with the failure
    // STATED as the headline instead of hidden behind an empty panel.
    return invitations
      ? {
          kind: "context",
          view: {
            headline: tPanel("unavailableWorkContext"),
            facts: [],
            recommendations: [],
            invitations,
          },
        }
      : { kind: "unavailable", reason: tPanel("unavailableWorkContext") };
  }

  const ctx = buildWorkContext(planning.items, todayIso);
  const suggestions = deriveNextBestActions(ctx, todayIso);

  const facts: ContextFact[] = [];
  if (ctx.todayItems.length > 0) {
    facts.push({
      label: tPanel("factToday"),
      value: tPanel("factTodayValue", { count: ctx.todayItems.length }),
    });
  }
  if (ctx.activeProject?.label) {
    facts.push({ label: tPanel("factProject"), value: ctx.activeProject.label });
  }
  if (ctx.conflictCount > 0) {
    facts.push({
      label: tPanel("factConflicts"),
      value: tPanel("factConflictsValue", { count: ctx.conflictCount }),
    });
  }
  if (ctx.overdueTasks.length > 0) {
    facts.push({
      label: tPanel("factOverdue"),
      value: tPanel("factOverdueValue", { count: ctx.overdueTasks.length }),
    });
  }
  if (ctx.nextDeadline?.startDate) {
    facts.push({
      label: tPanel("factDeadline"),
      value: ctx.nextDeadline.label
        ? `${ctx.nextDeadline.label} — ${ctx.nextDeadline.startDate}`
        : ctx.nextDeadline.startDate,
    });
  }

  const recommendations: ContextRecommendation[] = suggestions.map((s) => {
    const text =
      s.kind === "overdue-tasks"
        ? tPanel("suggestOverdue", { count: s.count })
        : s.kind === "log-today"
          ? tPanel("suggestLogToday")
          : s.deadlineLabel
            ? tPanel("suggestReserveNamed", { label: s.deadlineLabel })
            : tPanel("suggestReserve");
    return {
      text,
      basis: tPanel("suggestBasis"),
      chipId: CHIP_FOR_SUGGESTION[s.kind] ?? null,
    };
  });

  return {
    kind: "context",
    view: {
      headline: facts.length > 0 ? tPanel("workHeadline") : tPanel("workHeadlineQuiet"),
      facts,
      recommendations,
      invitations,
    },
  };
}

/** The copy the canonical accept control needs, resolved ONLY when there is
 *  something to accept — an empty list costs no translation lookup and sends
 *  no labels over the wire. */
async function resolveInvitations(
  locale: string,
  rows: readonly PendingWorkerInvitation[],
): Promise<WorkContextView["invitations"]> {
  if (rows.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "workerInvitations" });
  return {
    rows,
    labels: {
      title: t("title"),
      body: t("body"),
      companyLabel: t("companyLabel"),
      agencyLabel: t("agencyLabel"),
      accept: t("accept"),
      accepting: t("accepting"),
      noteLabel: t("noteLabel"),
      outcomeLinked: t("outcomeLinked"),
      outcomeAlreadyLinked: t("outcomeAlreadyLinked"),
      outcomeNoInvitation: t("outcomeNoInvitation"),
      outcomeNoWorker: t("outcomeNoWorker"),
      outcomeError: t("outcomeError"),
      outcomeNeedsMigration: t("outcomeNeedsMigration"),
    },
  };
}
