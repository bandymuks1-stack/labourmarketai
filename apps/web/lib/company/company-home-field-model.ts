/**
 * The organisation's home — projects in time × who is free (frozen design
 * contract §2.6 "Company C1", §5 P5; design system section I).
 *
 * PURE derivations only. No IO, no server-only: importable from the section,
 * the server composer and the tests alike. Every input is a row some
 * EXISTING canonical read already returned (project stages, the chat's
 * project-risk rows, the chat's who-is-free rows, the owner's own needs,
 * the employer opening brief) — nothing here reads, ranks or invents.
 *
 * TIME IS MATERIAL (doctrine A.6): a stage in progress is a FACT (it carries
 * a real status); the "next" stage is DERIVED — it is the first planned stage
 * after the current one in the stage order — and the row says so ("derived
 * from the stage order"), never presenting the derivation as a fact.
 */

import type { ProjectStage } from "@/lib/projects/stages-model";
import type { ProjectRiskRow } from "@/lib/conversation/project-risk-contract";
import type { CustomerRequestRow } from "@/lib/buyer/customer-requests";

/** Projects the field shows before deferring to the projects page. */
export const COMPANY_HOME_PROJECT_LIMIT = 6;
/** Rows per object block (needs, people, partners) — never a full list. */
export const COMPANY_HOME_BLOCK_LIMIT = 20;
/** People chips shown on one project row. */
export const COMPANY_HOME_PEOPLE_CHIP_LIMIT = 6;

/** What is happening on a project right now — a FACT from stage status. */
export type StageNow =
  | { readonly kind: "in_progress"; readonly name: string; readonly stageId: string }
  | { readonly kind: "blocked"; readonly name: string; readonly stageId: string; readonly reason: string | null }
  | { readonly kind: "none" }
  /** The stages model is not readable here — a different truth from "none". */
  | { readonly kind: "unavailable" };

/** The next stage — DERIVED from the stage order, marked as such. */
export type StageNext =
  | {
      readonly kind: "derived";
      readonly name: string;
      readonly stageId: string;
      readonly plannedStart: string | null;
      /** Always true — kept explicit so a renderer cannot forget the texture. */
      readonly derived: true;
    }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" };

export interface StageTimeline {
  readonly now: StageNow;
  readonly next: StageNext;
  readonly done: number;
  readonly total: number;
}

/**
 * Now = the first stage in progress (stage order); a blocked stage with no
 * stage in progress is "now" too, because that is what the project is
 * standing on. Next = the first PLANNED stage after the "now" stage in the
 * order — or, with nothing in progress, the first planned stage at all.
 * `null` stages = the stages read was unavailable (unapplied migration or
 * unreadable), which is reported as such, never as "no stages".
 */
export function deriveStageTimeline(
  stages: readonly ProjectStage[] | null,
): StageTimeline {
  if (stages === null) {
    return { now: { kind: "unavailable" }, next: { kind: "unavailable" }, done: 0, total: 0 };
  }
  const ordered = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);
  const live = ordered.filter((s) => s.status !== "cancelled");
  const done = live.filter((s) => s.status === "done").length;

  const inProgress = live.find((s) => s.status === "in_progress");
  const blocked = live.find((s) => s.status === "blocked");
  const nowStage = inProgress ?? blocked ?? null;

  const now: StageNow = inProgress
    ? { kind: "in_progress", name: inProgress.name, stageId: inProgress.id }
    : blocked
      ? { kind: "blocked", name: blocked.name, stageId: blocked.id, reason: blocked.blockedReason }
      : { kind: "none" };

  const startIndex = nowStage ? live.indexOf(nowStage) + 1 : 0;
  const nextStage = live.slice(startIndex).find((s) => s.status === "planned") ?? null;
  const next: StageNext = nextStage
    ? {
        kind: "derived",
        name: nextStage.name,
        stageId: nextStage.id,
        plannedStart: nextStage.plannedStart,
        derived: true,
      }
    : { kind: "none" };

  return { now, next, done, total: live.length };
}

/** One risk fact, as an opaque code + count; the surface localizes it. */
export type RiskSignal =
  | { readonly code: "overdue_tasks"; readonly count: number }
  | { readonly code: "blocked_stages"; readonly count: number }
  | { readonly code: "missing_documents"; readonly count: number }
  | { readonly code: "nobody_on_live_project"; readonly count: 1 };

/**
 * The chat's project-risk row, unpacked into the facts it counted — the
 * SAME numbers, so the home and the chat can never disagree about a project.
 * `pulseKnown=false` with no other signal returns `unknown` (never a calm
 * zero pretending to be a fact).
 */
export function unpackRiskSignals(
  row: Pick<
    ProjectRiskRow,
    "pulseKnown" | "tasksOverdue" | "stagesBlocked" | "workersWithMissingDocs" | "nobodyOnLiveProject"
  >,
): { readonly known: boolean; readonly signals: readonly RiskSignal[] } {
  const signals: RiskSignal[] = [];
  if (row.tasksOverdue > 0) signals.push({ code: "overdue_tasks", count: row.tasksOverdue });
  if ((row.stagesBlocked ?? 0) > 0) {
    signals.push({ code: "blocked_stages", count: row.stagesBlocked ?? 0 });
  }
  if (row.workersWithMissingDocs > 0) {
    signals.push({ code: "missing_documents", count: row.workersWithMissingDocs });
  }
  if (row.nobodyOnLiveProject) signals.push({ code: "nobody_on_live_project", count: 1 });
  const known = row.pulseKnown || row.stagesBlocked !== null || signals.length > 0;
  return { known, signals };
}

/** Needs still open — everything the owner has not closed, drafts first
 *  (a draft is the one thing only the owner can move). Bounded. */
export function selectOpenNeeds(
  rows: readonly CustomerRequestRow[],
  limit: number = COMPANY_HOME_BLOCK_LIMIT,
): readonly CustomerRequestRow[] {
  const open = rows.filter((r) => r.status !== "closed");
  const rank = (s: CustomerRequestRow["status"]): number =>
    s === "draft" ? 0 : s === "needs_followup" ? 1 : s === "submitted" ? 2 : s === "in_review" ? 3 : 4;
  return [...open]
    .sort((a, b) => rank(a.status) - rank(b.status) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/**
 * Where an attention chip leads WITHOUT the chat. The brief's chips are
 * either `link:<path>` (a page) or the id of a chat answer; the latter are
 * mapped to the page that already renders the same canonical rows. An id
 * with no page equivalent yields `null` and the chip is not shown — the
 * line stays, because the fact is real; only the shortcut is missing.
 */
export function attentionChipHref(chipId: string): string | null {
  if (chipId.startsWith("link:")) {
    const path = chipId.slice("link:".length);
    return path.startsWith("/") ? path : null;
  }
  switch (chipId) {
    case "candidates":
      return "/dashboard/company/scouting";
    case "agency-offers":
      return "/dashboard/company/scouting";
    case "agency:progress":
    case "agency:demand":
      return "/dashboard/company#company-agency";
    default:
      return null;
  }
}
