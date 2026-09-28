"use client";

import { useActionState } from "react";

import {
  confirmDraftedNeedAction,
  type BridgeActionState,
} from "@/lib/agency/bridge-actions";
import type { DraftedNeedRow } from "@/lib/agency/delegation-read";
import { DisplayedWorkspaceField } from "@/components/app/workspace/displayed-workspace-field";
import { Card } from "@/components/ui/Card";

export interface ClientDraftedNeedsLabels {
  readonly title: string;
  readonly intro: string;
  readonly draftedBy: string;
  readonly confirm: string;
  readonly confirmed: string;
  readonly failed: string;
}

const IDLE: BridgeActionState = { status: "idle" };

/**
 * The CLIENT decides (owner decision 2026-09-28 A): a need its agency drafted
 * stays a draft until a governing member confirms it here — then it is the
 * client's own requirement, shared on the same connection.
 */
export function ClientDraftedNeedsPanel({
  drafts,
  agencyByConnection,
  labels,
}: {
  drafts: readonly DraftedNeedRow[];
  agencyByConnection: Readonly<Record<string, string>>;
  labels: ClientDraftedNeedsLabels;
}) {
  if (drafts.length === 0) return null;
  return (
    <Card>
      <section
        className="flex flex-col gap-3"
        data-testid="client-drafted-needs"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {labels.title}
          </h2>
          <p className="text-sm text-text-secondary">{labels.intro}</p>
        </header>
        <ul className="flex flex-col gap-2">
          {drafts.map((d) => (
            <DraftRow
              key={d.requestId}
              draft={d}
              agency={agencyByConnection[d.connectionId] ?? "—"}
              labels={labels}
            />
          ))}
        </ul>
      </section>
    </Card>
  );
}

function DraftRow({
  draft,
  agency,
  labels,
}: {
  draft: DraftedNeedRow;
  agency: string;
  labels: ClientDraftedNeedsLabels;
}) {
  const [state, action, pending] = useActionState(
    confirmDraftedNeedAction,
    IDLE,
  );
  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-md border border-ink-600 px-3 py-2"
      data-testid={`client-draft-${draft.requestId}`}
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-text-primary">
          {draft.title}
        </span>
        <span className="text-meta text-text-muted">
          {labels.draftedBy.replace("{agency}", agency)}
          {draft.roleText ? ` · ${draft.roleText}` : ""}
        </span>
      </div>
      {state.status === "ok" ? (
        <span
          className="ml-auto text-meta text-state-success"
          role="status"
          data-testid={`client-draft-confirmed-${draft.requestId}`}
        >
          {labels.confirmed}
        </span>
      ) : (
        <form action={action} className="ml-auto flex items-center gap-2">
          <DisplayedWorkspaceField />
          <input type="hidden" name="requestId" value={draft.requestId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand-blue px-3 py-2 text-sm font-semibold text-text-primary disabled:opacity-50"
            data-testid={`client-draft-confirm-${draft.requestId}`}
          >
            {labels.confirm}
          </button>
          {state.status !== "idle" ? (
            <span className="text-meta text-state-warning" role="status">
              {labels.failed}
            </span>
          ) : null}
        </form>
      )}
    </li>
  );
}
