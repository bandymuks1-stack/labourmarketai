"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  grantPilotAccessAction,
  revokePilotAccessAction,
} from "@/lib/admin/billing-actions";

/**
 * Admin manual pilot-access grant/revoke (Stripe sprint PR6). Test-mode only —
 * grants an entitlement override without a Stripe subscription. Never enables
 * live payments. Honest states.
 */
export function AdminPilotGrantForm({
  locale,
  paidPlanKeys,
  labels,
}: {
  locale: string;
  paidPlanKeys: string[];
  labels: {
    ownerId: string;
    plan: string;
    grant: string;
    revoke: string;
    granting: string;
    done: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState("");
  const [planKey, setPlanKey] = useState(paidPlanKeys[0] ?? "");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  function run(kind: "grant" | "revoke") {
    if (!ownerId.trim()) return;
    setState("idle");
    startTransition(async () => {
      const fn = kind === "grant" ? grantPilotAccessAction : revokePilotAccessAction;
      const res = await fn({ locale, ownerId: ownerId.trim(), planKey });
      if (res.ok) {
        setState("done");
        router.refresh();
      } else {
        setState("error");
      }
    });
  }

  return (
    <div className="card-border flex flex-col gap-3 p-4" data-testid="admin-pilot-grant">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-meta text-text-muted">
          {labels.ownerId}
          <input
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            placeholder="profile uuid"
            className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-xs text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {labels.plan}
          <select
            value={planKey}
            onChange={(e) => setPlanKey(e.target.value)}
            className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary"
          >
            {paidPlanKeys.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("grant")}
          className="rounded-md border border-state-success/50 px-3 py-1 text-xs text-state-success hover:bg-state-success/10 disabled:opacity-50"
        >
          {pending ? labels.granting : labels.grant}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("revoke")}
          className="rounded-md border border-ink-500 px-3 py-1 text-xs text-text-secondary hover:bg-ink-700 disabled:opacity-50"
        >
          {labels.revoke}
        </button>
        {state === "done" ? (
          <span className="text-meta text-state-success">{labels.done}</span>
        ) : state === "error" ? (
          <span className="text-meta text-state-danger">{labels.error}</span>
        ) : null}
      </div>
    </div>
  );
}
