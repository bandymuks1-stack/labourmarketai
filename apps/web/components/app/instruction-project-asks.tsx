import { Link } from "@/lib/i18n/navigation";
import type { WorkerProjectAsk } from "@/lib/projects/worker-project-asks";
import type {
  RequirementLedger,
  RequirementLedgerRow,
  RequirementResolution,
} from "@/lib/player-card/requirement-ledger";
import { WORKER_LANGUAGE_NATIVE_NAMES, type WorkerLanguageCode } from "@/lib/worker/worker-languages-model";

/**
 * WHAT THE PROJECT STILL NEEDS FROM ME — the VISUAL side of the gap-resolution
 * journey (owner contract §11 / §12 / §16; chat-first, not chat-only). Renders
 * the SAME derived rows the chat's "mano projektai" answer names
 * (`loadOwnProjectAsks`): the manager's open checklist rows for this person,
 * verbatim labels, with the person's own document state next to each document
 * row. The resolution path is the ONE existing surface that records a
 * document — the documents centre (its form is the single write path into
 * `worker_documents`); nothing here writes. A manager never reaches this
 * component: it renders only under the person's own instruction.
 *
 * P3 (frozen design contract §5): when the contextual REQUIREMENT LEDGER for
 * the project is available it is rendered instead of the bare asks — every row
 * carries what is required · why · the person's current state (words + a
 * mark, never colour alone) · where that state comes from · and, for every
 * row that is not satisfied, the resolution(s) that exist (a course, a
 * service, the issuing authority, the add-document action) or the honest
 * "no solution recorded yet" with the existing ask path. The asks stay the
 * fallback when the ledger read did not answer.
 */
export interface InstructionProjectAsksLabels {
  readonly title: string;
  readonly ownReady: string;
  readonly ownExpiring: string;
  readonly ownNone: string;
  readonly blocked: string;
  readonly record: string;
}

/** Copy resolved by the page (server side) — the component holds no strings. */
export interface InstructionLedgerLabels {
  readonly ratio: (have: number, total: number) => string;
  readonly state: Record<RequirementLedgerRow["state"], string>;
  readonly why: (row: RequirementLedgerRow, country: string | null) => string;
  readonly stateFrom: (row: RequirementLedgerRow) => string;
  readonly level: Partial<Record<RequirementLedgerRow["level"], string>>;
  readonly availability: string;
  readonly documentType: (slug: string) => string;
  readonly skill: (slug: string) => string;
  readonly resolution: (r: RequirementResolution) => string;
  readonly resolutionWhy: (r: RequirementResolution) => string | null;
  readonly rejected: (count: number) => string;
}

/** State is never colour alone: a mark + the word, and a data attribute. */
const STATE_MARK: Record<RequirementLedgerRow["state"], string> = {
  valid: "✓",
  expiring: "!",
  missing: "–",
  unknown: "?",
};

const STATE_CLASS: Record<RequirementLedgerRow["state"], string> = {
  valid: "text-state-success",
  expiring: "text-state-amber",
  missing: "text-state-danger",
  unknown: "text-text-muted",
};

/** ≥ 44 px target, keyboard-operable (a real link), visible focus ring. */
const ACTION_LINK =
  "inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 px-3 py-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

function subjectLabel(row: RequirementLedgerRow, labels: InstructionLedgerLabels): string {
  const s = row.subject;
  switch (s.kind) {
    case "text":
      return s.text;
    case "document_type":
      return labels.documentType(s.slug);
    case "skill":
      return labels.skill(s.slug);
    case "language": {
      const name = WORKER_LANGUAGE_NATIVE_NAMES[s.code as WorkerLanguageCode] ?? s.code.toUpperCase();
      return s.level ? `${name} ${s.level}` : name;
    }
    case "availability":
      return labels.availability;
  }
}

function resolutionHref(r: RequirementResolution): string | null {
  switch (r.kind) {
    case "add_document":
    case "add_evidence":
    case "set_availability":
    case "ask":
      return r.href;
    case "issuing_authority":
      return r.url;
    default:
      return null;
  }
}

function LedgerRows({ ledger, labels }: { ledger: RequirementLedger; labels: InstructionLedgerLabels }) {
  return (
    <>
      <p
        className="text-xs text-text-secondary"
        data-testid="instruction-ledger-ratio"
        data-have={ledger.ratio.have}
        data-total={ledger.ratio.total}
      >
        {labels.ratio(ledger.ratio.have, ledger.ratio.total)}
      </p>
      <ul className="flex flex-col gap-2">
        {ledger.rows.map((row) => {
          const levelWord = labels.level[row.level];
          return (
            <li
              key={row.id}
              className="flex flex-col gap-1 text-sm leading-snug text-text-primary"
              data-testid="instruction-ledger-row"
              data-row-id={row.id}
              data-kind={row.kind}
              data-state={row.state}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-medium">{subjectLabel(row, labels)}</span>
                <span className={`text-xs ${STATE_CLASS[row.state]}`} data-testid="instruction-ledger-state">
                  <span aria-hidden="true">{STATE_MARK[row.state]} </span>
                  {labels.state[row.state]}
                </span>
                {levelWord ? <span className="text-xs text-text-muted">· {levelWord}</span> : null}
                <span className="text-xs text-text-muted">· {labels.why(row, ledger.country)}</span>
              </div>
              <p className="text-xs text-text-muted" data-testid="instruction-ledger-from">
                {labels.stateFrom(row)}
              </p>
              {row.resolutions.length > 0 ? (
                <ul className="flex flex-wrap items-center gap-2" data-testid="instruction-ledger-resolutions">
                  {row.resolutions.map((r, i) => {
                    const href = resolutionHref(r);
                    const text = labels.resolution(r);
                    const why = labels.resolutionWhy(r);
                    return (
                      <li
                        key={`${row.id}:${i}`}
                        className="flex items-center gap-1.5"
                        data-testid="instruction-ledger-resolution"
                        data-resolution={r.kind}
                      >
                        {href && r.kind === "issuing_authority" ? (
                          <a href={href} target="_blank" rel="noreferrer noopener" className={ACTION_LINK}>
                            {text}
                          </a>
                        ) : href ? (
                          <Link href={href as "/dashboard"} className={ACTION_LINK}>
                            {text}
                          </Link>
                        ) : (
                          <span className="inline-flex min-h-11 items-center rounded-md border border-line px-3 py-2 text-xs text-text-primary">
                            {text}
                          </span>
                        )}
                        {why ? <span className="text-xs text-text-muted">({why})</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {row.rejectedCandidates > 0 ? (
                <span className="text-xs text-text-muted" data-testid="instruction-ledger-rejected">
                  {labels.rejected(row.rejectedCandidates)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function InstructionProjectAsks({
  asks,
  labels,
  ledger = null,
  ledgerLabels,
}: {
  asks: readonly WorkerProjectAsk[];
  labels: InstructionProjectAsksLabels;
  /** The project's requirement ledger for this person; null = the read did
   *  not answer, the asks render alone (honest fallback, nothing invented). */
  ledger?: RequirementLedger | null;
  ledgerLabels?: InstructionLedgerLabels;
}) {
  const showLedger = ledger !== null && ledgerLabels !== undefined && ledger.rows.length > 0;
  if (asks.length === 0 && !showLedger) return null;
  const recordable = asks.some((a) => a.own === "none");
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-brand-blue/30 bg-brand-blue/5 p-3"
      data-testid="instruction-project-asks"
      data-ledger={showLedger ? "on" : "off"}
    >
      <span className="font-mono text-meta uppercase tracking-label text-brand-blue">{labels.title}</span>
      {showLedger ? (
        <LedgerRows ledger={ledger} labels={ledgerLabels} />
      ) : (
        <ul className="flex flex-col gap-1">
          {asks.map((a) => {
            const own =
              a.own === "ready" ? labels.ownReady : a.own === "expiring" ? labels.ownExpiring : a.own === "none" ? labels.ownNone : null;
            const blocked = a.status === "rejected" || a.status === "expired";
            return (
              <li
                key={a.itemKey}
                className="text-sm leading-snug text-text-primary"
                data-testid="instruction-project-ask"
                data-own={a.own ?? "n/a"}
                data-status={a.status}
              >
                {a.label}
                {blocked ? <span className="text-text-muted"> {labels.blocked}</span> : null}
                {own ? <span className={a.own === "ready" ? "text-state-success" : "text-state-amber"}> ({own})</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      {recordable ? (
        <Link
          href="/dashboard/documents"
          className={ACTION_LINK}
          data-testid="instruction-project-asks-record"
        >
          {labels.record}
        </Link>
      ) : null}
    </div>
  );
}
