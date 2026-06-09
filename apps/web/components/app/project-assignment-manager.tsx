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

/**
 * Manager surface for F4: create a project + assign a roster worker to it +
 * end an assignment. Every write goes through the gated server actions / RPCs
 * (project + caller-roster gate); an unrelated worker or project returns
 * not_authorized. No fake rows, no destructive delete (assignments END).
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
  labels,
}: {
  projects: ProjectWithAssignments[];
  workers: ManagedWorker[];
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
      ) : workers.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary">{labels.noWorkers}</p>
      ) : (
        <form action={assignAction} className="card-border flex flex-col gap-3 p-5" data-testid="project-assign">
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
              {workers.map((w) => (
                <option key={w.profileId} value={w.profileId}>{w.name}</option>
              ))}
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

      {/* Per-project assignment lists */}
      {projects.map((p) => (
        <section key={p.id} className="card-border flex flex-col gap-2 p-5" data-testid="project-assignments">
          <p className="font-display text-sm font-semibold text-text-primary">
            {p.title ?? p.id.slice(0, 8)}{p.city ? ` · ${p.city}` : ""}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                  <li key={key} className="flex items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2">
                    <span className={`text-sm ${isEnded ? "text-text-muted line-through" : "text-text-primary"}`}>{a.name}</span>
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
        </section>
      ))}
    </div>
  );
}
