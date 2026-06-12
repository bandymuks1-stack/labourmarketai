"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setShortlistAction } from "@/lib/scouting/scouting-actions";
import type { ShortlistStatus } from "@/lib/scouting/scouting";

/**
 * Shortlist controls for one scouted worker. Calls the owner-scoped server
 * action; reflects the saved status. No fake state — the button shows what the
 * server accepted (or surfaces a precise error).
 */
export function ScoutingShortlistButtons({
  locale,
  requestId,
  workerId,
  current,
  labels,
}: {
  locale: string;
  requestId: string;
  workerId: string;
  current: ShortlistStatus | null;
  labels: {
    readonly statuses: Record<ShortlistStatus, string>;
    readonly error: string;
  };
}) {
  const [status, setStatus] = useState<ShortlistStatus | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const order: ShortlistStatus[] = ["saved", "interested", "reviewed", "not_fit"];

  function choose(next: ShortlistStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setShortlistAction(locale, requestId, workerId, next);
      if (res.kind === "ok") setStatus(res.status);
      else setError(labels.error);
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid={`scout-shortlist-${workerId}`}>
      <div className="flex flex-wrap gap-1.5">
        {order.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => choose(s)}
              aria-pressed={active}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                active
                  ? "border-brand-blue bg-brand-blue/15 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary",
              )}
            >
              {labels.statuses[s]}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-[11px] text-state-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
