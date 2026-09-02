"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { adminGrantLmcAction } from "@/lib/admin/lmc-actions";
import { Card } from "@/components/ui/Card";

/**
 * Admin LMC credit form (commercial safe-prep v1; harvested from draft PR
 * #893). Credits internal platform credit to a VERIFIED recipient through the
 * existing ledger RPC.
 *
 * Honest states only: while `lmc_promotional_grants_enabled` is off (it is —
 * flipping it is owner-channel) the ledger refuses the write and the form says
 * exactly that — it never reports a credit that did not happen. The
 * idempotency key is prefilled and editable so a retried grant is provably the
 * same grant. Labels arrive as props (server-translated).
 */
export function AdminLmcGrantForm({
  locale,
  enabled,
  labels,
}: {
  locale: string;
  /** DB state of lmc_promotional_grants_enabled (informational only). */
  enabled: boolean;
  labels: {
    email: string;
    amount: string;
    reason: string;
    campaign: string;
    expiryDays: string;
    key: string;
    submit: string;
    submitting: string;
    granted: string;
    replay: string;
    disabledHint: string;
    reasons: Record<string, string>;
  };
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("50");
  const [reason, setReason] = useState("");
  const [campaign, setCampaign] = useState("pilot-tester");
  const [expiryDays, setExpiryDays] = useState("60");
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<
    { kind: "ok"; replay: boolean } | { kind: "error"; reason: string } | null
  >(null);

  function submit() {
    setOutcome(null);
    startTransition(async () => {
      const res = await adminGrantLmcAction({
        locale,
        recipientEmail: email.trim(),
        amountLmc: Number(amount),
        reason: reason.trim(),
        campaign: campaign.trim(),
        expiryDays: Number(expiryDays),
        idempotencyKey:
          key.trim() || `lmc-grant:${campaign.trim()}:${email.trim()}`,
      });
      if (res.ok) {
        setOutcome({ kind: "ok", replay: res.replay });
        router.refresh();
      } else {
        setOutcome({ kind: "error", reason: res.reason });
      }
    });
  }

  const input =
    "rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary";

  return (
    <Card compact>
    <div className="flex flex-col gap-3" data-testid="admin-lmc-grant">
      {!enabled ? (
        <p
          className="rounded-md border border-state-amber/40 bg-state-amber/10 px-2 py-1 text-meta text-state-amber"
          data-testid="admin-lmc-grants-disabled"
        >
          {labels.disabledHint}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-meta text-text-muted">
          {labels.email}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tester@example.com"
            className={`${input} font-mono`}
          />
        </label>
        <label className="flex w-24 flex-col gap-1 text-meta text-text-muted">
          {labels.amount}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className={input}
          />
        </label>
        <label className="flex w-24 flex-col gap-1 text-meta text-text-muted">
          {labels.expiryDays}
          <input
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            inputMode="numeric"
            className={input}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-meta text-text-muted">
          {labels.campaign}
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className={input}
          />
        </label>
        <label className="flex flex-[2] flex-col gap-1 text-meta text-text-muted">
          {labels.reason}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={input}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-meta text-text-muted">
        {labels.key}
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={`lmc-grant:${campaign}:${email || "tester@example.com"}`}
          className={`${input} font-mono`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !email.trim() || !reason.trim()}
          className="rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
          data-testid="admin-lmc-grant-submit"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
        {outcome?.kind === "ok" ? (
          <span className="font-mono text-meta text-state-success">
            {outcome.replay ? labels.replay : labels.granted}
          </span>
        ) : null}
        {outcome?.kind === "error" ? (
          <span className="font-mono text-meta text-state-warning">
            {labels.reasons[outcome.reason] ?? outcome.reason}
          </span>
        ) : null}
      </div>
    </div>
    </Card>
  );
}
