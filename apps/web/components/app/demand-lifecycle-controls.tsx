"use client";

import { useState, useTransition } from "react";
import {
  confirmRecognizedNeedAction,
  closeDemandAction,
  reopenDemandAction,
} from "@/lib/demand/demand-lifecycle-actions";
import { demandAdapter } from "@/lib/market-lifecycle/adapters";
import { allowedActions } from "@/lib/market-lifecycle/contract";

/**
 * Company demand lifecycle controls (PR10):
 *  - CONFIRM the offline-recognized requirement set (the §19 human act that
 *    makes the need human-structured);
 *  - CLOSE / REOPEN the demand (worker board serves submitted only, so
 *    closing hides it from workers instantly — honest visibility, no delete).
 * Internal state only; nothing is sent outside the platform.
 */
export function DemandLifecycleControls({
  locale,
  requestId,
  status,
  closedOutcome = null,
  showConfirm,
  labels,
}: {
  locale: string;
  requestId: string;
  status: string;
  /** Why a closed need is closed — a discarded draft never reopens. */
  closedOutcome?: string | null;
  showConfirm: boolean;
  labels: {
    confirm: string;
    confirmed: string;
    close: string;
    reopen: string;
    closedNote: string;
    error: string;
    /** Owner launch pricing 2026-09-05: reopening past the plan ceiling. */
    limitUpgrade: string;
    limitIndividual: string;
  };
}) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [confirmed, setConfirmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState<"upgrade" | "individual_plan" | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ kind: string; status?: string; next?: "upgrade" | "individual_plan" }>) =>
    startTransition(async () => {
      setFailed(false);
      setLimit(null);
      const r = await fn();
      if (r.kind === "over-limit") {
        // The plan ceiling, said honestly: nothing reopened, nothing charged.
        setLimit(r.next ?? "upgrade");
        return;
      }
      if (r.kind !== "ok") {
        setFailed(true);
        return;
      }
      if (r.status) setCurrentStatus(r.status);
    });

  // The ONE lifecycle contract decides what this need offers — the same
  // rules as the own-needs list, the MCP tools and the server check.
  const demand = demandAdapter({ closedOutcomeStored: false });
  const allowed = allowedActions(
    demand.support,
    demand.facts({
      status: currentStatus,
      closedOutcome: currentStatus === "closed" ? closedOutcome : null,
    }),
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="demand-lifecycle-controls"
      data-demand-status={currentStatus}
    >
      {showConfirm && !confirmed ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setFailed(false);
              const r = await confirmRecognizedNeedAction(locale, requestId);
              if (r.kind === "ok") setConfirmed(true);
              else if (r.kind !== "nothing-to-confirm") setFailed(true);
            })
          }
          className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-text-on-brand hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="demand-confirm-need"
        >
          {labels.confirm}
        </button>
      ) : null}
      {showConfirm && confirmed ? (
        <span
          className="rounded-md border border-state-success/40 bg-state-success/10 px-3 py-1.5 text-xs font-semibold text-state-success"
          data-testid="demand-need-confirmed"
        >
          ✓ {labels.confirmed}
        </span>
      ) : null}
      {allowed.includes("complete") ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => closeDemandAction(locale, requestId))}
          className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-state-warning hover:text-text-primary disabled:opacity-50"
          data-testid="demand-close"
        >
          {labels.close}
        </button>
      ) : null}
      {currentStatus === "closed" ? (
        <>
          <span className="text-meta text-text-muted">{labels.closedNote}</span>
          {allowed.includes("resume") ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => reopenDemandAction(locale, requestId))}
              className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-primary hover:border-brand-blue disabled:opacity-50"
              data-testid="demand-reopen"
            >
              {labels.reopen}
            </button>
          ) : null}
        </>
      ) : null}
      {failed ? (
        <span className="text-meta text-state-warning">{labels.error}</span>
      ) : null}
      {limit ? (
        <span
          className="text-meta text-state-warning"
          data-testid="demand-reopen-limit"
          data-next={limit}
        >
          {limit === "individual_plan"
            ? labels.limitIndividual
            : labels.limitUpgrade}
        </span>
      ) : null}
    </div>
  );
}
