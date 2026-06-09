import Link from "next/link";

import type { ProjectOperations, WorkerOps } from "@/lib/projects/operations-derive";
import { PrintButton } from "@/components/app/print-button";

/**
 * Project worker operations board (slice pilot-ops-launch-v1). Mobile-first,
 * card-based — a manager operations / player-card workflow, not an admin table.
 * Every number is a real, RLS-scoped count; "ready" is honest (only the checked
 * fields); empty states never imply data that does not exist; documents and
 * candidate-skill clarification are reported truthfully (not tracked here /
 * worker-owned and private).
 */

export interface OperationsBoardLabels {
  // header / summary
  eyebrow: string;
  untitledProject: string;
  statusLabel: string;
  locationLabel: string;
  startLabel: string;
  notSet: string;
  schemaNote: string; // missing primitives (professions/quantity/site precision)
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
}

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

function WorkerCard({
  worker,
  labels,
  locale,
}: {
  worker: WorkerOps;
  labels: OperationsBoardLabels;
  locale: string;
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
    <article
      className="card-border flex flex-col gap-3 p-4"
      data-testid="ops-worker-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tightest text-text-primary">
          {worker.name}
        </h3>
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
      </header>

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
}: {
  ops: ProjectOperations;
  labels: OperationsBoardLabels;
  locale: string;
  csvHref: string;
}) {
  const { project, workers, counters } = ops;
  const location = [project.city, project.country].filter(Boolean).join(", ");

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
            testid="ops-review"
            value={counters.openReviewItems}
            label={labels.openReviewItems}
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

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.workersTitle}
        </h2>
        {workers.length === 0 ? (
          <p
            className="card-border p-4 text-sm text-text-secondary"
            data-testid="ops-no-workers"
          >
            {labels.noWorkers}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {workers.map((w) => (
              <WorkerCard key={w.workerId} worker={w} labels={labels} locale={locale} />
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
          <li>{labels.documentsNote}</li>
          <li>{labels.candidateSkillNote}</li>
        </ul>
      </section>
    </div>
  );
}
