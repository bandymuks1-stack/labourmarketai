"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import {
  decideHistoryClaimAction,
  type HistoryClaimDecisionResult,
  type HistoryClaimRow,
} from "@/lib/organization-evidence/history-claim-actions";

/**
 * WHO CAME FOR A HISTORY LINK. One card per live claim: the roster name it
 * was made for, and — once somebody has opened the link — who that was, by
 * name and address, so the organization answers a person it recognises.
 *
 * Approving does NOT link anything: it offers the row to that person, who
 * still accepts or refuses on their own profile. Rejecting changes nothing on
 * the roster row.
 */
export function HistoryClaimInbox({
  rows,
  unavailable,
  labels,
}: {
  rows: readonly HistoryClaimRow[];
  unavailable: boolean;
  labels: {
    readonly title: string;
    readonly intro: string;
    readonly none: string;
    readonly unavailable: string;
    readonly waiting: string;
    readonly open: string;
    readonly openHint: string;
    readonly came: string;
    readonly approve: string;
    readonly reject: string;
    readonly revoke: string;
    readonly noteLabel: string;
    readonly notePlaceholder: string;
    readonly approved: string;
    readonly rejected: string;
    readonly revoked: string;
    readonly expires: string;
    readonly errors: Readonly<Record<string, string>>;
  };
}) {
  const [state, submit, pending] = useActionState<HistoryClaimDecisionResult | null, FormData>(
    decideHistoryClaimAction,
    null,
  );

  if (unavailable) {
    return (
      <section className="flex flex-col gap-2" data-testid="history-claim-inbox">
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.title}</h3>
        <Notice tone="error" testId="history-claim-inbox-unavailable">
          {labels.unavailable}
        </Notice>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2" data-testid="history-claim-inbox">
      <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.title}</h3>
      <p className="text-meta leading-relaxed text-text-muted">{labels.intro}</p>
      <div role="status" aria-live="polite" className="contents">
      {state?.ok ? (
        <Notice tone="success" testId="history-claim-decided">
          {state.outcome === "approved"
            ? labels.approved
            : state.outcome === "rejected"
              ? labels.rejected
              : labels.revoked}
        </Notice>
      ) : null}
      {state && !state.ok ? (
        <Notice tone="warning" testId="history-claim-decide-error">
          {labels.errors[state.code] ?? labels.errors.error}
        </Notice>
      ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="history-claim-inbox-empty">
          {labels.none}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.claimId}>
              <Card compact className="flex flex-col gap-2" data-testid={`history-claim-row-${row.claimId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold text-text-primary">{row.rosterName}</p>
                  <Badge tone={row.status === "redeemed" ? "informative" : "neutral"}>
                    {row.status === "redeemed" ? labels.waiting : labels.open}
                  </Badge>
                </div>
                {row.status === "redeemed" ? (
                  <p className="text-sm text-text-secondary" data-testid={`history-claim-redeemer-${row.claimId}`}>
                    {labels.came
                      .replace("{name}", row.redeemerName ?? "—")
                      .replace("{email}", row.redeemerEmail ?? "—")}
                  </p>
                ) : (
                  <p className="text-meta leading-relaxed text-text-muted">
                    {labels.openHint}{" "}
                    {labels.expires.replace("{date}", row.expiresAt.slice(0, 10))}
                  </p>
                )}
                <form action={submit} className="flex flex-col gap-2">
                  <input type="hidden" name="claim_id" value={row.claimId} />
                  {row.status === "redeemed" ? (
                    <>
                      <label className="flex min-w-0 flex-col gap-1">
                        <span className="font-mono text-xs uppercase tracking-label text-text-muted">
                          {labels.noteLabel}
                        </span>
                        <Input
                          name="note"
                          maxLength={500}
                          placeholder={labels.notePlaceholder}
                          className="min-w-0 sm:w-auto sm:min-w-80"
                          data-testid={`history-claim-note-${row.claimId}`}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="submit"
                          name="decision"
                          value="approve"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          aria-busy={pending}
                          data-testid={`history-claim-approve-${row.claimId}`}
                        >
                          {labels.approve}
                        </Button>
                        <Button
                          type="submit"
                          name="decision"
                          value="reject"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          data-testid={`history-claim-reject-${row.claimId}`}
                        >
                          {labels.reject}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <Button
                        type="submit"
                        name="decision"
                        value="revoke"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        data-testid={`history-claim-revoke-${row.claimId}`}
                      >
                        {labels.revoke}
                      </Button>
                    </div>
                  )}
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
