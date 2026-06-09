"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  OperationalStatus,
  ProjectOperations,
  ReadinessItem,
  ReadinessStatus,
  WorkerOps,
} from "@/lib/projects/operations-derive";
import { OPERATIONAL_STATUSES, READINESS_STATUSES } from "@/lib/projects/operations-derive";
import {
  seedReadinessItemsAction,
  setOperationalStatusAction,
  upsertReadinessItemAction,
} from "@/lib/projects/operations-actions";
import { PrintButton } from "@/components/app/print-button";

/**
 * Project worker operations board (slices pilot-ops-launch-v1 +
 * pilot-ops-v2-status-docs). Mobile-first, card-based — a manager operations /
 * player-card workflow, not an admin table.
 *
 * Honest by construction: every number is a real, RLS-scoped count; derived
 * "ready" reflects only the checked fields; the manager-set operational status
 * and the readiness/document checklist are shown verbatim from real rows and are
 * never auto-approved or auto-verified; empty states never imply data that does
 * not exist; candidate-skill clarification stays worker-owned and private.
 */

export interface OperationsBoardLabels {
  // header / summary
  eyebrow: string;
  untitledProject: string;
  statusLabel: string;
  locationLabel: string;
  startLabel: string;
  notSet: string;
  schemaNote: string;
  // counters
  countersTitle: string;
  totalAssigned: string;
  ready: string;
  readyBasis: string;
  needsDeclaredSkills: string;
  needsEvidence: string;
  needsFollowUp: string;
  openReviewItems: string;
  instructionsSent: string;
  // actions
  actionsTitle: string;
  assignAction: string;
  instructionsAction: string;
  csvAction: string;
  printAction: string;
  // worker cards
  workersTitle: string;
  noWorkers: string;
  readyChip: string;
  notReadyChip: string;
  declaredSkills: string;
  confirmedSkills: string;
  evidence: string;
  reviewItems: string;
  lastActivity: string;
  noActivity: string;
  assignedAt: string;
  missingTitle: string;
  missingName: string;
  missingDeclaredSkills: string;
  missingEvidence: string;
  followUpChip: string;
  playerCardLink: string;
  instructionLink: string;
  skillClarifyLink: string;
  // honesty notes
  notesTitle: string;
  documentsNote: string;
  candidateSkillNote: string;
  readinessHonestyNote: string;
  // v2 — operational status
  statusTitle: string;
  statusEmpty: string;
  statusHelper: string;
  save: string;
  saving: string;
  saved: string;
  saveError: string;
  needsMigration: string;
  statusLabels: Record<OperationalStatus, string>;
  // v2 — checklist
  checklist: {
    title: string;
    empty: string;
    seed: string;
    addItem: string;
    addPlaceholder: string;
    missing: string;
    received: string;
    checked: string;
    blocked: string;
    helper: string;
  };
  readinessStatusLabels: Record<ReadinessStatus, string>;
  defaultItemLabels: Record<string, string>;
  // v2 — filters
  filters: {
    title: string;
    all: string;
    byStatus: string;
    anyStatus: string;
    missingDocs: string;
    ready: string;
    needsSkillInfo: string;
    followUp: string;
    none: string;
  };
  counters2: {
    withMissingDocs: string;
    docsReceived: string;
    docsChecked: string;
    docsBlocked: string;
  };
}

type FilterKey = "all" | "missingDocs" | "ready" | "needsSkillInfo" | "followUp";

function Counter({
  value,
  label,
  hint,
  testid,
  emphasis,
}: {
  value: number;
  label: string;
  hint?: string;
  testid: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid={testid}
    >
      <span
        className={`font-display text-2xl font-bold tracking-tightest ${
          emphasis ? "text-state-success" : "text-text-primary"
        }`}
      >
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </span>
      {hint ? (
        <span className="text-[11px] leading-relaxed text-text-secondary">{hint}</span>
      ) : null}
    </div>
  );
}

function StatusEditor({
  worker,
  labels,
  projectId,
}: {
  worker: WorkerOps;
  labels: OperationsBoardLabels;
  projectId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<OperationalStatus | "">(worker.operationalStatus ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const save = () => {
    if (!value) return;
    setMsg(null);
    startTransition(async () => {
      const res = await setOperationalStatusAction({
        projectId,
        workerProfileId: worker.workerProfileId,
        status: value,
      });
      if (res.ok) {
        setMsg(labels.saved);
        router.refresh();
      } else {
        setMsg(res.code === "needs_migration" ? labels.needsMigration : labels.saveError);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1 print:hidden" data-testid="ops-status-editor">
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {labels.statusTitle}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={labels.statusTitle}
          value={value}
          onChange={(e) => setValue(e.target.value as OperationalStatus)}
          className="rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1 text-xs text-text-primary"
          data-testid="ops-status-select"
        >
          <option value="">{labels.statusEmpty}</option>
          {OPERATIONAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {labels.statusLabels[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !value}
          className="rounded-md border border-ink-600 px-2 py-1 text-xs font-medium text-text-secondary hover:border-brand-cyan hover:text-text-primary disabled:opacity-50"
          data-testid="ops-status-save"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {msg ? <span className="text-[11px] text-text-secondary">{msg}</span> : null}
      </div>
    </div>
  );
}

function ChecklistEditor({
  worker,
  labels,
  projectId,
}: {
  worker: WorkerOps;
  labels: OperationsBoardLabels;
  projectId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const onResult = (res: { ok: boolean; code?: string }) => {
    if (res.ok) {
      setMsg(null);
      router.refresh();
    } else {
      setMsg(res.code === "needs_migration" ? labels.needsMigration : labels.saveError);
    }
  };

  const setItemStatus = (item: ReadinessItem, status: ReadinessStatus) =>
    startTransition(async () => {
      const res = await upsertReadinessItemAction({
        projectId,
        workerProfileId: worker.workerProfileId,
        itemKey: item.itemKey,
        label: item.label,
        status,
      });
      onResult(res);
    });

  const addItem = () => {
    const label = newLabel.trim();
    if (!label) return;
    const itemKey = "custom_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    startTransition(async () => {
      const res = await upsertReadinessItemAction({
        projectId,
        workerProfileId: worker.workerProfileId,
        itemKey,
        label,
        status: "needed",
      });
      if (res.ok) setNewLabel("");
      onResult(res);
    });
  };

  const seed = () =>
    startTransition(async () => {
      const items = Object.entries(labels.defaultItemLabels).map(([itemKey, label]) => ({
        itemKey,
        label,
      }));
      const res = await seedReadinessItemsAction({
        projectId,
        workerProfileId: worker.workerProfileId,
        items,
      });
      onResult(res);
    });

  return (
    <div className="flex flex-col gap-2" data-testid="ops-checklist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.checklist.title}
        </span>
        <span className="flex flex-wrap gap-2 text-[10px] text-text-secondary">
          <span data-testid="ops-docs-missing">
            {labels.checklist.missing}: {worker.docsMissing}
          </span>
          <span>
            {labels.checklist.received}: {worker.docsReceived}
          </span>
          <span>
            {labels.checklist.checked}: {worker.docsChecked}
          </span>
          <span>
            {labels.checklist.blocked}: {worker.docsBlocked}
          </span>
        </span>
      </div>

      {worker.readinessItems.length === 0 ? (
        <p className="text-[11px] text-text-muted" data-testid="ops-checklist-empty">
          {labels.checklist.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {worker.readinessItems.map((item) => (
            <li
              key={item.itemKey}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-600 px-2 py-1"
            >
              <span className="text-[11px] text-text-primary">{item.label}</span>
              <select
                aria-label={item.label}
                value={item.status}
                disabled={pending}
                onChange={(e) => setItemStatus(item, e.target.value as ReadinessStatus)}
                className="rounded-md border border-ink-600 bg-ink-800/40 px-1.5 py-0.5 text-[11px] text-text-primary print:hidden"
                data-testid="ops-item-status-select"
              >
                {READINESS_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labels.readinessStatusLabels[s]}
                  </option>
                ))}
              </select>
              <span className="hidden text-[11px] text-text-secondary print:inline">
                {labels.readinessStatusLabels[item.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {worker.readinessItems.length === 0 ? (
          <button
            type="button"
            onClick={seed}
            disabled={pending}
            className="rounded-md border border-ink-600 px-2 py-1 text-[11px] font-medium text-text-secondary hover:border-brand-cyan hover:text-text-primary disabled:opacity-50"
            data-testid="ops-checklist-seed"
          >
            {labels.checklist.seed}
          </button>
        ) : null}
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={labels.checklist.addPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1 text-[11px] text-text-primary"
          data-testid="ops-checklist-add-input"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={pending || newLabel.trim().length === 0}
          className="rounded-md border border-ink-600 px-2 py-1 text-[11px] font-medium text-text-secondary hover:border-brand-cyan hover:text-text-primary disabled:opacity-50"
          data-testid="ops-checklist-add"
        >
          {labels.checklist.addItem}
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-text-muted">{labels.checklist.helper}</p>
      {msg ? <p className="text-[11px] text-text-secondary">{msg}</p> : null}
    </div>
  );
}

function WorkerCard({
  worker,
  labels,
  locale,
  projectId,
}: {
  worker: WorkerOps;
  labels: OperationsBoardLabels;
  locale: string;
  projectId: string;
}) {
  const missingLabel = (code: string) =>
    code === "name"
      ? labels.missingName
      : code === "declared_skills"
        ? labels.missingDeclaredSkills
        : code === "work_evidence"
          ? labels.missingEvidence
          : code;

  return (
    <article className="card-border flex flex-col gap-3 p-4" data-testid="ops-worker-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tightest text-text-primary">
          {worker.name}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {worker.operationalStatus ? (
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${
                worker.operationalStatus === "ready"
                  ? "border-state-success/40 text-state-success"
                  : "border-ink-600 text-text-secondary"
              }`}
              data-testid="ops-status-chip"
            >
              {labels.statusLabels[worker.operationalStatus]}
            </span>
          ) : null}
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${
              worker.ready
                ? "border-state-success/40 text-state-success"
                : "border-ink-600 text-text-secondary"
            }`}
            data-testid="ops-worker-readiness"
          >
            {worker.ready ? labels.readyChip : labels.notReadyChip}
          </span>
        </div>
      </header>

      <StatusEditor worker={worker} labels={labels} projectId={projectId} />

      <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <div>
          <dt className="text-text-muted">{labels.declaredSkills}</dt>
          <dd className="font-display text-sm text-text-primary">{worker.declaredSkills}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{labels.confirmedSkills}</dt>
          <dd className="font-display text-sm text-text-primary">{worker.confirmedSkills}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{labels.evidence}</dt>
          <dd className="font-display text-sm text-text-primary">{worker.journalEntries}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{labels.reviewItems}</dt>
          <dd className="font-display text-sm text-text-primary">{worker.openReviewItems}</dd>
        </div>
      </dl>

      {worker.missing.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.missingTitle}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {worker.missing.map((m) => (
              <span
                key={m}
                className="rounded-full border border-ink-600 px-2 py-0.5 text-[11px] text-text-secondary"
              >
                {missingLabel(m)}
              </span>
            ))}
            {worker.needsFollowUp ? (
              <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[11px] text-text-secondary">
                {labels.followUpChip}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <ChecklistEditor worker={worker} labels={labels} projectId={projectId} />

      <footer className="flex flex-wrap items-center gap-3 text-[11px] print:hidden">
        <Link href={`/${locale}/dashboard/player-card`} className="text-brand-cyan hover:underline">
          {labels.playerCardLink}
        </Link>
        <Link href={`/${locale}/dashboard/instructions`} className="text-brand-cyan hover:underline">
          {labels.instructionLink}
        </Link>
        <Link href={`/${locale}/dashboard/profile`} className="text-brand-cyan hover:underline">
          {labels.skillClarifyLink}
        </Link>
      </footer>
    </article>
  );
}

export function ProjectOperationsBoard({
  ops,
  labels,
  locale,
  csvHref,
  projectId,
}: {
  ops: ProjectOperations;
  labels: OperationsBoardLabels;
  locale: string;
  csvHref: string;
  projectId: string;
}) {
  const { project, workers, counters } = ops;
  const location = [project.city, project.country].filter(Boolean).join(", ");

  const [filter, setFilter] = useState<FilterKey>("all");
  const [statusFilter, setStatusFilter] = useState<OperationalStatus | "">("");

  const filtered = useMemo(() => {
    return workers.filter((w) => {
      if (statusFilter && w.operationalStatus !== statusFilter) return false;
      switch (filter) {
        case "missingDocs":
          return w.docsMissing > 0;
        case "ready":
          return w.ready;
        case "needsSkillInfo":
          return w.declaredSkills <= 0;
        case "followUp":
          return w.needsFollowUp;
        default:
          return true;
      }
    });
  }, [workers, filter, statusFilter]);

  const filterBtn = (key: FilterKey, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      aria-pressed={filter === key}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        filter === key
          ? "border-brand-cyan text-text-primary"
          : "border-ink-600 text-text-secondary hover:text-text-primary"
      }`}
      data-testid={`ops-filter-${key}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6" data-testid="project-operations-board">
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          {labels.eyebrow}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {project.title ?? labels.untitledProject}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span>
            {labels.statusLabel}: {project.status ?? labels.notSet}
          </span>
          <span>
            {labels.locationLabel}: {location || labels.notSet}
          </span>
          <span>
            {labels.startLabel}: {project.startDate ?? labels.notSet}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">{labels.schemaNote}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.countersTitle}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Counter testid="ops-total" value={counters.totalAssigned} label={labels.totalAssigned} />
          <Counter
            testid="ops-ready"
            value={counters.ready}
            label={labels.ready}
            hint={labels.readyBasis}
            emphasis
          />
          <Counter
            testid="ops-needs-skills"
            value={counters.needsDeclaredSkills}
            label={labels.needsDeclaredSkills}
          />
          <Counter
            testid="ops-needs-evidence"
            value={counters.needsEvidence}
            label={labels.needsEvidence}
          />
          <Counter
            testid="ops-needs-followup"
            value={counters.needsFollowUp}
            label={labels.needsFollowUp}
          />
          <Counter
            testid="ops-missing-docs"
            value={counters.withMissingDocs}
            label={labels.counters2.withMissingDocs}
          />
          <Counter
            testid="ops-docs-checked"
            value={counters.docsChecked}
            label={labels.counters2.docsChecked}
          />
          <Counter
            testid="ops-instructions"
            value={counters.instructionsSent}
            label={labels.instructionsSent}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2 print:hidden">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.actionsTitle}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${locale}/dashboard/projects`}
            className="rounded-md border border-ink-600 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-cyan hover:text-text-primary"
            data-testid="ops-assign-link"
          >
            {labels.assignAction}
          </Link>
          <Link
            href={`/${locale}/dashboard/instructions`}
            className="rounded-md border border-ink-600 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-cyan hover:text-text-primary"
            data-testid="ops-instructions-link"
          >
            {labels.instructionsAction}
          </Link>
          <a
            href={csvHref}
            className="rounded-md border border-ink-600 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-cyan hover:text-text-primary"
            data-testid="ops-csv-link"
          >
            {labels.csvAction}
          </a>
          <PrintButton label={labels.printAction} />
        </div>
      </section>

      <section className="flex flex-col gap-2 print:hidden" data-testid="ops-filters">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.filters.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {filterBtn("all", labels.filters.all)}
          {filterBtn("missingDocs", labels.filters.missingDocs)}
          {filterBtn("ready", labels.filters.ready)}
          {filterBtn("needsSkillInfo", labels.filters.needsSkillInfo)}
          {filterBtn("followUp", labels.filters.followUp)}
          <select
            aria-label={labels.filters.byStatus}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OperationalStatus)}
            className="rounded-full border border-ink-600 bg-ink-800/40 px-2 py-1 text-[11px] text-text-primary"
            data-testid="ops-filter-status"
          >
            <option value="">{labels.filters.anyStatus}</option>
            {OPERATIONAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labels.statusLabels[s]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.workersTitle}
        </h2>
        {workers.length === 0 ? (
          <p className="card-border p-4 text-sm text-text-secondary" data-testid="ops-no-workers">
            {labels.noWorkers}
          </p>
        ) : filtered.length === 0 ? (
          <p className="card-border p-4 text-sm text-text-secondary" data-testid="ops-filter-none">
            {labels.filters.none}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((w) => (
              <WorkerCard
                key={w.workerId}
                worker={w}
                labels={labels}
                locale={locale}
                projectId={projectId}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2" data-testid="ops-honesty-notes">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.notesTitle}
        </h2>
        <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-text-muted">
          <li>{labels.readinessHonestyNote}</li>
          <li>{labels.statusHelper}</li>
          <li>{labels.checklist.helper}</li>
          <li>{labels.documentsNote}</li>
          <li>{labels.candidateSkillNote}</li>
        </ul>
      </section>
    </div>
  );
}
