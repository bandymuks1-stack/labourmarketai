"use client";

import { PersonIdentityCard } from "@/components/app/identity/person-identity-card";

import { useActionState, useTransition, useState } from "react";

import {
  createProjectAction,
  assignWorkerToProjectAction,
  endAssignmentAction,
  recordAssignmentDecisionAction,
  keepAssignmentAction,
  type ProjectActionResult,
} from "@/lib/projects/actions";
import {
  OVERRIDE_REASON_CODES,
  type OverrideReasonCode,
} from "@/lib/projects/override-receipt-model";
import { checkAssignmentClashAction } from "@/lib/projects/assignment-precheck";
import type { AssignmentPrecheckResult } from "@/lib/projects/assignment-precheck-core";
import type { ManagedProject, ProjectAssignment } from "@/lib/projects/projects";
import type { ManagedWorker } from "@/lib/instructions/instructions";
import type { EngagementWorker } from "@/lib/projects/booking-engagement-workers";
import type {
  ReservationSource,
  ReservationVerdict,
} from "@/lib/workforce/commitment-reservation";
import { playerInitials } from "@/lib/identity/player-identity";
import { Link } from "@/lib/i18n/navigation";
import { offersRosterWorker } from "@/lib/projects/assignment-authority";
import { DisplayedWorkspaceField } from "@/components/app/workspace/displayed-workspace-field";
import { ProjectTeamAssignments } from "@/components/app/project-team-assignments";
import type { AssignableTask, AssignableTeam } from "@/lib/projects/team-assignment";
import type { TeamAssignmentRow } from "@/lib/projects/team-assignment-model";

/**
 * Manager DRAFT surface for F4 (living-arena skin, TASK 07 slice 2): create a
 * project + assign a roster worker to it + end an assignment. Every write
 * goes through the gated server actions / RPCs (project + caller-roster
 * gate); an unrelated worker or project returns not_authorized. The pick is
 * ALWAYS a human decision — no ranking, no score, no auto-pick. No fake rows,
 * no destructive delete (assignments END).
 *
 * WAGON 6 (sports operating model): the per-object roster below renders each
 * assigned worker as a compact PLAYER-CARD-style chip — the SAME identity
 * monogram contract as the worker Player Card (playerInitials, one identity
 * system, never a second card system). Rows come ONLY from real
 * project_worker_assignments reads; the per-worker capability view stays the
 * existing manager-gated operations board (there is NO cross-user card route,
 * so no new one is invented here).
 */

export interface ProjectManagerLabels {
  createTitle: string;
  createNameLabel: string;
  createNamePlaceholder: string;
  createCityLabel: string;
  createCityPlaceholder: string;
  createSubmit: string;
  noCompany: string;
  assignTitle: string;
  projectLabel: string;
  projectPlaceholder: string;
  workerLabel: string;
  workerPlaceholder: string;
  assignSubmit: string;
  assigned: string;
  notAuthorized: string;
  needsMigration: string;
  errorMsg: string;
  noProjects: string;
  noWorkers: string;
  assignmentsTitle: string;
  noAssignments: string;
  end: string;
  sending: string;
  assignFromRoster: string;
  openBoard: string;
  /** Booking-engagement bridge v1 — the picker's two DISTINCT origins. */
  rosterGroupLabel: string;
  engagementGroupLabel: string;
  /** The CREATE form's own refusal sentence: a project insert the row-level
   *  policy refused (42501 — `projects_insert` is owner/admin today) names
   *  who can grant it, instead of the assign form's "workers from your team"
   *  sentence. Optional so older callers keep the shared label. */
  createNotAuthorized?: string;
  /** CAL-7 capacity reservation — shown AFTER the assignment, never before,
   *  because a warning may not decide whether a commitment happens. */
  reservationCollidesTitle: string;
  reservationNotBlocking: string;
  reservationUnknown: string;
  reservationSource: Record<ReservationSource, string>;
  /** The conflict flow's decision step: who is confirmed free, swap, undo. */
  reservationAlternativesTitle: string;
  reservationSwap: string;
  reservationUndo: string;
  reservationKeep: string;
  reservationDecided: string;
  /** The closed reason select on the keep (override) control. Optional so a
   *  caller without it simply offers keep with no reason. */
  overrideReasons?: OverrideReasonLabels;
  /** Shown when the caller may not assign ROSTER workers (SQL: owner/admin). */
  rosterOwnerOnly?: string;
  /** Shown when the selected project belongs to ANOTHER organization than the
   *  manager acts for: roster workers are not offered there (the database
   *  admits a manager only on their own project's company roster). */
  rosterOtherOrg?: string;
  /** Pre-save conflict check (advisory). Optional so callers that do not
   *  pass them simply get no pre-check. */
  precheckChecking?: string;
  precheckCollidesTitle?: string;
  precheckChoose?: string;
  precheckAssignAnyway?: string;
  precheckAdvisory?: string;
}

/** Labels of the closed override-reason select + the loud failure line. */
export interface OverrideReasonLabels {
  label: string;
  none: string;
  failed: string;
  options: Record<OverrideReasonCode, string>;
}

/** The collision notice's own labels — shared by the single and the team
 *  assignment surfaces so the conflict flow reads the same in both. */
export type ReservationLabels = Pick<
  ProjectManagerLabels,
  | "reservationCollidesTitle"
  | "reservationNotBlocking"
  | "reservationUnknown"
  | "reservationSource"
  | "reservationAlternativesTitle"
  | "reservationSwap"
  | "reservationUndo"
  | "reservationKeep"
>;

type ProjectWithAssignments = ManagedProject & {
  assignments: ProjectAssignment[];
};

const primary =
  "inline-flex w-fit items-center gap-2 rounded-md bg-gradient-cta px-4 py-2 text-sm font-semibold text-text-on-brand transition-transform hover:-translate-y-0.5";
const field =
  "rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary";

function resultError(
  r: ProjectActionResult | null,
  l: ProjectManagerLabels,
  notAuthorized: string = l.notAuthorized,
) {
  if (!r || r.ok) return null;
  const msg =
    r.code === "not_authorized"
      ? notAuthorized
      : r.code === "needs_migration"
        ? l.needsMigration
        : r.code === "no_company"
          ? l.noCompany
          : l.errorMsg;
  return (
    <span className="text-xs text-state-danger" role="status">
      {msg}
    </span>
  );
}

/**
 * CAL-7 — what the person was already committed to across these dates.
 *
 * This is a NOTICE, not a gate: the assignment has already happened by the
 * time it renders (SEP-2 — a reservation warns, it never prohibits), and the
 * manager can end it from the roster below if the clash is real.
 *
 * Three states, never two. `clear` renders nothing — there is nothing to say.
 * `collides` names each commitment and the days it shares. `unknown` says the
 * dates could not be confirmed free, which is NOT the same as free: a failed
 * read rendered as an empty schedule is the exact defect the capacity work
 * exists to end (SEP-7).
 *
 * An absence carries no label by construction — the employer read never asks
 * for the reason, and nothing here invents one.
 */
export function ReservationNotice({
  verdict,
  labels,
  alternatives = [],
  busy = false,
  onSwap,
  onUndo,
  onKeep,
  reasons,
  keepFailed = false,
}: {
  verdict: ReservationVerdict;
  labels: ReservationLabels;
  /** Colleagues CONFIRMED free on the same dates (server-verified). */
  alternatives?: { profileId: string; name: string }[];
  busy?: boolean;
  onSwap?: (profileId: string) => void;
  onUndo?: () => void;
  /** Receives the closed reason code the manager picked, or null. */
  onKeep?: (reasonCode: OverrideReasonCode | null) => void;
  /** When present the keep control carries the closed reason select (no free
   *  text exists anywhere on the receipt path). */
  reasons?: OverrideReasonLabels;
  /** The receipt could not be recorded: say so, the decision is NOT made. */
  keepFailed?: boolean;
}) {
  const [reason, setReason] = useState<OverrideReasonCode | "">("");
  if (verdict.state === "clear") return null;
  if (verdict.state === "unknown") {
    return (
      <p className="text-xs text-text-muted" role="status" data-testid="assign-reservation-unknown">
        {labels.reservationUnknown}
      </p>
    );
  }
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-state-warning/40 p-3"
      role="status"
      data-testid="assign-reservation-collides"
    >
      <p className="text-xs font-semibold text-state-warning">{labels.reservationCollidesTitle}</p>
      <ul className="flex flex-col gap-0.5">
        {verdict.collisions.map((c) => (
          <li key={`${c.source}:${c.sourceId}`} className="text-xs text-text-secondary">
            <span className="font-mono uppercase tracking-label text-text-muted">
              {labels.reservationSource[c.source]}
            </span>{" "}
            {c.label ? `${c.label} · ` : ""}
            {c.overlapStart === c.overlapEnd ? c.overlapStart : `${c.overlapStart} – ${c.overlapEnd}`}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">{labels.reservationNotBlocking}</p>
      {alternatives.length > 0 && onSwap ? (
        <div className="flex flex-col gap-1" data-testid="assign-reservation-alternatives">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.reservationAlternativesTitle}
          </p>
          <ul className="flex flex-col gap-1">
            {alternatives.map((a) => (
              <li key={a.profileId} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-text-primary">{a.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSwap(a.profileId)}
                  data-testid="assign-reservation-swap"
                  className="min-h-11 sm:min-h-8 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-blue"
                >
                  {labels.reservationSwap}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {onKeep && reasons ? (
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {reasons.label}
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as OverrideReasonCode | "")}
            data-testid="assign-reservation-reason"
            className="min-h-11 sm:min-h-8 rounded-md border border-ink-500 bg-transparent px-2 py-1 text-xs"
          >
            <option value="">{reasons.none}</option>
            {OVERRIDE_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {reasons.options[code]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {keepFailed && reasons ? (
        <p className="text-xs text-state-danger" role="alert" data-testid="assign-reservation-keep-failed">
          {reasons.failed}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {onKeep ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onKeep(reason === "" ? null : reason)}
            data-testid="assign-reservation-keep"
            className="min-h-11 sm:min-h-8 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-blue"
          >
            {labels.reservationKeep}
          </button>
        ) : null}
        {onUndo ? (
          <button
            type="button"
            disabled={busy}
            onClick={onUndo}
            data-testid="assign-reservation-undo"
            className="min-h-11 sm:min-h-8 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-orange"
          >
            {labels.reservationUndo}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectAssignmentManager({
  projects,
  workers: rosterWorkers,
  engagementWorkers = [],
  rosterAssignable = true,
  rosterProjectIds = null,
  labels,
  teamWork,
}: {
  projects: ProjectWithAssignments[];
  workers: ManagedWorker[];
  /** Accepted-booking engagement candidates (booking-engagement bridge v1) —
   *  rendered as a SEPARATE, clearly-labelled group so a team/roster member
   *  is never conflated with an accepted-proposal candidate. Empty until the
   *  owner applies migration 20260723120000 (honest degradation). */
  engagementWorkers?: EngagementWorker[];
  /** False for a role the database refuses roster assignment (manager):
   *  roster workers are withheld so the form never offers a refused action. */
  rosterAssignable?: boolean;
  /** Projects on which ROSTER workers may be offered (a manager: only the
   *  projects of the organization they act for). null = no restriction; the
   *  database still decides every write. */
  rosterProjectIds?: readonly string[] | null;
  labels: ProjectManagerLabels;
  /** WRK-6 — teams as ONE assignment on a project (or one of its tasks).
   *  Absent = the surface offers persons only (older callers). `byProject` is
   *  a plain object so it crosses the server/client boundary. */
  teamWork?: {
    byProject: Readonly<Record<string, readonly TeamAssignmentRow[]>>;
    teams: readonly AssignableTeam[];
    tasks: readonly AssignableTask[];
  };
}) {
  const [selProject, setSelProject] = useState("");
  const rosterOfferedHere = offersRosterWorker(rosterProjectIds, selProject);
  const workers = rosterAssignable ? rosterWorkers : [];
  // The roster options shown for the SELECTED project (a manager sees none
  // on another organization's project).
  const rosterHere = rosterOfferedHere ? workers : [];
  const [createState, createAction, creating] = useActionState<
    ProjectActionResult | null,
    FormData
  >(createProjectAction, null);
  const [assignState, assignAction, assigning] = useActionState<
    ProjectActionResult | null,
    FormData
  >(assignWorkerToProjectAction, null);
  const [endPending, startEnd] = useTransition();
  // The human decision on a collision, keyed to the result it answers so a new
  // assignment never inherits the previous decision.
  const [decision, setDecision] = useState<{ for: unknown } | null>(null);
  const [deciding, startDeciding] = useTransition();
  const decided = decision !== null && decision.for === assignState;
  const undoAssignment = () => {
    const a = assignState?.ok ? assignState.assigned : undefined;
    if (!a) return;
    startDeciding(async () => {
      const r = await endAssignmentAction(a.projectId, a.workerProfileId);
      if (r.ok) {
        await recordAssignmentDecisionAction(a.projectId, a.workerProfileId, "undone");
        setDecision({ for: assignState });
      }
    });
  };
  const [keepFailed, setKeepFailed] = useState(false);
  const keepAssignment = (reasonCode: OverrideReasonCode | null) => {
    const a = assignState?.ok ? assignState.assigned : undefined;
    if (!a) return;
    setKeepFailed(false);
    startDeciding(async () => {
      // FAIL-LOUD: the override is decided only when its receipt exists.
      const r = await keepAssignmentAction(a.projectId, a.workerProfileId, reasonCode);
      if (!r.ok) {
        setKeepFailed(true);
        return;
      }
      setDecision({ for: assignState });
    });
  };
  const swapAssignment = (profileId: string) => {
    const a = assignState?.ok ? assignState.assigned : undefined;
    if (!a) return;
    startDeciding(async () => {
      const ended = await endAssignmentAction(a.projectId, a.workerProfileId);
      if (!ended.ok) return;
      const fd = new FormData();
      fd.set("project_id", a.projectId);
      fd.set("worker_profile_id", profileId);
      const r = await assignWorkerToProjectAction(null, fd);
      if (r.ok) {
        await recordAssignmentDecisionAction(a.projectId, a.workerProfileId, "swapped");
        setDecision({ for: assignState });
      }
    });
  };
  // PRE-SAVE conflict check — advisory only. The pre-check READS; nothing is
  // committed when a person is selected. "Assign anyway" just submits the
  // ordinary assign action: there is NO receipt of the override yet (the
  // durable receipt and a server-side transactional re-check are a later RED
  // PR that depends on #2079), and the final write is NOT re-checked against
  // this verdict. A failed pre-check shows nothing and never blocks the form.
  const [selWorker, setSelWorker] = useState("");
  const [pre, setPre] = useState<{ key: string; result: AssignmentPrecheckResult } | null>(null);
  const [checking, startChecking] = useTransition();
  const precheckKey = `${selProject}:${selWorker}`;
  const runPrecheck = (projectId: string, workerProfileId: string) => {
    if (!projectId || !workerProfileId || !labels.precheckCollidesTitle) {
      setPre(null);
      return;
    }
    const key = `${projectId}:${workerProfileId}`;
    startChecking(async () => {
      try {
        const result = await checkAssignmentClashAction({ projectId, workerProfileId });
        setPre({ key, result });
      } catch {
        setPre(null);
      }
    });
  };
  const preResult = pre && pre.key === precheckKey && pre.result.ok ? pre.result : null;
  const preLabels: ReservationLabels | null =
    labels.precheckCollidesTitle && labels.precheckChoose && labels.precheckAssignAnyway
      ? {
          ...labels,
          reservationCollidesTitle: labels.precheckCollidesTitle,
          reservationSwap: labels.precheckChoose,
          reservationKeep: labels.precheckAssignAnyway,
        }
      : null;
  const [ended, setEnded] = useState<Set<string>>(new Set());
  const onTeam = new Set(rosterHere.map((w) => w.profileId));
  const engagementOnly = engagementWorkers.filter((w) => !onTeam.has(w.workerProfileId));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {/* Create a project */}
      <form action={createAction} className="card-border flex flex-col gap-3 p-5" data-testid="project-create">
        <DisplayedWorkspaceField />
        <p className="font-display text-base font-semibold text-text-primary">
          {labels.createTitle}
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-mono uppercase tracking-label text-text-muted">{labels.createNameLabel}</span>
          <input name="title" required placeholder={labels.createNamePlaceholder} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-mono uppercase tracking-label text-text-muted">{labels.createCityLabel}</span>
          <input name="city" placeholder={labels.createCityPlaceholder} className={field} />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={creating} className={primary}>
            {creating ? labels.sending : labels.createSubmit}
          </button>
          {resultError(createState, labels, labels.createNotAuthorized)}
        </div>
      </form>

      {/* Assign a worker to a project */}
      {projects.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary" data-testid="projects-empty">
          {labels.noProjects}
        </p>
      ) : workers.length === 0 && engagementWorkers.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary" data-testid={rosterAssignable ? undefined : "assign-roster-owner-only"}>
          {!rosterAssignable && labels.rosterOwnerOnly ? labels.rosterOwnerOnly : labels.noWorkers}
        </p>
      ) : (
        <form id="assign-worker" action={assignAction} className="card-border flex flex-col gap-3 p-5" data-testid="project-assign">
          <p className="font-display text-base font-semibold text-text-primary">
            {labels.assignTitle}
          </p>
          {!rosterAssignable && labels.rosterOwnerOnly ? (
            <p className="text-xs text-text-secondary" data-testid="assign-roster-owner-only">
              {labels.rosterOwnerOnly}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-mono uppercase tracking-label text-text-muted">{labels.projectLabel}</span>
            <select
              name="project_id"
              value={selProject}
              onChange={(e) => {
                const nextProject = e.target.value;
                setSelProject(nextProject);
                // A roster worker is not offered on another organization's
                // project: drop the pick instead of submitting a refusal.
                const stillOffered =
                  offersRosterWorker(rosterProjectIds, nextProject) ||
                  engagementWorkers.some((w) => w.workerProfileId === selWorker);
                const nextWorker = stillOffered ? selWorker : "";
                if (!stillOffered) setSelWorker("");
                runPrecheck(nextProject, nextWorker);
              }}
              required
              className={field}
            >
              <option value="" disabled>{labels.projectPlaceholder}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title ?? p.id.slice(0, 8)}{p.city ? ` · ${p.city}` : ""}</option>
              ))}
            </select>
          </label>
          {rosterAssignable && !rosterOfferedHere && labels.rosterOtherOrg ? (
            <p className="text-xs text-text-secondary" data-testid="assign-roster-other-org">
              {labels.rosterOtherOrg}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-mono uppercase tracking-label text-text-muted">{labels.workerLabel}</span>
            <select
              name="worker_profile_id"
              value={selWorker}
              onChange={(e) => {
                setSelWorker(e.target.value);
                runPrecheck(selProject, e.target.value);
              }}
              required
              className={field}
              data-testid="assign-worker-select"
            >
              <option value="" disabled>{labels.workerPlaceholder}</option>
              {rosterHere.length > 0 && (
                <optgroup label={labels.rosterGroupLabel} data-testid="assign-roster-group">
                  {rosterHere.map((w) => (
                    <option key={w.profileId} value={w.profileId}>{w.name}</option>
                  ))}
                </optgroup>
              )}
              {/* Each person once: someone already on the team who ALSO
                  accepted a proposal was listed twice, the same option in both
                  groups (production walk 2026-09-28). The team entry stands. */}
              {engagementOnly.length > 0 && (
                <optgroup
                  label={labels.engagementGroupLabel}
                  data-testid="assign-engagement-group"
                >
                  {engagementOnly.map((w) => (
                    <option key={w.engagementId} value={w.workerProfileId}>
                      {w.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {checking && labels.precheckChecking ? (
            <p className="text-xs text-text-muted" role="status" data-testid="assign-precheck-checking">
              {labels.precheckChecking}
            </p>
          ) : null}
          {!checking && preResult && preLabels && preResult.verdict.state !== "clear" ? (
            <div className="flex flex-col gap-1" data-testid="assign-precheck">
              <ReservationNotice
                verdict={preResult.verdict}
                labels={preLabels}
                alternatives={[...preResult.alternatives]}
                onSwap={(profileId) => {
                  setSelWorker(profileId);
                  runPrecheck(selProject, profileId);
                }}
                onKeep={
                  preResult.verdict.state === "collides" && preResult.canOverride
                    ? () => document.getElementById("assign-worker-submit")?.click()
                    : undefined
                }
              />
              {labels.precheckAdvisory ? (
                <p className="text-meta text-text-muted">{labels.precheckAdvisory}</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              id="assign-worker-submit"
              type="submit"
              disabled={assigning}
              className={primary}
            >
              {assigning ? labels.sending : labels.assignSubmit}
            </button>
            {assignState?.ok && !decided && (
              <span className="text-xs text-state-success" role="status">{labels.assigned}</span>
            )}
            {resultError(assignState, labels)}
          </div>
          {decided ? (
            <p className="text-xs text-state-success" role="status" data-testid="assign-reservation-decided">
              {labels.reservationDecided}
            </p>
          ) : assignState?.ok && assignState.reservation ? (
            <ReservationNotice
              verdict={assignState.reservation}
              labels={labels}
              alternatives={assignState.alternatives}
              busy={deciding}
              onSwap={swapAssignment}
              onUndo={undoAssignment}
              onKeep={keepAssignment}
              reasons={labels.overrideReasons}
              keepFailed={keepFailed}
            />
          ) : null}
        </form>
      )}

      {/* Per-object roster (WAGON 6 staffing view): REAL assignment rows only,
          rendered as player-card-style chips (shared identity monogram). */}
      {/* ONE panel for every project's people (premium structure pass
          2026-10-10): the project map above already gives each project its
          card, so the rosters are rows of a single panel with the heading said
          once — not a second card per project. Every row stays expanded: the
          team and person assignment controls are used in place. */}
      {projects.length > 0 ? (
      <section className="card-border flex flex-col p-5" data-testid="project-assignments-panel">
        <h2 className="text-sm font-semibold text-text-primary">{labels.assignmentsTitle}</h2>
      {projects.map((p) => (
        <section key={p.id} className="flex flex-col gap-2 border-t border-ink-600 py-4 first-of-type:border-0 last:pb-0" data-testid="project-assignments">
          <p className="font-display text-sm font-semibold text-text-primary">
            {p.title ?? p.id.slice(0, 8)}{p.city ? ` · ${p.city}` : ""}
          </p>
          {p.assignments.length === 0 ? (
            <p className="text-xs text-text-muted" data-testid="project-no-assignments">{labels.noAssignments}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {p.assignments.map((a) => {
                const key = `${p.id}:${a.workerProfileId}`;
                const isEnded = ended.has(key);
                return (
                  <li key={key} className={`flex items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 ${isEnded ? "opacity-60" : ""}`} data-testid="roster-worker-chip">
                    {/* The SAME identity the team list and the candidate read
                        use, at row density; a photo only where the one photo
                        rule gave the viewer one. */}
                    <PersonIdentityCard
                      variant="assignment"
                      density="compact"
                      testid={`assignment-identity-${key}`}
                      name={a.name}
                      initials={playerInitials(a.name)}
                      avatarUrl={a.avatarUrl ?? null}
                      professions={[]}
                      meta={[]}
                    />
                    {!isEnded && (
                      <button
                        type="button"
                        disabled={endPending}
                        onClick={() =>
                          startEnd(async () => {
                            const r = await endAssignmentAction(p.id, a.workerProfileId);
                            if (r.ok) setEnded((s) => new Set(s).add(key));
                          })
                        }
                        className="rounded-md border border-ink-500 px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-orange"
                      >
                        {labels.end}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* A team is assigned as ONE relationship, beside the person list. */}
          {teamWork ? (
            <ProjectTeamAssignments
              projectId={p.id}
              assignments={teamWork.byProject[p.id] ?? []}
              teams={teamWork.teams}
              tasks={teamWork.tasks.filter((x) => x.projectId === p.id)}
            />
          ) : null}
          {/* Roster actions: the EXISTING gated writes/views only — jump to the
              assign form above, open the existing manager-gated operations
              board (the permitted per-worker capability view). */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href="#assign-worker"
              data-testid="roster-assign-link"
              className="inline-flex min-h-11 sm:min-h-8 items-center text-meta font-medium text-text-primary underline-offset-4 hover:underline"
            >
              {labels.assignFromRoster} ↑
            </a>
            <Link
              href={`/dashboard/projects/${p.id}/operations`}
              data-testid="roster-operations-link"
              className="inline-flex min-h-11 sm:min-h-8 items-center text-meta font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              {labels.openBoard} →
            </Link>
          </div>
        </section>
      ))}
      </section>
      ) : null}
    </div>
  );
}
