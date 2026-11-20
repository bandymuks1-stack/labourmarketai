"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import {
  grantOrganizationVipAction,
  revokeOrganizationVipAction,
  type AdminVipResult,
} from "@/lib/admin/billing-actions";

type Failure = Extract<AdminVipResult, { ok: false }>["reason"];

/**
 * Owner-granted ORGANIZATION VIP (#2474, matrix 7.27). Grants or revokes free
 * access for ONE organization through the audited admin RPCs. Unlike the
 * test-mode pilot override, the grant is keyed by the organization and carries
 * no Stripe mode, so the organization's live workspace resolves it. Every
 * failure is named; before the migration is applied the form says so and
 * writes nothing.
 */
export function AdminOrganizationVipForm({
  locale,
  labels,
}: {
  locale: string;
  labels: {
    organizationId: string;
    profileViews: string;
    profileViewsHint: string;
    note: string;
    grant: string;
    revoke: string;
    saving: string;
    done: string;
    errors: Record<Failure, string>;
  };
}) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  const [profileViews, setProfileViews] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "done" } | { kind: "error"; reason: Failure }
  >({
    kind: "idle",
  });

  function run(kind: "grant" | "revoke") {
    if (!organizationId.trim()) return;
    const views =
      profileViews.trim() === "" ? null : Number(profileViews.trim());
    if (views !== null && !Number.isInteger(views)) {
      setState({ kind: "error", reason: "invalid_input" });
      return;
    }
    setState({ kind: "idle" });
    startTransition(async () => {
      const res =
        kind === "grant"
          ? await grantOrganizationVipAction({
              locale,
              organizationId: organizationId.trim(),
              profileViews: views,
              note: note.trim() || null,
            })
          : await revokeOrganizationVipAction({
              locale,
              organizationId: organizationId.trim(),
            });
      if (res.ok) {
        setState({ kind: "done" });
        router.refresh();
      } else {
        setState({ kind: "error", reason: res.reason });
      }
    });
  }

  return (
    <div data-testid="admin-organization-vip">
      <Card compact className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-1 flex-col gap-1 text-meta text-text-muted">
            {labels.organizationId}
            <input
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              placeholder="organization uuid"
              className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-xs text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {labels.profileViews}
            <input
              value={profileViews}
              onChange={(e) => setProfileViews(e.target.value)}
              inputMode="numeric"
              aria-describedby="admin-vip-views-hint"
              className="w-32 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-xs text-text-primary"
            />
            <span
              id="admin-vip-views-hint"
              className="text-meta text-text-muted"
            >
              {labels.profileViewsHint}
            </span>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-meta text-text-muted">
          {labels.note}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run("grant")}
            className="rounded-md border border-state-success/50 px-3 py-1 text-xs text-state-success hover:bg-state-success/10 disabled:opacity-50"
          >
            {pending ? labels.saving : labels.grant}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("revoke")}
            className="rounded-md border border-ink-500 px-3 py-1 text-xs text-text-secondary hover:bg-ink-700 disabled:opacity-50"
          >
            {labels.revoke}
          </button>
          <span role="status" aria-live="polite" className="text-meta">
            {state.kind === "done" ? (
              <span className="text-state-success">{labels.done}</span>
            ) : state.kind === "error" ? (
              <span className="text-state-danger">
                {labels.errors[state.reason]}
              </span>
            ) : null}
          </span>
        </div>
      </Card>
    </div>
  );
}
