"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { assignTeamToProjectAction } from "@/lib/projects/team-assignment-actions";
import type { TeamAssignmentResult } from "@/lib/projects/team-assignment";

/**
 * WRK-6 — "It assigns a whole team or brigade." The form: pick one of the
 * projects the caller manages, assign every member through the existing
 * per-person write, and show each member's OWN outcome and calendar truth.
 *
 * Nothing here is a gate. A member the database refuses is shown as refused;
 * a member whose dates collide is shown as colliding and stays assigned —
 * the warning is the manager's to weigh (SEP-2). `unknown` means the
 * calendar could not be confirmed free, which is not the same as free.
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
  const t = useTranslations("teamBrigades.assign");
  const [pending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState("");
  const [result, setResult] = useState<TeamAssignmentResult | null>(null);

  function submit() {
    if (!projectId) return;
    setResult(null);
    startTransition(async () => {
      setResult(await assignTeamToProjectAction({ teamId, projectId }));
    });
  }

  if (projects.length === 0) {
    return (
      <p className="text-xs text-text-muted" data-testid="team-assign-no-projects">
        {t("noProjects")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="team-assign">
      <p className="text-xs text-text-secondary">{t("intro", { count: memberCount })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("projectLabel")}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
          data-testid="team-assign-project"
        >
          <option value="">{t("projectPlaceholder")}</option>
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

      {result && result.status !== "ok" ? (
        <p className="text-xs text-text-muted" role="status" data-testid={`team-assign-${result.status}`}>
          {t(`outcome.${result.status}`)}
        </p>
      ) : null}

      {result && result.status === "ok" ? (
        <ul className="flex flex-col gap-1" role="status" data-testid="team-assign-result">
          {result.members.map((m) => (
            <li key={m.profileId} className="text-xs text-text-secondary" data-testid={`team-assign-member-${m.outcome}`}>
              <span className="font-medium text-text-primary">{m.name}</span>
              {" · "}
              {t(`member.${m.outcome}`)}
              {m.reservation ? (
                <>
                  {" · "}
                  {m.reservation.state === "clear" ? (
                    <span>{t("reservation.clear")}</span>
                  ) : m.reservation.state === "unknown" ? (
                    <span className="text-text-muted">{t("reservation.unknown")}</span>
                  ) : (
                    <span className="text-state-warning">
                      {t("reservation.collides", { count: m.reservation.collisions.length })}
                      {": "}
                      {m.reservation.collisions
                        .map((c) => (c.overlapStart === c.overlapEnd ? c.overlapStart : `${c.overlapStart} – ${c.overlapEnd}`))
                        .join(", ")}
                    </span>
                  )}
                </>
              ) : null}
            </li>
          ))}
          <li className="text-xs text-text-muted">{t("notBlocking")}</li>
        </ul>
      ) : null}
    </div>
  );
}
