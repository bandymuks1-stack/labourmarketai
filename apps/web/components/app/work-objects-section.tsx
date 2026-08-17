"use client";

import { useActionState } from "react";
import { Archive, ArchiveRestore, Landmark, MapPin, UserRound } from "lucide-react";

import type { WorkObject } from "@/lib/objects/objects-model";
import { workObjectPlace } from "@/lib/objects/objects-model";
import {
  archiveWorkObjectAction,
  restoreWorkObjectAction,
  saveWorkObjectAction,
  setWorkObjectResponsibleAction,
  type WorkObjectActionState,
} from "@/lib/objects/objects-actions";

/**
 * Objects & sites management section — train D.
 *
 * REWIRES the former company "Locations" surface (which fed on the
 * superseded, never-applied company_locations draft — Train M verdict) to
 * the canonical `work_objects` entity: org-scoped sites with an optional
 * project binding, a responsible person and an honest active/archived
 * lifecycle. Until the LEAD applies 20260817150000 the section shows the
 * honest "prepared, activation pending" state — no fake controls.
 *
 * Authority is MEMBERSHIP-based (managing roles write, members read) —
 * enforced server-side in the RPCs; this component only renders outcomes.
 */

export interface WorkObjectsSectionLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly nameLabel: string;
  readonly countryLabel: string;
  readonly regionLabel: string;
  readonly cityLabel: string;
  readonly addressLabel: string;
  readonly projectLabel: string;
  readonly projectNone: string;
  readonly responsibleLabel: string;
  readonly responsibleNone: string;
  readonly responsibleSave: string;
  readonly addButton: string;
  readonly editButton: string;
  readonly saveButton: string;
  readonly archiveButton: string;
  readonly restoreButton: string;
  readonly archivedHeading: string;
  readonly archivedBadge: string;
  readonly empty: string;
  readonly gatedHeading: string;
  readonly gatedBody: string;
  readonly errorLabel: string;
  readonly notAuthorizedLabel: string;
  readonly savedLabel: string;
  readonly countries: Record<string, string>;
  readonly countryCodes: readonly string[];
}

export interface WorkObjectProjectOption {
  readonly id: string;
  readonly title: string;
}

export interface WorkObjectMemberOption {
  readonly profileId: string;
  readonly name: string;
}

export type WorkObjectsSectionState =
  | { readonly kind: "ok"; readonly rows: readonly WorkObject[] }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

const IDLE: WorkObjectActionState = { status: "idle" };

const FIELD_CLS =
  "rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

function ObjectFields({
  labels,
  projects,
  object,
}: {
  labels: WorkObjectsSectionLabels;
  projects: readonly WorkObjectProjectOption[];
  object?: WorkObject;
}) {
  return (
    <>
      <label className="flex min-w-40 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">
          {labels.nameLabel}
        </span>
        <input
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={object?.name ?? ""}
          className={FIELD_CLS}
        />
      </label>
      <label className="flex min-w-32 flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">
          {labels.countryLabel}
        </span>
        <select
          name="country"
          defaultValue={object?.country ?? ""}
          className={FIELD_CLS}
        >
          <option value="">—</option>
          {labels.countryCodes.map((code) => (
            <option key={code} value={code}>
              {labels.countries[code] ?? code}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-32 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">
          {labels.cityLabel}
        </span>
        <input
          type="text"
          name="city"
          maxLength={120}
          defaultValue={object?.city ?? ""}
          className={FIELD_CLS}
        />
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">
          {labels.addressLabel}
        </span>
        <input
          type="text"
          name="addressLine"
          maxLength={200}
          defaultValue={object?.addressLine ?? ""}
          className={FIELD_CLS}
        />
      </label>
      {projects.length > 0 ? (
        <label className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">
            {labels.projectLabel}
          </span>
          <select
            name="projectId"
            defaultValue={object?.projectId ?? ""}
            className={FIELD_CLS}
          >
            <option value="">{labels.projectNone}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

export function WorkObjectsSection({
  state,
  projects,
  members,
  labels,
}: {
  state: WorkObjectsSectionState;
  projects: readonly WorkObjectProjectOption[];
  members: readonly WorkObjectMemberOption[];
  labels: WorkObjectsSectionLabels;
}) {
  const [saveState, saveAction, savePending] = useActionState(
    saveWorkObjectAction,
    IDLE,
  );
  const [archiveState, archiveAction] = useActionState(
    archiveWorkObjectAction,
    IDLE,
  );
  const [restoreState, restoreAction] = useActionState(
    restoreWorkObjectAction,
    IDLE,
  );
  const [responsibleState, responsibleAction] = useActionState(
    setWorkObjectResponsibleAction,
    IDLE,
  );

  const gated =
    state.kind === "needs-migration" ||
    saveState.status === "needs-migration" ||
    archiveState.status === "needs-migration" ||
    restoreState.status === "needs-migration" ||
    responsibleState.status === "needs-migration";

  const anyError = [saveState, archiveState, restoreState, responsibleState].some(
    (s) => s.status === "error" || s.status === "invalid",
  );
  const anyNotAuthorized = [
    saveState,
    archiveState,
    restoreState,
    responsibleState,
  ].some((s) => s.status === "not-authorized");

  const memberName = (profileId: string | null): string | null => {
    if (!profileId) return null;
    return members.find((m) => m.profileId === profileId)?.name ?? null;
  };
  const projectTitle = (projectId: string | null): string | null => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.title ?? null;
  };

  const active =
    state.kind === "ok" ? state.rows.filter((r) => r.status === "active") : [];
  const archived =
    state.kind === "ok" ? state.rows.filter((r) => r.status === "archived") : [];

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="work-objects-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <Landmark className="h-4 w-4 text-brand-blue" aria-hidden />
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      {gated ? (
        <div
          className="rounded-md border border-state-warning bg-state-warning/10 p-3"
          data-testid="work-objects-gated"
        >
          <p className="font-mono text-meta uppercase tracking-label text-state-warning">
            {labels.gatedHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">{labels.gatedBody}</p>
        </div>
      ) : state.kind === "error" ? (
        <p className="text-xs text-state-danger" role="alert">
          {labels.errorLabel}
        </p>
      ) : (
        <>
          {saveState.status === "saved" ? (
            <p className="text-xs text-state-success" role="status">
              {labels.savedLabel}
            </p>
          ) : null}
          {anyNotAuthorized ? (
            <p className="text-xs text-state-danger" role="alert">
              {labels.notAuthorizedLabel}
            </p>
          ) : null}
          {anyError ? (
            <p className="text-xs text-state-danger" role="alert">
              {labels.errorLabel}
            </p>
          ) : null}

          {active.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="work-objects-empty"
            >
              {labels.empty}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="work-objects-list">
              {active.map((row) => {
                const place = workObjectPlace(row);
                const project = projectTitle(row.projectId);
                const responsible = memberName(row.responsibleProfileId);
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
                    data-testid="work-object-row"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-2 text-sm text-text-primary">
                        <MapPin
                          className="h-4 w-4 shrink-0 text-brand-blue"
                          aria-hidden
                        />
                        <span className="truncate font-semibold">{row.name}</span>
                        {place ? (
                          <span className="truncate text-xs text-text-secondary">
                            {place}
                            {row.country && labels.countries[row.country]
                              ? "" // country name already included via place
                              : ""}
                          </span>
                        ) : null}
                      </span>
                      <form action={archiveAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          aria-label={labels.archiveButton}
                          title={labels.archiveButton}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-500 px-2 text-xs text-text-muted transition-colors hover:border-state-warning hover:text-state-warning"
                          data-testid={`work-object-archive-${row.id}`}
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden />
                          {labels.archiveButton}
                        </button>
                      </form>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
                      {project ? (
                        <span className="rounded-full border border-ink-500 px-2 py-0.5">
                          {project}
                        </span>
                      ) : null}
                      {responsible ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5">
                          <UserRound className="h-3 w-3" aria-hidden />
                          {responsible}
                        </span>
                      ) : null}
                    </div>

                    {members.length > 0 ? (
                      <form
                        action={responsibleAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <label className="flex min-w-40 flex-col gap-1">
                          <span className="text-xs font-medium text-text-secondary">
                            {labels.responsibleLabel}
                          </span>
                          <select
                            name="profileId"
                            defaultValue={row.responsibleProfileId ?? ""}
                            className={FIELD_CLS}
                          >
                            <option value="">{labels.responsibleNone}</option>
                            {members.map((m) => (
                              <option key={m.profileId} value={m.profileId}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="inline-flex h-9 items-center rounded-lg border border-ink-500 px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue"
                          data-testid={`work-object-responsible-save-${row.id}`}
                        >
                          {labels.responsibleSave}
                        </button>
                      </form>
                    ) : null}

                    <details className="rounded-md border border-ink-600 bg-ink-800/40 p-2">
                      <summary className="cursor-pointer text-xs text-text-secondary">
                        {labels.editButton}
                      </summary>
                      <form
                        action={saveAction}
                        className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <ObjectFields
                          labels={labels}
                          projects={projects}
                          object={row}
                        />
                        <button
                          type="submit"
                          disabled={savePending}
                          className="inline-flex h-10 items-center rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
                          data-testid={`work-object-save-${row.id}`}
                        >
                          {labels.saveButton}
                        </button>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            action={saveAction}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3 sm:flex-row sm:flex-wrap sm:items-end"
            data-testid="work-object-add-form"
          >
            <ObjectFields labels={labels} projects={projects} />
            <button
              type="submit"
              disabled={savePending}
              data-testid="work-object-add-submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
            >
              {labels.addButton}
            </button>
          </form>

          {archived.length > 0 ? (
            <details data-testid="work-objects-archived">
              <summary className="cursor-pointer text-xs text-text-secondary">
                {labels.archivedHeading} ({archived.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {archived.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-3 opacity-70"
                    data-testid="work-object-archived-row"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-text-primary">
                      <MapPin
                        className="h-4 w-4 shrink-0 text-text-muted"
                        aria-hidden
                      />
                      <span className="truncate">{row.name}</span>
                      <span className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                        {labels.archivedBadge}
                      </span>
                    </span>
                    <form action={restoreAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        aria-label={labels.restoreButton}
                        title={labels.restoreButton}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-500 px-2 text-xs text-text-muted transition-colors hover:border-brand-blue hover:text-brand-blue"
                        data-testid={`work-object-restore-${row.id}`}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
                        {labels.restoreButton}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
