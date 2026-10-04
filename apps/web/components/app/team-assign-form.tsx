"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { PersonIdentityCard } from "@/components/app/identity/person-identity-card";
import { ReservationNotice, type OverrideReasonLabels, type ReservationLabels } from "@/components/app/project-assignment-manager";
import { playerInitials } from "@/lib/identity/player-identity";
import {
  assignWorkerToProjectAction,
  endAssignmentAction,
  keepAssignmentAction,
  recordAssignmentDecisionAction,
} from "@/lib/projects/actions";
import type { OverrideReasonCode } from "@/lib/projects/override-receipt-model";
import { assignTeamToProjectAction } from "@/lib/projects/team-assignment-actions";
import type { TeamAssignmentResult } from "@/lib/projects/team-assignment";
import { summariseTeamAssignment, type TeamMemberResult } from "@/lib/projects/team-assignment-model";

/**
 * WRK-6 — "It assigns a whole team or brigade." Pick one of the projects the
 * caller manages; every member is assigned through the existing per-person
 * write and shown with their OWN explicit outcome: assigned, refused, calendar
 * conflict (the existing keep / undo / swap flow), or dates not confirmed.
 *
 * Nothing here is a gate and nothing is merged into one verdict: a partial
 * result is shown as a partial result.
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
  const tRes = useTranslations("projects.assign.reservation");
  const [pending, startTransition] = useTransition();
  const [deciding, startDeciding] = useTransition();
  const [projectId, setProjectId] = useState("");
  const [result, setResult] = useState<TeamAssignmentResult | null>(null);
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const [keepFailed, setKeepFailed] = useState<ReadonlySet<string>>(new Set());

  const labels: ReservationLabels = {
    reservationCollidesTitle: tRes("collidesTitle"),
    reservationNotBlocking: tRes("notBlocking"),
    reservationUnknown: tRes("unknown"),
    reservationAlternativesTitle: tRes("alternativesTitle"),
    reservationSwap: tRes("swap"),
    reservationUndo: tRes("undo"),
    reservationKeep: tRes("keep"),
    reservationSource: {
      project: tRes("source.project"),
      booking: tRes("source.booking"),
      trip: tRes("source.trip"),
      absence: tRes("source.absence"),
    },
  };

  const reasons: OverrideReasonLabels = {
    label: tRes("reasonLabel"),
    none: tRes("reasonNone"),
    failed: tRes("keepFailed"),
    options: {
      agreed_with_worker: tRes("reason.agreed_with_worker"),
      agreed_with_client: tRes("reason.agreed_with_client"),
      partial_overlap: tRes("reason.partial_overlap"),
      urgent_need: tRes("reason.urgent_need"),
      other: tRes("reason.other"),
    },
  };

  function submit() {
    if (!projectId) return;
    setResult(null);
    setDecided(new Set());
    startTransition(async () => {
      setResult(await assignTeamToProjectAction({ teamId, projectId }));
    });
  }

  const markDecided = (profileId: string) => setDecided((s) => new Set(s).add(profileId));
  const decide = (
    m: TeamMemberResult,
    what: "kept" | "undone" | "swapped",
    swapTo?: string,
    reasonCode?: OverrideReasonCode | null,
  ) =>
    startDeciding(async () => {
      if (what === "kept") {
        // FAIL-LOUD: each member's override is decided only when ITS receipt exists.
        const r = await keepAssignmentAction(projectId, m.profileId, reasonCode ?? null);
        setKeepFailed((s) => {
          const next = new Set(s);
          if (r.ok) next.delete(m.profileId);
          else next.add(m.profileId);
          return next;
        });
        if (r.ok) markDecided(m.profileId);
        return;
      }
      const ended = await endAssignmentAction(projectId, m.profileId);
      if (!ended.ok) return;
      if (what === "swapped" && swapTo) {
        const fd = new FormData();
        fd.set("project_id", projectId);
        fd.set("worker_profile_id", swapTo);
        const r = await assignWorkerToProjectAction(null, fd);
        if (!r.ok) return;
      }
      await recordAssignmentDecisionAction(projectId, m.profileId, what);
      markDecided(m.profileId);
    });

  if (projects.length === 0) {
    return (
      <p className="text-xs text-text-muted" data-testid="team-assign-no-projects">
        {t("noProjects")}
      </p>
    );
  }

  const summary = result?.status === "ok" ? summariseTeamAssignment(result.members) : null;

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

      {result && result.status === "ok" && summary ? (
        <div className="flex flex-col gap-2" role="status" data-testid="team-assign-result">
          <p className="text-xs font-medium text-text-primary" data-testid="team-assign-summary">
            {t("summary", { written: summary.written, total: result.members.length })}
          </p>
          <ul className="flex flex-col gap-2">
            {result.members.map((m) => (
              <li
                key={m.profileId}
                className="flex flex-col gap-1 text-xs text-text-secondary"
                data-testid={`team-assign-member-${m.outcome}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PersonIdentityCard
                    variant="assignment"
                    density="compact"
                    testid={`team-assign-identity-${m.profileId}`}
                    name={m.name}
                    initials={playerInitials(m.name)}
                    avatarUrl={null}
                    professions={[]}
                    meta={[]}
                  />
                  <span className={m.outcome === "refused" || m.outcome === "error" ? "text-state-danger" : "text-text-secondary"}>
                    {t(`member.${m.outcome}`)}
                  </span>
                </div>
                {m.outcome === "calendar_conflict" && m.reservation ? (
                  decided.has(m.profileId) ? (
                    <p className="text-xs text-state-success" data-testid="team-assign-decided">
                      {tRes("decided")}
                    </p>
                  ) : (
                    <ReservationNotice
                      verdict={m.reservation}
                      labels={labels}
                      alternatives={[...(m.alternatives ?? [])]}
                      busy={deciding}
                      onSwap={(to) => decide(m, "swapped", to)}
                      onUndo={() => decide(m, "undone")}
                      onKeep={(reasonCode) => decide(m, "kept", undefined, reasonCode)}
                      reasons={reasons}
                      keepFailed={keepFailed.has(m.profileId)}
                    />
                  )
                ) : null}
                {m.outcome === "calendar_unknown" ? (
                  <p className="text-xs text-text-muted" data-testid="team-assign-unknown">
                    {tRes("unknown")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
