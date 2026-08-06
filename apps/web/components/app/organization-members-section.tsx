"use client";

import { useActionState } from "react";

import { Card } from "@/components/ui/Card";
import {
  cancelMembershipInviteAction,
  changeMembershipRoleAction,
  inviteMembershipAction,
  leaveOrganizationAction,
  revokeMembershipAction,
  type MembershipActionState,
} from "@/lib/company/membership-actions";
import type {
  MembershipRole,
  OrganizationMember,
} from "@/lib/company/memberships";

/**
 * M-P0-4 Slice 2 — governance member directory of the ACTIVE workspace.
 *
 * Role-distinct controls (doctrine, actor matrix §14):
 *   owner        → invite any role, change roles, revoke, cancel invites;
 *   admin        → same, minus anything that touches owner rows or grants
 *                  owner (the commands refuse it server-side; the UI simply
 *                  does not render those controls — no fake buttons);
 *   manager / external_manager / member → read-only directory + "leave".
 *
 * Every mutation is a server action bound to the active workspace; the
 * SECURITY DEFINER commands re-derive all authority. No client-side
 * membership writes exist anywhere.
 */

export type MembersSectionLabels = {
  readonly heading: string;
  readonly explainer: string;
  readonly roleLabels: Record<MembershipRole, string>;
  readonly statusInvited: string;
  readonly inviteHeading: string;
  readonly inviteEmail: string;
  readonly inviteRole: string;
  readonly inviteSubmit: string;
  readonly cancelInvite: string;
  readonly revoke: string;
  readonly leave: string;
  readonly outcomes: Record<string, string>;
};

function outcomeText(
  labels: MembersSectionLabels,
  state: MembershipActionState | null,
): string | null {
  if (!state) return null;
  const key = state.ok ? state.outcome : state.code;
  return labels.outcomes[key] ?? labels.outcomes.error ?? null;
}

const ASSIGNABLE: readonly MembershipRole[] = [
  "owner",
  "admin",
  "manager",
  "external_manager",
  "member",
];

export function OrganizationMembersSection({
  members,
  myRole,
  myProfileId,
  labels,
}: {
  members: readonly OrganizationMember[];
  myRole: MembershipRole | null;
  myProfileId: string;
  labels: MembersSectionLabels;
}) {
  const canAdminister = myRole === "owner" || myRole === "admin";
  const inviteRoles =
    myRole === "owner" ? ASSIGNABLE : ASSIGNABLE.filter((r) => r !== "owner");

  const [inviteState, inviteAction, invitePending] = useActionState<
    MembershipActionState | null,
    FormData
  >(inviteMembershipAction, null);
  const [rowState, rowAction, rowPending] = useActionState<
    MembershipActionState | null,
    FormData
  >(
    async (prev, formData) => {
      const intent = String(formData.get("intent") ?? "");
      if (intent === "cancel") return cancelMembershipInviteAction(prev, formData);
      if (intent === "revoke") return revokeMembershipAction(prev, formData);
      if (intent === "role") return changeMembershipRoleAction(prev, formData);
      if (intent === "leave") return leaveOrganizationAction(prev, formData);
      return { ok: false, code: "invalid" };
    },
    null,
  );

  const inviteMessage = outcomeText(labels, inviteState);
  const rowMessage = outcomeText(labels, rowState);

  return (
    <Card compact>
      <div
        className="flex flex-col gap-4"
        data-testid="org-members-section"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {labels.heading}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">
            {labels.explainer}
          </p>
        </header>

        <ul className="flex flex-col gap-2" data-testid="org-members-list">
          {members.map((m) => {
            const isSelf = m.profileId === myProfileId;
            const adminCanTouch =
              myRole === "owner" ||
              (myRole === "admin" && m.role !== "owner" && m.role !== "admin");
            return (
              <li
                key={m.membershipId}
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid={`org-member-row-${m.membershipId}`}
              >
                <span className="text-text-primary">
                  {m.fullName || m.email || m.profileId.slice(0, 8)}
                </span>
                <span
                  className="rounded-sm border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary"
                  data-testid={`org-member-role-${m.membershipId}`}
                >
                  {labels.roleLabels[m.role]}
                </span>
                {m.status === "invited" && (
                  <span
                    className="rounded bg-state-warning/20 px-2 py-0.5 text-xs text-state-warning"
                    data-testid={`org-member-invited-${m.membershipId}`}
                  >
                    {labels.statusInvited}
                  </span>
                )}

                {canAdminister && m.status === "invited" && adminCanTouch && (
                  <form action={rowAction}>
                    <input type="hidden" name="intent" value="cancel" />
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <button
                      type="submit"
                      disabled={rowPending}
                      className="text-xs text-text-secondary underline-offset-2 hover:underline"
                      data-testid={`org-member-cancel-${m.membershipId}`}
                    >
                      {labels.cancelInvite}
                    </button>
                  </form>
                )}

                {canAdminister && m.status === "active" && !isSelf && adminCanTouch && (
                  <>
                    <form action={rowAction} className="flex items-center gap-1">
                      <input type="hidden" name="intent" value="role" />
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <label className="sr-only" htmlFor={`role-${m.membershipId}`}>
                        {labels.inviteRole}
                      </label>
                      <select
                        id={`role-${m.membershipId}`}
                        name="role"
                        defaultValue={m.role}
                        className="rounded-md border border-ink-500 bg-ink-700 px-2 py-1 text-xs text-text-primary"
                        data-testid={`org-member-role-select-${m.membershipId}`}
                      >
                        {inviteRoles.map((r) => (
                          <option key={r} value={r}>
                            {labels.roleLabels[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={rowPending}
                        className="text-xs text-brand-blue underline-offset-2 hover:underline disabled:opacity-50"
                        data-testid={`org-member-role-save-${m.membershipId}`}
                      >
                        OK
                      </button>
                    </form>
                    <form action={rowAction}>
                      <input type="hidden" name="intent" value="revoke" />
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <button
                        type="submit"
                        disabled={rowPending}
                        className="text-xs text-state-danger underline-offset-2 hover:underline disabled:opacity-50"
                        data-testid={`org-member-revoke-${m.membershipId}`}
                      >
                        {labels.revoke}
                      </button>
                    </form>
                  </>
                )}

                {isSelf && m.status === "active" && (
                  <form action={rowAction}>
                    <input type="hidden" name="intent" value="leave" />
                    <button
                      type="submit"
                      disabled={rowPending}
                      className="text-xs text-text-secondary underline-offset-2 hover:underline"
                      data-testid="org-member-leave"
                    >
                      {labels.leave}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {rowMessage && (
          <p
            className="text-xs text-text-secondary"
            role="status"
            data-testid="org-members-row-result"
          >
            {rowMessage}
          </p>
        )}

        {canAdminister && (
          <form
            action={inviteAction}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            data-testid="org-members-invite-form"
          >
            <div className="flex flex-1 flex-col gap-1">
              <label
                className="text-xs text-text-muted"
                htmlFor="membership-invite-email"
              >
                {labels.inviteEmail}
              </label>
              <input
                id="membership-invite-email"
                name="email"
                type="email"
                required
                className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary"
                data-testid="org-members-invite-email"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-xs text-text-muted"
                htmlFor="membership-invite-role"
              >
                {labels.inviteRole}
              </label>
              <select
                id="membership-invite-role"
                name="role"
                defaultValue="member"
                className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary"
                data-testid="org-members-invite-role"
              >
                {inviteRoles.map((r) => (
                  <option key={r} value={r}>
                    {labels.roleLabels[r]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={invitePending}
              className="rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              data-testid="org-members-invite-submit"
            >
              {labels.inviteSubmit}
            </button>
          </form>
        )}
        {inviteMessage && (
          <p
            className="text-xs text-text-secondary"
            role="status"
            data-testid="org-members-invite-result"
          >
            {inviteMessage}
          </p>
        )}
      </div>
    </Card>
  );
}
