"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { assignTeamToWorkAction } from "@/lib/projects/team-assignment-actions";
import type { TeamAssignResult } from "@/lib/projects/team-assignment";

/**
 * WRK-6 — "It assigns a whole team or brigade." Pick one of the projects the
 * caller manages; the team is assigned as ONE relationship (one stored row),
 * not as N separate person assignments. Its members are resolved from the
 * team's own membership, so each person's hours and journal stay their own.
 *
 * The project page carries the full control (task scope, the member list,
 * end and replace); this is the same write from the team's own panel.
 */
export function TeamAssignForm({
  teamId,
  memberCount,
  projects,
}: {
  teamId: string;
  memberCount: number;
  projects: readonly { id: string; title: string | null }[];
}) {
  const t = useTranslations("teamAssignment");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState("");
  const [result, setResult] = useState<TeamAssignResult | null>(null);

  function submit() {
    if (!projectId) return;
    setResult(null);
    startTransition(async () => {
      const r = await assignTeamToWorkAction({ teamId, projectId });
      setResult(r);
      if (r.status === "ok") router.refresh();
    });
  }

  if (projects.length === 0) {
    return (
      <p className="text-xs text-text-muted" data-testid="team-assign-no-projects">
        {t("form.noProjects")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="team-assign">
      <p className="text-xs text-text-secondary">{t("form.intro", { count: memberCount })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`${uid}-project`}>
          {t("form.projectLabel")}
        </label>
        <select
          id={`${uid}-project`}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="min-h-11 sm:min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
          data-testid="team-assign-project"
        >
          <option value="">{t("form.projectPlaceholder")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title ?? p.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={pending || !projectId || memberCount === 0}
          onClick={submit}
          data-testid="team-assign-submit"
        >
          {pending ? t("assigning") : t("submit")}
        </Button>
      </div>

      {result ? (
        <p
          className={`text-xs ${result.status === "ok" ? "text-state-success" : "text-state-danger"}`}
          role="status"
          data-testid={`team-assign-${result.status}`}
        >
          {result.status === "ok" ? t(`outcome.${result.outcome}`) : t(`refusal.${result.status}`)}
        </p>
      ) : null}
    </div>
  );
}
