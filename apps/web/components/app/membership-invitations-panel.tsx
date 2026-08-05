"use client";

import { useActionState } from "react";

import { Card } from "@/components/ui/Card";
import {
  acceptMembershipAction,
  declineMembershipAction,
  type MembershipActionState,
} from "@/lib/company/membership-actions";
import type {
  MembershipRole,
  MyMembershipInvitation,
} from "@/lib/company/memberships";

/**
 * M-P0-4 Slice 2 — the INVITEE side: governance invitations addressed to me.
 *
 * Accepting activates exactly the invited role and makes the organization
 * appear in the workspace switcher (consumer migration §13); declining
 * writes revoked history. Both are the person's OWN actions — no workspace
 * required, the commands only act on rows addressed to the caller.
 */

export type InvitationsPanelLabels = {
  readonly heading: string;
  readonly explainer: string;
  readonly roleLabels: Record<MembershipRole, string>;
  readonly accept: string;
  readonly decline: string;
  readonly outcomes: Record<string, string>;
};

export function MembershipInvitationsPanel({
  invitations,
  labels,
}: {
  invitations: readonly MyMembershipInvitation[];
  labels: InvitationsPanelLabels;
}) {
  const [state, action, pending] = useActionState<MembershipActionState | null, FormData>(
    async (prev, formData) => {
      const intent = String(formData.get("intent") ?? "");
      if (intent === "accept") return acceptMembershipAction(prev, formData);
      if (intent === "decline") return declineMembershipAction(prev, formData);
      return { ok: false, code: "invalid" };
    },
    null,
  );

  if (invitations.length === 0 && !state) return null;

  const message = state
    ? (labels.outcomes[state.ok ? state.outcome : state.code] ??
      labels.outcomes.error ??
      null)
    : null;

  return (
    <Card compact>
      <div
        className="flex flex-col gap-3"
        data-testid="membership-invitations-panel"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {labels.heading}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">
            {labels.explainer}
          </p>
        </header>
        <ul className="flex flex-col gap-2">
          {invitations.map((inv) => (
            <li
              key={inv.membershipId}
              className="flex flex-wrap items-center gap-2 text-sm"
              data-testid={`membership-invitation-${inv.membershipId}`}
            >
              <span className="text-text-primary">{inv.organizationName || "—"}</span>
              <span className="rounded-sm border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                {labels.roleLabels[inv.role]}
              </span>
              <form action={action}>
                <input type="hidden" name="intent" value="accept" />
                <input type="hidden" name="membershipId" value={inv.membershipId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-brand-blue px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  data-testid={`membership-accept-${inv.membershipId}`}
                >
                  {labels.accept}
                </button>
              </form>
              <form action={action}>
                <input type="hidden" name="intent" value="decline" />
                <input type="hidden" name="membershipId" value={inv.membershipId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="text-xs text-text-secondary underline-offset-2 hover:underline disabled:opacity-50"
                  data-testid={`membership-decline-${inv.membershipId}`}
                >
                  {labels.decline}
                </button>
              </form>
            </li>
          ))}
        </ul>
        {message && (
          <p
            className="text-xs text-text-secondary"
            role="status"
            data-testid="membership-invitations-result"
          >
            {message}
          </p>
        )}
      </div>
    </Card>
  );
}
