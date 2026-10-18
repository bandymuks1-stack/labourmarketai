import {
  traceJournalEntry,
  type ConsequenceTraceInput,
  type TraceEntryInput,
  type TraceItem,
} from "@/lib/home/consequence-trace";
import { deriveIndependentReviewResult, deriveReviewResult } from "@/lib/journal/review-status";
import type { ProjectStagesData } from "@/lib/projects/stages-model";
import type { WorkTask } from "@/lib/tasks/task-model";

/**
 * THE PROJECT'S CONSEQUENCE TRACE — "Kas pasikeitė projekte" (Future
 * Experience C on top of F0, owner 2026-10-15). It reads the SAME chain model
 * as the home and the Living CV (`traceJournalEntry`), narrowed to one
 * project, plus the project's own facts (stages finished, tasks closed).
 *
 * PRIVACY — who sees what (each rule pinned by `project-trace.test.ts`):
 *   member   their OWN chains on this project only. The rows are filtered to
 *            the viewer's own worker id here as well as by RLS, so a
 *            co-worker's entry can never reach another participant.
 *   manager  the TEAM's chain as COUNTS only — recorded → waiting → confirmed
 *            → counted on the Living CV. No names, no entry text, no
 *            per-person figure; the review queue is where a manager opens a
 *            single entry (their existing, RLS-gated route).
 *   both     the project's own facts: stages finished and tasks closed in the
 *            window (their status is the project's bookkeeping, not a person's).
 *
 * HONESTY: a step is counted only when its fact exists; "waiting" is pending,
 * never confirmation; an approval written by the worker themselves is never
 * "confirmed" (`deriveIndependentReviewResult`); when the worker's profile
 * cannot be resolved the confirmed count is UNKNOWN, never guessed. A reader
 * that failed is named, never shown as zero. Pure: no IO, no Date.
 */

export type ProjectTraceEntry = TraceEntryInput & {
  readonly workerId: string;
};

export type ProjectTeamChain = {
  readonly recorded: number;
  readonly awaiting: number;
  /** Changes requested or rejected by a reviewer. */
  readonly returned: number;
  /** Independently approved; `null` = the subjects could not be resolved. */
  readonly confirmed: number | null;
};

export type ProjectTrace =
  | {
      readonly kind: "known";
      readonly audience: "manager" | "member";
      /** Manager only — counts, never rows. */
      readonly team: ProjectTeamChain | null;
      /** Member only — the viewer's own chains on this project. */
      readonly mine: readonly TraceItem[];
      readonly stagesDone: readonly { readonly id: string; readonly name: string; readonly day: string }[];
      readonly tasksDone: number;
      readonly journalUnknown: boolean;
      readonly stagesUnknown: boolean;
      readonly tasksUnknown: boolean;
      readonly truncated: boolean;
      /** Nothing happened in the window (every reader answered). */
      readonly quiet: boolean;
    }
  | { readonly kind: "unknown" };

export type ProjectTraceInput = {
  readonly audience: "manager" | "member";
  /** The project's entries the session read; `null` = the read failed. */
  readonly entries: readonly ProjectTraceEntry[] | null;
  readonly entriesTruncated: boolean;
  /** Member: the viewer's own worker id (rows of anyone else are dropped). */
  readonly viewerWorkerId: string | null;
  /** Member: the viewer's profile id (self-approval is not confirmation). */
  readonly viewerProfileId: string | null;
  /** Manager: worker id → profile id; `null` = could not be resolved. */
  readonly workerProfiles: ReadonlyMap<string, string> | null;
  readonly skillLinks: ConsequenceTraceInput["skillLinks"];
  readonly confirmedWork: ConsequenceTraceInput["confirmedWork"];
  readonly stages: ProjectStagesData | null;
  /** `null` = the tasks read failed. */
  readonly tasks: readonly WorkTask[] | null;
  /** ISO instant; older chains / facts are left out. */
  readonly sinceIso: string;
  readonly limit?: number;
};

export const PROJECT_TRACE_LIMIT = 4;

export function deriveProjectTrace(input: ProjectTraceInput): ProjectTrace {
  const stagesUnknown = input.stages === null || (input.stages.applied && input.stages.error !== null);
  const tasksUnknown = input.tasks === null;
  const journalUnknown = input.entries === null;
  if (journalUnknown && stagesUnknown && tasksUnknown) return { kind: "unknown" };

  const sinceDay = input.sinceIso.slice(0, 10);
  const inWindow = (input.entries ?? []).filter((e) => e.createdAt >= input.sinceIso);

  let team: ProjectTeamChain | null = null;
  let mine: TraceItem[] = [];

  if (input.audience === "manager") {
    let awaiting = 0;
    let returned = 0;
    let confirmed: number | null = 0;
    for (const e of inWindow) {
      const any = deriveReviewResult(e.confirmations);
      if (any === "submitted") {
        awaiting += 1;
        continue;
      }
      if (any === "changes_requested" || any === "rejected") returned += 1;
      if (confirmed !== null) {
        const subject = input.workerProfiles?.get(e.workerId) ?? null;
        if (input.workerProfiles === null || subject === null) confirmed = null;
        else if (deriveIndependentReviewResult(e.confirmations, subject) === "approved") confirmed += 1;
      }
    }
    team = { recorded: inWindow.length, awaiting, returned, confirmed };
  } else {
    mine = inWindow
      .filter((e) => input.viewerWorkerId !== null && e.workerId === input.viewerWorkerId)
      .map((e) =>
        traceJournalEntry(e, {
          subjectProfileId: input.viewerProfileId,
          skillLinks: input.skillLinks,
          confirmedWork: input.confirmedWork,
        }),
      )
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)))
      .slice(0, input.limit ?? PROJECT_TRACE_LIMIT);
  }

  const stagesDone =
    !stagesUnknown && input.stages && input.stages.applied
      ? input.stages.stages
          .filter((s) => s.status === "done" && s.actualEnd !== null && s.actualEnd >= sinceDay)
          .sort((a, b) => ((a.actualEnd ?? "") < (b.actualEnd ?? "") ? 1 : -1))
          .map((s) => ({ id: s.id, name: s.name, day: s.actualEnd as string }))
      : [];
  const tasksDone = (input.tasks ?? []).filter(
    (t) => t.status === "done" && t.resolvedAt !== null && t.resolvedAt >= input.sinceIso,
  ).length;

  const teamQuiet = team === null || team.recorded === 0;
  const quiet =
    !journalUnknown &&
    !stagesUnknown &&
    !tasksUnknown &&
    teamQuiet &&
    mine.length === 0 &&
    stagesDone.length === 0 &&
    tasksDone === 0;

  return {
    kind: "known",
    audience: input.audience,
    team,
    mine,
    stagesDone,
    tasksDone,
    journalUnknown,
    stagesUnknown,
    tasksUnknown,
    truncated: input.entriesTruncated,
    quiet,
  };
}
