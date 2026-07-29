import "server-only";

import { getTranslations } from "next-intl/server";

import { getPlanning } from "@/lib/planning/planning";
import { visibleRange } from "@/lib/planning/planning-model";
import {
  buildWorkContext,
  deriveNextBestActions,
} from "@/lib/conversation/context-intelligence";
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
 */

export interface WorkContextView {
  /** One honest headline about the current window. */
  readonly headline: string;
  /** Only facts that are REAL. A quiet window yields an empty list. */
  readonly facts: readonly ContextFact[];
  /** At most two, from the deterministic engine. */
  readonly recommendations: readonly ContextRecommendation[];
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
  const planning = await getPlanning({ rangeStart: range.start, rangeEnd: range.end });
  if (planning.status !== "ok") {
    return { kind: "unavailable", reason: tPanel("unavailableWorkContext") };
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
    },
  };
}
