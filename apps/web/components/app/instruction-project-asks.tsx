import { Link } from "@/lib/i18n/navigation";
import type { WorkerProjectAsk } from "@/lib/projects/worker-project-asks";

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
 */
export interface InstructionProjectAsksLabels {
  readonly title: string;
  readonly ownReady: string;
  readonly ownExpiring: string;
  readonly ownNone: string;
  readonly blocked: string;
  readonly record: string;
}

export function InstructionProjectAsks({
  asks,
  labels,
}: {
  asks: readonly WorkerProjectAsk[];
  labels: InstructionProjectAsksLabels;
}) {
  if (asks.length === 0) return null;
  const recordable = asks.some((a) => a.own === "none");
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-brand-blue/30 bg-brand-blue/5 p-3"
      data-testid="instruction-project-asks"
    >
      <span className="font-mono text-meta uppercase tracking-label text-brand-blue">{labels.title}</span>
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
      {recordable ? (
        <Link
          href="/dashboard/documents"
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
          data-testid="instruction-project-asks-record"
        >
          {labels.record}
        </Link>
      ) : null}
    </div>
  );
}
