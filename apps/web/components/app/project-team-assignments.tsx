"use client";

import { Explain } from "@/components/app/premium/grammar";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { TeamMemberKeepDecision } from "@/components/app/team-member-keep-decision";
import { assignTeamToWorkAction, endTeamAssignmentAction } from "@/lib/projects/team-assignment-actions";
import type { AssignableTask, AssignableTeam, TeamAssignResult } from "@/lib/projects/team-assignment";
import {
  membersNeedingNotice,
  scopeOf,
  type TeamAssignmentRow,
} from "@/lib/projects/team-assignment-model";

/**
 * WRK-6 — TEAMS ON A PROJECT, on the project's own block of the manager page.
 *
 * Each team assignment is ONE row: the team, what it works on (whole project,
 * one task, or a work site) and the members the database resolves for it NOW.
 * It can be ended or replaced as one edit. Nothing here creates per-person
 * assignment rows; a person's hours and journal stay their own.
 *
 * The control sits beside the person assign link in the same block, so a
 * manager chooses a person OR a team for the same project.
 */

// The controls are the shared primitives (components/ui). The assign and
// replace actions stay SECONDARY on purpose: this form repeats once per project
// card, so a filled button here made a dozen "main" buttons on the Work page
// (owner design pass 2026-10-26: one primary per screen).
const picker = "min-w-0 sm:w-auto";

export function ProjectTeamAssignments({
  projectId,
  assignments,
  teams,
  tasks,
  showIntro = true,
}: {
  projectId: string;
  /** The explanation is said ONCE per list (first project), not under
   *  every project (owner 2026-10-10). */
  showIntro?: boolean;
  assignments: readonly TeamAssignmentRow[];
  teams: readonly AssignableTeam[];
  tasks: readonly AssignableTask[];
}) {
  const t = useTranslations("teamAssignment");
  const tDisclosure = useTranslations("common.disclosure");
  const tRes = useTranslations("projects.assign.reservation");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [teamId, setTeamId] = useState("");
  const [scope, setScope] = useState<"project" | "task">("project");
  const [taskId, setTaskId] = useState("");
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  const [replaceTeam, setReplaceTeam] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [notice, setNotice] = useState<Extract<TeamAssignResult, { status: "ok" }> | null>(null);


  const taskTitle = new Map(tasks.map((x) => [x.id, x.title]));
  const myTasks = tasks.filter((x) => x.projectId === projectId);

  function report(result: TeamAssignResult) {
    if (result.status === "ok") {
      setMessage({ tone: "ok", text: t(`outcome.${result.outcome}`) });
      setNotice(result);
      router.refresh();
    } else {
      setNotice(null);
      setMessage({ tone: "error", text: t(`refusal.${result.status}`) });
    }
  }

  function assign() {
    if (!teamId || (scope === "task" && !taskId)) return;
    setMessage(null);
    setNotice(null);
    startTransition(async () => {
      report(
        await assignTeamToWorkAction({
          teamId,
          projectId,
          taskId: scope === "task" ? taskId : null,
        }),
      );
    });
  }

  function replace(row: TeamAssignmentRow) {
    if (!replaceTeam) return;
    setMessage(null);
    setNotice(null);
    startTransition(async () => {
      const result = await assignTeamToWorkAction({
        teamId: replaceTeam,
        projectId,
        workObjectId: row.workObjectId,
        taskId: row.taskId,
        replaceAssignmentId: row.id,
      });
      if (result.status === "ok") {
        setReplaceFor(null);
        setReplaceTeam("");
      }
      report(result);
    });
  }

  function end(row: TeamAssignmentRow) {
    setMessage(null);
    setNotice(null);
    startTransition(async () => {
      const result = await endTeamAssignmentAction({ assignmentId: row.id });
      if (result.status === "ok") {
        setMessage({ tone: "ok", text: t(`outcome.${result.outcome}`) });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: t(`refusal.${result.status}`) });
      }
    });
  }

  const attention = notice ? membersNeedingNotice(notice.memberCalendar) : null;

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-ink-600 pt-3" data-testid="project-teams">
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</p>
      {/* Same explanation under every project → one tap away (owner 2026-10-10). */}
      {showIntro ? (
        <Explain summary={tDisclosure("details")}>
          <p>{t("intro")}</p>
        </Explain>
      ) : null}

      {assignments.length === 0 ? (
        <p className="text-xs text-text-muted" data-testid="project-teams-none">
          {t("none")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => {
            const kind = scopeOf(a);
            return (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
                data-testid="project-team-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {a.teamName ?? t("unnamedTeam")}
                    </p>
                    <p className="text-xs text-text-secondary" data-testid="project-team-scope">
                      {kind === "task"
                        ? t("scope.task", { title: taskTitle.get(a.taskId ?? "") ?? "…" })
                        : kind === "work_object"
                          ? t("scope.object")
                          : t("scope.project")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      disabled={pending || teams.length === 0}
                      aria-expanded={replaceFor === a.id}
                      onClick={() => setReplaceFor(replaceFor === a.id ? null : a.id)}
                      data-testid="project-team-replace-toggle"
                    >
                      {t("replaceLabel")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      disabled={pending}
                      onClick={() => end(a)}
                      data-testid="project-team-end"
                    >
                      {pending ? t("ending") : t("end")}
                    </Button>
                  </div>
                </div>

                <div data-testid="project-team-members">
                  <p className="text-xs text-text-muted">{t("membersNow", { count: a.members.length })}</p>
                  {a.members.length === 0 ? (
                    <p className="text-xs text-text-muted">{t("noMembers")}</p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {a.members.map((m) => (
                        <li key={m.profileId} className="min-w-0">
                          <Badge tone="neutral" className="max-w-full break-words normal-case">
                            {m.name ?? t("unnamedMember")}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {replaceFor === a.id ? (
                  <div className="flex flex-wrap items-center gap-2" data-testid="project-team-replace">
                    <label className="sr-only" htmlFor={`${uid}-replace-${a.id}`}>
                      {t("replaceLabel")}
                    </label>
                    <Select
                      id={`${uid}-replace-${a.id}`}
                      className={picker}
                      value={replaceTeam}
                      onChange={(e) => setReplaceTeam(e.target.value)}
                    >
                      <option value="">{t("replacePlaceholder")}</option>
                      {teams
                        .filter((x) => x.id !== a.teamOrgId)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name ?? t("unnamedTeam")}
                          </option>
                        ))}
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      disabled={pending || !replaceTeam}
                      onClick={() => replace(a)}
                    >
                      {t("replaceSubmit")}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {teams.length === 0 ? (
        <p className="text-xs text-text-muted" data-testid="project-teams-no-teams">
          {t("noTeams")}
        </p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="project-team-assign">
          <p className="text-xs font-semibold text-text-primary">{t("assignTitle")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-col gap-1 max-sm:w-full">
              <Label htmlFor={`${uid}-team`}>{t("teamLabel")}</Label>
              <Select
                id={`${uid}-team`}
                className={picker}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                data-testid="project-team-select"
              >
                <option value="">{t("teamPlaceholder")}</option>
                {teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name ?? t("unnamedTeam")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1 max-sm:w-full">
              <Label htmlFor={`${uid}-scope`}>{t("scopeLabel")}</Label>
              <Select
                id={`${uid}-scope`}
                className={picker}
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value === "task" ? "task" : "project");
                  setTaskId("");
                }}
                data-testid="project-team-scope-select"
              >
                <option value="project">{t("scopeProjectOption")}</option>
                <option value="task" disabled={myTasks.length === 0}>
                  {t("scopeTaskOption")}
                </option>
              </Select>
            </div>
            {scope === "task" ? (
              <div className="flex min-w-0 flex-col gap-1 max-sm:w-full">
                <Label htmlFor={`${uid}-task`}>{t("taskLabel")}</Label>
                <Select
                  id={`${uid}-task`}
                  className={picker}
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  data-testid="project-team-task-select"
                >
                  <option value="">{t("taskPlaceholder")}</option>
                  {myTasks.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={pending || !teamId || (scope === "task" && !taskId)}
              onClick={assign}
              data-testid="project-team-submit"
            >
              {pending ? t("assigning") : t("submit")}
            </Button>
          </div>
          {myTasks.length === 0 ? <p className="text-xs text-text-muted">{t("noTasks")}</p> : null}
        </div>
      )}

      {message ? (
        <p
          className={`text-xs ${message.tone === "ok" ? "text-state-success" : "text-state-danger"}`}
          role="status"
          data-testid="project-team-message"
        >
          {message.text}
        </p>
      ) : null}

      {attention && (attention.conflicts.length > 0 || attention.unknown.length > 0) ? (
        <div className="flex flex-col gap-2" role="status" data-testid="project-team-calendar">
          {attention.conflicts.map((m) => (
            <div key={m.profileId} className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-text-primary">{m.name ?? t("unnamedMember")}</p>
              <TeamMemberKeepDecision projectId={projectId} memberProfileId={m.profileId} verdict={m.verdict} />
            </div>
          ))}
          {attention.unknown.length > 0 ? (
            <p className="text-xs text-text-muted" data-testid="project-team-calendar-unknown">
              {t("calendar.unknownTitle")}{" "}
              {attention.unknown.map((m) => m.name ?? t("unnamedMember")).join(", ")}. {tRes("unknown")}
            </p>
          ) : null}
          <p className="text-xs text-text-muted">{t("calendar.advisory")}</p>
        </div>
      ) : null}
    </div>
  );
}
