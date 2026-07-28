"use client";

import { useState, useTransition } from "react";

/**
 * Billing portal button (commercial readiness audit v1). Opens the provider's
 * customer portal so a subscriber can cancel, update the card, or download
 * invoices WITHOUT contacting support. Rendered only when the server has
 * resolved a real billing customer for the signed-in user.
 *
 * Honest failure: the portal reason is shown, never a fake success and never a
 * dead button.
 */
/** Provider round-trip budget for opening the portal. */
const PORTAL_TIMEOUT_MS = 15_000;

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
          // Bounded: a hanging request must not leave the button spinning
          // forever on a mobile connection.
          signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
        });
        const data = (await res.json()) as {
          ok: boolean;
          url?: string;
          reason?: string;
        };
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
        className="w-fit rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
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
