"use client";

import { useState, useTransition } from "react";

/**
 * Customer Portal button (Stripe TEST subscriptions v1). Rendered ONLY inside
 * the server-gated test-mode block. POSTs to the portal route — which opens
 * the CALLER's own stored TEST customer only (no id is sent or accepted) —
 * and redirects to the Stripe TEST portal session. Honest errors.
 */
export function BillingPortalButton({
  labels,
}: {
  labels: { open: string; opening: string; error: string };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/portal", {
          method: "POST",
          // Bounded so a dead network clears the pending state into a
          // visible, retryable error (mobile-hang guard).
          signal: AbortSignal.timeout(20_000),
        });
        const data = (await res.json()) as { ok: boolean; url?: string; reason?: string };
        if (data.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        setError(data.reason ?? "error");
      } catch {
        setError("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
        data-testid="billing-portal-open"
      >
        {pending ? labels.opening : labels.open}
      </button>
      {error ? (
        <span className="font-mono text-[10px] text-state-warning">
          {labels.error}: {error}
        </span>
      ) : null}
    </div>
  );
}
