"use client";

import { useState, useTransition } from "react";

/**
 * Test checkout button (Stripe sprint PR3; extended by Stripe TEST
 * subscriptions v1). Rendered ONLY inside the test-mode block (server-gated).
 * POSTs to the strict test-checkout route and redirects to the Stripe TEST
 * session. Company/agency plans may pass an explicit organization id — the
 * server verifies membership and NEVER trusts any client-side plan/price data.
 * Honest errors; never claims a real payment.
 */
export function TestCheckoutButton({
  planKey,
  requiresOrg = false,
  labels,
}: {
  planKey: string;
  requiresOrg?: boolean;
  labels: {
    start: string;
    starting: string;
    error: string;
    orgPlaceholder?: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState("");

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const body: { planKey: string; organizationId?: string } = { planKey };
        const trimmed = orgId.trim();
        if (requiresOrg && trimmed.length > 0) body.organizationId = trimmed;
        const res = await fetch("/api/billing/test-checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
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
      {requiresOrg ? (
        <input
          type="text"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          placeholder={labels.orgPlaceholder ?? "organization id (optional)"}
          className="w-56 rounded-md border border-ink-500 bg-transparent px-2 py-1 font-mono text-[11px] text-text-primary placeholder:text-text-muted"
          data-testid={`test-checkout-org-${planKey}`}
        />
      ) : null}
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
