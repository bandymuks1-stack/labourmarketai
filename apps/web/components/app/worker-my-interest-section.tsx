"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { withdrawInterestAction } from "@/lib/opportunities/interest-actions";
import { contactEmployerAction } from "@/lib/opportunities/contact-employer";
import type { MyInterestNextAction } from "@/lib/opportunities/my-interest-view";

/**
 * "Mano susidomėjimai" (Canonical Ideas Integration v1, extension A) — the
 * worker's OWN interest signals as one compact collapsible section on the
 * EXISTING opportunities board. Not a new route, not an application centre:
 * the rows are the same demand_interest_signals the inline card button
 * writes, listed independently of board visibility so a signal on a closed
 * demand never silently disappears (honest "Poreikis nebeaktyvus" label).
 *
 * Actions REUSE the existing server flows only — withdraw
 * (withdrawInterestAction) and contact-the-employer (contactEmployerAction,
 * which re-verifies every fact server-side). No new mutations. The
 * tailored-CV link (extension C) is a plain link to the EXISTING read-time
 * deterministic /cv?need= render. All display text is precomputed
 * server-side (RSC-serializable rows — no functions cross the boundary).
 */

export interface MyInterestDisplayRow {
  readonly requestId: string;
  readonly status: string;
  /** Localized status in human words (Išsiųsta / Peržiūrėta / …). */
  readonly statusText: string;
  readonly stillOpen: boolean;
  /** Localized role title (or the honest "not stated" fallback). */
  readonly title: string;
  /** Pre-built "Company · City · Country · date" scan line. */
  readonly metaLine: string;
  readonly nextAction: MyInterestNextAction;
  /** Ready /{locale}/cv?need=…&template=… href, null when not offered. */
  readonly cvHref: string | null;
}

export function WorkerMyInterestSection({
  locale,
  rows,
  labels,
}: {
  locale: string;
  rows: readonly MyInterestDisplayRow[];
  labels: {
    readonly title: string;
    readonly summary: string; // pre-formatted count line
    readonly intro: string;
    readonly closed: string;
    readonly withdrawnStatusText: string;
    readonly withdraw: string;
    readonly contactEmployer: string;
    readonly openConversation: string;
    readonly viewDemand: string;
    readonly cvLink: string;
    readonly error: string;
    readonly internalNote: string;
  };
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  // Rows withdrawn in THIS session render their new status without a reload.
  const [withdrawnIds, setWithdrawnIds] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();

  if (rows.length === 0) return null;

  const onWithdraw = (requestId: string) =>
    startTransition(async () => {
      setPendingId(requestId);
      setFailedId(null);
      const r = await withdrawInterestAction(locale, requestId);
      if (r.kind === "ok") {
        setWithdrawnIds((prev) => new Set([...prev, requestId]));
      } else {
        setFailedId(requestId);
      }
      setPendingId(null);
    });

  const onContact = (requestId: string) =>
    startTransition(async () => {
      setPendingId(requestId);
      setFailedId(null);
      const r = await contactEmployerAction({ locale, requestId });
      if (r.ok) {
        router.push(`/${locale}/dashboard/communication/${r.conversationId}`);
      } else {
        setFailedId(requestId);
        setPendingId(null);
      }
    });

  return (
    <details
      className="group rounded-lg border border-ink-600 bg-ink-800/30"
      data-testid="opportunities-my-interest"
    >
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-text-primary marker:text-text-muted">
        <span>{labels.title}</span>
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.summary}
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-xs leading-relaxed text-text-secondary">{labels.intro}</p>
        <ul className="flex flex-col gap-2" data-testid="my-interest-list">
          {rows.map((row) => {
            const withdrawnNow = withdrawnIds.has(row.requestId);
            const statusText = withdrawnNow ? labels.withdrawnStatusText : row.statusText;
            const status = withdrawnNow ? "withdrawn" : row.status;
            const nextAction: MyInterestNextAction = withdrawnNow
              ? row.stillOpen
                ? "view_demand"
                : "none"
              : row.nextAction;
            const pending = pendingId === row.requestId;
            return (
              <li
                key={row.requestId}
                className="flex flex-col gap-1.5 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2"
                data-testid={`my-interest-${row.requestId}`}
                data-status={status}
                data-still-open={row.stillOpen ? "true" : "false"}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {row.title}
                  </span>
                  <span className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
                    {statusText}
                  </span>
                </div>
                {row.metaLine !== "" ? (
                  <p className="text-xs text-text-secondary">{row.metaLine}</p>
                ) : null}
                {!row.stillOpen ? (
                  /* Honest closed-demand state — the signal never silently
                     disappears with its demand. */
                  <p
                    className="text-[11px] text-state-amber"
                    data-testid="my-interest-closed"
                  >
                    {labels.closed}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {nextAction === "contact_employer" ? (
                    <button
                      type="button"
                      onClick={() => onContact(row.requestId)}
                      disabled={pending}
                      className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
                      data-testid="my-interest-contact"
                    >
                      {labels.contactEmployer}
                    </button>
                  ) : null}
                  {nextAction === "open_conversation" ? (
                    <Link
                      href={`/${locale}/dashboard/communication`}
                      className="rounded-md border border-brand-blue px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-blue/80"
                      data-testid="my-interest-conversation"
                    >
                      {labels.openConversation} →
                    </Link>
                  ) : null}
                  {nextAction === "withdraw" ? (
                    <button
                      type="button"
                      onClick={() => onWithdraw(row.requestId)}
                      disabled={pending}
                      className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-state-warning hover:text-text-primary disabled:opacity-50"
                      data-testid="my-interest-withdraw"
                    >
                      {labels.withdraw}
                    </button>
                  ) : null}
                  {nextAction === "view_demand" ? (
                    <a
                      href={`#opp-${row.requestId}`}
                      className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
                      data-testid="my-interest-view-demand"
                    >
                      {labels.viewDemand} →
                    </a>
                  ) : null}
                  {/* Tailored-CV link (extension C) — read-time deterministic
                      render on the EXISTING /cv route; offered only while
                      the demand is still open. */}
                  {row.cvHref && status !== "withdrawn" ? (
                    <Link
                      href={row.cvHref}
                      className="text-xs font-medium text-brand-blue hover:text-brand-cyan"
                      data-testid="my-interest-cv-link"
                    >
                      {labels.cvLink} →
                    </Link>
                  ) : null}
                </div>
                {failedId === row.requestId ? (
                  <span role="alert" className="text-[11px] text-state-warning">
                    {labels.error}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {/* Honest scope line — internal signals only, nothing was sent. */}
        <p className="text-[10px] leading-relaxed text-text-muted">
          {labels.internalNote}
        </p>
      </div>
    </details>
  );
}
