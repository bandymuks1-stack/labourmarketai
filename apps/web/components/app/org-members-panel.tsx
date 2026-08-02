"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  addOrgMember,
  endOrgMembership,
  setEngagementJournalReview,
} from "@/lib/operations/org-membership";
import type { OrgMember, AddableWorker } from "@/lib/operations/org-members";

export type OrgMembersPanelLabels = {
  title: string;
  intro: string;
  reviewOn: string;
  reviewOff: string;
  enable: string;
  disable: string;
  addTitle: string;
  addButton: string;
  noMembers: string;
  noAddable: string;
  allAdded: string;
  reviewEnabledBadge: string;
  reviewDisabledBadge: string;
  /** W9 slice 1 — membership revocation. */
  remove: string;
  removeConfirm: string;
  removeCancel: string;
  removeReasonLabel: string;
  ownerLocked: string;
  removed: string;
  roles: Readonly<Record<string, string>>;
};

/**
 * Owner control to bring a worker into the organization (canonical
 * `add_org_member`) and open their journal for review
 * (`set_engagement_journal_review`) — both on engagement_contexts, never the
 * legacy link tables. This is what makes a worker's entries reviewable so a
 * manager can confirm skills (the keystone loop).
 */
export function OrgMembersPanel({
  orgId,
  members,
  addable,
  labels,
}: {
  orgId: string;
  members: OrgMember[];
  addable: AddableWorker[];
  labels: OrgMembersPanelLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(addable[0]?.workerId ?? "");
  // Removing a member is destructive for that person's access — it asks first,
  // inline, and the reason it captures goes into the audit row.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");

  function remove(engagementId: string) {
    setMsg(null);
    const why = reason.trim();
    startTransition(async () => {
      const res = await endOrgMembership(engagementId, why.length > 0 ? why : null);
      setConfirming(null);
      setReason("");
      // `already_ended` is a success (idempotent), so ok covers both.
      setMsg(res.ok ? labels.removed : (res.message ?? res.code));
      router.refresh();
    });
  }

  function toggleReview(engagementId: string, next: boolean) {
    setMsg(null);
    startTransition(async () => {
      const res = await setEngagementJournalReview(engagementId, next);
      if (!res.ok) setMsg(res.message ?? res.code);
      router.refresh();
    });
  }

  function add(workerId: string) {
    if (!workerId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await addOrgMember(orgId, workerId);
      if (!res.ok) setMsg(res.message ?? res.code);
      router.refresh();
    });
  }

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="org-members-panel">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.intro}</p>
      </header>

      {members.length === 0 ? (
        <p className="text-sm text-text-muted">{labels.noMembers}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.engagementId}
              className="flex flex-col gap-2 rounded-md border border-ink-600 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              data-testid={`org-member-${m.engagementId}`}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                <span
                  className="rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary"
                  data-testid={`org-member-role-${m.engagementId}`}
                >
                  {labels.roles[m.role] ?? m.role}
                </span>
                <span
                  className={
                    m.reviewEnabled
                      ? "rounded-full border border-state-success/40 bg-state-success/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-success"
                      : "rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
                  }
                >
                  {m.reviewEnabled ? labels.reviewEnabledBadge : labels.reviewDisabledBadge}
                </span>
                {m.name}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {/* Journal review is an employee-engagement flag — the RPC
                    rejects any other slug, so the control is not offered. */}
                {m.role === "employee" && (
                  <Button
                    type="button"
                    size="sm"
                    variant={m.reviewEnabled ? "ghost" : "primary"}
                    disabled={pending}
                    onClick={() => toggleReview(m.engagementId, !m.reviewEnabled)}
                    data-testid={`toggle-review-${m.engagementId}`}
                  >
                    {m.reviewEnabled ? labels.disable : labels.enable}
                  </Button>
                )}
                {m.isRegisteredOwner ? (
                  <span
                    className="text-meta text-text-muted"
                    data-testid={`org-member-owner-locked-${m.engagementId}`}
                  >
                    {labels.ownerLocked}
                  </span>
                ) : confirming === m.engagementId ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`remove-reason-${m.engagementId}`}>
                      {labels.removeReasonLabel}
                    </label>
                    <input
                      id={`remove-reason-${m.engagementId}`}
                      type="text"
                      value={reason}
                      maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={labels.removeReasonLabel}
                      className="min-h-11 w-full rounded-md border border-ink-500 bg-ink-700 px-3 text-sm text-text-primary sm:w-56"
                      data-testid={`remove-reason-${m.engagementId}`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={pending}
                      onClick={() => remove(m.engagementId)}
                      data-testid={`confirm-remove-${m.engagementId}`}
                    >
                      {labels.removeConfirm}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setConfirming(null);
                        setReason("");
                      }}
                      data-testid={`cancel-remove-${m.engagementId}`}
                    >
                      {labels.removeCancel}
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setMsg(null);
                      setReason("");
                      setConfirming(m.engagementId);
                    }}
                    data-testid={`remove-member-${m.engagementId}`}
                  >
                    {labels.remove}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.addTitle}
        </p>
        {addable.length === 0 ? (
          <p className="text-sm text-text-muted">
            {members.length > 0 ? labels.allAdded : labels.noAddable}
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-text-primary sm:w-auto"
              data-testid="org-add-member-select"
            >
              {addable.map((a) => (
                <option key={a.workerId} value={a.workerId}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending || !selected}
              onClick={() => add(selected)}
              data-testid="org-add-member-button"
            >
              {labels.addButton}
            </Button>
          </div>
        )}
      </div>

      {msg ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-xs text-state-warning"
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </section>
  );
}
