"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Refresh billing status - a calm, optional control shown only while the
 * account page is waiting on the payment provider. It sends NOTHING: the server
 * resolves the workspace and subscription from the session. It receives one of
 * four words back and then re-reads the page (router.refresh) so the section
 * shows whatever the subscription row now says - the button itself activates
 * nothing. Labels arrive as props (server-translated).
 */

const TIMEOUT_MS = 20_000;

type Status = "updated" | "already_current" | "not_found" | "try_later";

export function RefreshBillingStatusButton({
  labels,
}: {
  labels: {
    cta: string;
    working: string;
    updated: string;
    alreadyCurrent: string;
    notFound: string;
    tryLater: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status | null>(null);

  function refresh() {
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/refresh", {
          method: "POST",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const data = (await res.json()) as { ok?: boolean; status?: string };
        const next: Status =
          data.ok === true &&
          (data.status === "updated" || data.status === "already_current" || data.status === "not_found")
            ? data.status
            : "try_later";
        setStatus(next);
        if (next === "updated" || next === "already_current") router.refresh();
      } catch {
        setStatus("try_later");
      }
    });
  }

  const message =
    status === "updated"
      ? labels.updated
      : status === "already_current"
        ? labels.alreadyCurrent
        : status === "not_found"
          ? labels.notFound
          : status === "try_later"
            ? labels.tryLater
            : null;

  return (
    <div className="flex flex-col gap-1" data-testid="billing-refresh">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="min-h-11 w-fit rounded-md border border-brand-blue/50 px-4 py-2 text-sm font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
        data-testid="billing-refresh-button"
      >
        {pending ? labels.working : labels.cta}
      </button>
      <p className="min-h-5 text-meta text-text-muted" role="status" aria-live="polite" data-testid="billing-refresh-status">
        {message}
      </p>
    </div>
  );
}
