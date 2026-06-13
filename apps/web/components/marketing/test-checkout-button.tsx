"use client";

import { useState, useTransition } from "react";

/**
 * Test checkout button (Stripe sprint PR3). Rendered ONLY inside the test-mode
 * block (server-gated). POSTs to the strict test-checkout route and redirects to
 * the Stripe TEST session. Honest errors; never claims a real payment.
 */
export function TestCheckoutButton({
  planKey,
  labels,
}: {
  planKey: string;
  labels: { start: string; starting: string; error: string };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/test-checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planKey }),
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
        onClick={start}
        disabled={pending}
        className="rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
        data-testid={`test-checkout-${planKey}`}
      >
        {pending ? labels.starting : labels.start}
      </button>
      {error ? (
        <span className="font-mono text-[10px] text-state-warning">
          {labels.error}: {error}
        </span>
      ) : null}
    </div>
  );
}
