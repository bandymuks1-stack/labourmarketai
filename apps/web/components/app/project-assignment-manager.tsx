"use client";

import { useActionState, useTransition, useState } from "react";

import {
  createProjectAction,
  assignWorkerToProjectAction,
  endAssignmentAction,
  type ProjectActionResult,
} from "@/lib/projects/actions";
import type { ManagedProject, ProjectAssignment } from "@/lib/projects/projects";
import type { ManagedWorker } from "@/lib/instructions/instructions";
import type { EngagementWorker } from "@/lib/projects/booking-engagement-workers";
import { playerInitials } from "@/lib/identity/player-identity";
import { Link } from "@/lib/i18n/navigation";

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
}

type ProjectWithAssignments = ManagedProject & {
  assignments: ProjectAssignment[];
};

const primary =
  "inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5";
const field =
  "rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary";

function resultError(r: ProjectActionResult | null, l: ProjectManagerLabels) {
  if (!r || r.ok) return null;
  const msg =
    r.code === "not_authorized"
      ? l.notAuthorized
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

export function ProjectAssignmentManager({
  projects,
  workers,
  engagementWorkers = [],
  labels,
}: {
  projects: ProjectWithAssignments[];
  workers: ManagedWorker[];
  /** Accepted-booking engagement candidates (booking-engagement bridge v1) —
   *  rendered as a SEPARATE, clearly-labelled group so a team/roster member
   *  is never conflated with an accepted-proposal candidate. Empty until the
   *  owner applies migration 20260723120000 (honest degradation). */
  engagementWorkers?: EngagementWorker[];
  labels: ProjectManagerLabels;
}) {
  const [createState, createAction, creating] = useActionState<
    ProjectActionResult | null,
    FormData
  >(createProjectAction, null);
  const [assignState, assignAction, assigning] = useActionState<
    ProjectActionResult | null,
    FormData
  >(assignWorkerToProjectAction, null);
  const [endPending, startEnd] = useTransition();
  const [ended, setEnded] = useState<Set<string>>(new Set());

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {/* Create a project */}
      <form action={createAction} className="card-border flex flex-col gap-3 p-5" data-testid="project-create">
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
          {resultError(createState, labels)}
        </div>
      </form>

      {/* Assign a worker to a project */}
      {projects.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary" data-testid="projects-empty">
          {labels.noProjects}
        </p>
      ) : workers.length === 0 && engagementWorkers.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary">{labels.noWorkers}</p>
      ) : (
        <form id="assign-worker" action={assignAction} className="card-border flex flex-col gap-3 p-5" data-testid="project-assign">
          <p className="font-display text-base font-semibold text-text-primary">
            {labels.assignTitle}
          </p>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-mono uppercase tracking-label text-text-muted">{labels.projectLabel}</span>
            <select name="project_id" defaultValue="" required className={field}>
              <option value="" disabled>{labels.projectPlaceholder}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title ?? p.id.slice(0, 8)}{p.city ? ` · ${p.city}` : ""}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-mono uppercase tracking-label text-text-muted">{labels.workerLabel}</span>
            <select name="worker_profile_id" defaultValue="" required className={field}>
              <option value="" disabled>{labels.workerPlaceholder}</option>
              {workers.length > 0 && (
                <optgroup label={labels.rosterGroupLabel} data-testid="assign-roster-group">
                  {workers.map((w) => (
                    <option key={w.profileId} value={w.profileId}>{w.name}</option>
                  ))}
                </optgroup>
              )}
              {engagementWorkers.length > 0 && (
                <optgroup
                  label={labels.engagementGroupLabel}
                  data-testid="assign-engagement-group"
                >
                  {engagementWorkers.map((w) => (
                    <option key={w.engagementId} value={w.workerProfileId}>
                      {w.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={assigning} className={primary}>
              {assigning ? labels.sending : labels.assignSubmit}
            </button>
            {assignState?.ok && (
              <span className="text-xs text-state-success" role="status">{labels.assigned}</span>
            )}
            {resultError(assignState, labels)}
          </div>
        </form>
      )}

      {/* Per-object roster (WAGON 6 staffing view): REAL assignment rows only,
          rendered as player-card-style chips (shared identity monogram). */}
      {projects.map((p) => (
        <section key={p.id} className="card-border flex flex-col gap-2 p-5" data-testid="project-assignments">
          <p className="font-display text-sm font-semibold text-text-primary">
            {p.title ?? p.id.slice(0, 8)}{p.city ? ` · ${p.city}` : ""}
          </p>
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.assignmentsTitle}
          </p>
          {p.assignments.length === 0 ? (
            <p className="text-xs text-text-muted" data-testid="project-no-assignments">{labels.noAssignments}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {p.assignments.map((a) => {
                const key = `${p.id}:${a.workerProfileId}`;
                const isEnded = ended.has(key);
                return (
                  <li key={key} className="flex items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2" data-testid="roster-worker-chip">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-500 bg-ink-700 font-display text-meta font-bold text-text-primary"
                      >
                        {playerInitials(a.name)}
                      </span>
                      <span className={`truncate text-sm ${isEnded ? "text-text-muted line-through" : "text-text-primary"}`}>{a.name}</span>
                    </span>
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
          {/* Roster actions: the EXISTING gated writes/views only — jump to the
              assign form above, open the existing manager-gated operations
              board (the permitted per-worker capability view). */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href="#assign-worker"
              data-testid="roster-assign-link"
              className="inline-flex min-h-8 items-center font-mono text-meta uppercase tracking-label text-brand-blue hover:underline"
            >
              {labels.assignFromRoster} ↑
            </a>
            <Link
              href={`/dashboard/projects/${p.id}/operations`}
              data-testid="roster-operations-link"
              className="inline-flex min-h-8 items-center font-mono text-meta uppercase tracking-label text-text-secondary hover:text-brand-blue hover:underline"
            >
              {labels.openBoard} →
            </Link>
          </div>
        </section>
      ))}
    </div>
  );
}
