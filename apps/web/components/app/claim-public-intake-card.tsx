"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimPublicIntakeAction } from "@/lib/company/claim-public-intake-actions";
import type { ClaimableIntake } from "@/lib/company/claim-public-intake";

/**
 * Canonical-journey P3 — "we found your earlier public submission" card.
 *
 * Rendered on the company workspace ONLY when the signed-in user's own
 * authenticated email matches an unclaimed public /company-need intake (the
 * server component passes the already-verified rows). One clear action per
 * intake: continue it as the account's draft demand — the data the company
 * already typed once is never re-typed. Honest states only; a failure shows
 * a short retryable error, never a fake success.
 */
export function ClaimPublicIntakeCard({
  locale,
  intakes,
  labels,
}: {
  locale: string;
  intakes: ClaimableIntake[];
  labels: {
    title: string;
    body: string;
    claimCta: string;
    claimed: string;
    error: string;
    workersLabel: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [failedId, setFailedId] = useState<string | null>(null);

  if (intakes.length === 0) return null;

  const onClaim = (id: string) =>
    startTransition(async () => {
      setFailedId(null);
      const r = await claimPublicIntakeAction(locale, id);
      if (r.ok) {
        setDone((prev) => new Set(prev).add(id));
        router.refresh();
      } else {
        setFailedId(id);
      }
    });

  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      data-testid="claim-public-intake-card"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.body}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {intakes.map((intake) => (
          <li
            key={intake.id}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid={`claimable-intake-${intake.id}`}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-text-primary">
                {intake.companyName || "—"}
                {intake.country ? ` · ${intake.country}` : ""}
                {intake.headcount != null
                  ? ` · ${labels.workersLabel}: ${intake.headcount}`
                  : ""}
              </span>
              {intake.descriptionExcerpt ? (
                <span className="line-clamp-2 text-xs text-text-secondary">
                  {intake.descriptionExcerpt}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {done.has(intake.id) ? (
                <span
                  className="rounded-md border border-state-success/40 bg-state-success/10 px-3 py-1.5 text-xs font-semibold text-state-success"
                  data-testid="intake-claimed"
                >
                  ✓ {labels.claimed}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onClaim(intake.id)}
                  disabled={pending}
                  className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
                  data-testid={`intake-claim-${intake.id}`}
                >
                  {labels.claimCta}
                </button>
              )}
              {failedId === intake.id ? (
                <span role="alert" className="text-[11px] text-state-warning">
                  {labels.error}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
