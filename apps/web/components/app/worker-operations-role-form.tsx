"use client";

import { useActionState, useState } from "react";

import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  ASSIGNABLE_OPERATIONS_ROLES,
  type AssignRoleActionState,
} from "@/lib/operations/assign-operations-role";
import {
  computeEngagementBridgeReadiness,
  type EngagementBridgeState,
} from "@/lib/operations/engagement-bridge";
import type {
  ProvisionEngagementActionState,
  SetJournalReviewActionState,
} from "@/lib/operations/journal-review-actions";

/**
 * Owner/admin-only operations control for a single worker row.
 *
 * Three honest, progressive owner actions (slice
 * feat/journal-review-enable-toggle-v1):
 *   1. Assign / clear `operations_role` + `operations_title` (assign* action).
 *   2. Connect the work-journal engagement context once a reviewer role is set
 *      but no real link exists yet (provision* action → migration 0032 RPC).
 *   3. Enable / disable journal review — ONLY when the relationship is genuinely
 *      bridge-ready (a real active engagement_context). The toggle stays
 *      visibly DISABLED with an exact blocker note until `bridge.bridgeReady`.
 *
 * Honest-by-design: the review state shown is the REAL one
 * (`engagementContextLinked` is a per-row DB read, never a hardcoded flag), the
 * toggle can never be flipped on from a label alone (the RPC re-checks the
 * engagement context), and there is NO approve/reject control and no fake
 * reviewer / foreman / PM state.
 */

export interface OperationsRoleControlLabels {
  readonly heading: string;
  readonly roleLabel: string;
  readonly none: string;
  readonly titleLabel: string;
  readonly titlePlaceholder: string;
  readonly save: string;
  readonly saving: string;
  readonly reviewToggleLabel: string;
  readonly reviewDisabledNote: string;
  /** Per-bridge-state reason copy (engagement-context bridge readiness). */
  readonly bridgeReasons: Record<EngagementBridgeState, string>;
  /** Affirmative line shown when the bridge is ready but review is off. */
  readonly readyForSetup: string;
  readonly outcomeAssigned: string;
  readonly outcomeCleared: string;
  readonly outcomeNotOwner: string;
  readonly outcomeNotLinked: string;
  readonly outcomeInvalidRole: string;
  readonly outcomeReviewNotAllowed: string;
  readonly outcomeError: string;
  readonly outcomeNeedsMigration: string;
  /** Localized label per assignable role id (worker / foreman / …). */
  readonly roleOptionLabels: Record<string, string>;
  /** Owner provisioning button copy + outcomes (migration 0032 RPC). */
  readonly provision: ProvisionLabels;
  /** Journal-review enable/disable toggle copy + outcomes (migration 0033). */
  readonly review: ReviewToggleLabels;
}

export interface ProvisionLabels {
  readonly button: string;
  readonly provisioning: string;
  readonly outcomeConnected: string;
  readonly outcomeAlreadyConnected: string;
  readonly outcomeNotOwner: string;
  readonly outcomeNotLinked: string;
  readonly outcomeProfileMissing: string;
  readonly outcomeRoleNotAssigned: string;
  readonly outcomeRoleNotAllowed: string;
  readonly outcomeOrganizationMissing: string;
  readonly outcomeError: string;
  readonly outcomeNeedsMigration: string;
}

export interface ReviewToggleLabels {
  /** Checkbox / control label, e.g. "Work journal review". */
  readonly toggleLabel: string;
  readonly enableButton: string;
  readonly enabling: string;
  readonly disableButton: string;
  readonly disabling: string;
  /** EXACT disabled-state blocker text shown when the bridge is not ready. */
  readonly blockerNotReady: string;
  readonly outcomeEnabled: string;
  readonly outcomeAlreadyEnabled: string;
  readonly outcomeDisabled: string;
  readonly outcomeAlreadyDisabled: string;
  readonly outcomeNotOwner: string;
  readonly outcomeNotLinked: string;
  readonly outcomeRoleNotAssigned: string;
  readonly outcomeRoleNotAllowed: string;
  readonly outcomeProfileMissing: string;
  readonly outcomeOrganizationMissing: string;
  readonly outcomeEngagementMissing: string;
  readonly outcomeError: string;
  readonly outcomeNeedsMigration: string;
}

type AssignAction = (
  prev: AssignRoleActionState | null,
  formData: FormData,
) => Promise<AssignRoleActionState>;
type ProvisionAction = (
  prev: ProvisionEngagementActionState | null,
  formData: FormData,
) => Promise<ProvisionEngagementActionState>;
type SetReviewAction = (
  prev: SetJournalReviewActionState | null,
  formData: FormData,
) => Promise<SetJournalReviewActionState>;

export function WorkerOperationsRoleForm({
  workerId,
  currentRole,
  currentTitle,
  journalReviewEnabled = false,
  engagementContextLinked = false,
  action,
  provisionAction,
  setReviewAction,
  labels,
}: {
  readonly workerId: string;
  readonly currentRole: string | null;
  readonly currentTitle: string | null;
  /** Current journal_review_enabled for this relationship (default false). */
  readonly journalReviewEnabled?: boolean;
  /** Real per-row DB read: does an active 'employee' engagement_context link
   *  this worker to the org? Drives bridge readiness (migration 0033 read). */
  readonly engagementContextLinked?: boolean;
  readonly action: AssignAction;
  readonly provisionAction: ProvisionAction;
  readonly setReviewAction: SetReviewAction;
  readonly labels: OperationsRoleControlLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    AssignRoleActionState | null,
    FormData
  >(action, null);
  const [provisionState, provisionFormAction, isProvisioning] = useActionState<
    ProvisionEngagementActionState | null,
    FormData
  >(provisionAction, null);
  const [reviewState, reviewFormAction, isReviewPending] = useActionState<
    SetJournalReviewActionState | null,
    FormData
  >(setReviewAction, null);

  // Engagement-context bridge readiness for THIS relationship, driven by the
  // REAL per-row engagement read (never a hardcoded flag). The helper reports
  // the exact blocker (e.g. missing_engagement_context) and is the only source
  // of truth for whether review can be enabled or is active.
  const bridge = computeEngagementBridgeReadiness({
    relationshipExists: true,
    operationsRole: currentRole,
    journalReviewEnabled,
    engagementContextLinked,
  });
  const bridgeReasonText =
    bridge.bridgeReady && !bridge.reviewActive
      ? labels.readyForSetup
      : labels.bridgeReasons[bridge.state];

  // The owner can connect the journal context exactly when a reviewer role is
  // assigned but no real engagement link exists yet.
  const canProvision = bridge.state === "missing_engagement_context";

  const outcomeMessage: { text: string; ok: boolean } | null = (() => {
    if (!state) return null;
    if (state.ok) {
      switch (state.outcome) {
        case "assigned":
          return { text: labels.outcomeAssigned, ok: true };
        case "cleared":
          return { text: labels.outcomeCleared, ok: true };
        case "not_owner":
          return { text: labels.outcomeNotOwner, ok: false };
        case "not_linked":
          return { text: labels.outcomeNotLinked, ok: false };
        case "invalid_role":
          return { text: labels.outcomeInvalidRole, ok: false };
        case "review_not_allowed":
          return { text: labels.outcomeReviewNotAllowed, ok: false };
      }
    }
    if (state.code === "needs_migration")
      return { text: labels.outcomeNeedsMigration, ok: false };
    return { text: state.message ?? labels.outcomeError, ok: false };
  })();

  const provisionMessage: { text: string; ok: boolean } | null = (() => {
    if (!provisionState) return null;
    const p = labels.provision;
    if (provisionState.ok) {
      switch (provisionState.outcome) {
        case "connected":
          return { text: p.outcomeConnected, ok: true };
        case "already_connected":
          return { text: p.outcomeAlreadyConnected, ok: true };
        case "not_owner":
          return { text: p.outcomeNotOwner, ok: false };
        case "not_linked":
          return { text: p.outcomeNotLinked, ok: false };
        case "profile_missing":
          return { text: p.outcomeProfileMissing, ok: false };
        case "role_not_assigned":
          return { text: p.outcomeRoleNotAssigned, ok: false };
        case "role_not_allowed":
          return { text: p.outcomeRoleNotAllowed, ok: false };
        case "organization_missing":
          return { text: p.outcomeOrganizationMissing, ok: false };
      }
    }
    if (provisionState.code === "needs_migration")
      return { text: p.outcomeNeedsMigration, ok: false };
    return { text: provisionState.message ?? p.outcomeError, ok: false };
  })();

  const reviewMessage: { text: string; ok: boolean } | null = (() => {
    if (!reviewState) return null;
    const rv = labels.review;
    if (reviewState.ok) {
      switch (reviewState.outcome) {
        case "enabled":
          return { text: rv.outcomeEnabled, ok: true };
        case "already_enabled":
          return { text: rv.outcomeAlreadyEnabled, ok: true };
        case "disabled":
          return { text: rv.outcomeDisabled, ok: true };
        case "already_disabled":
          return { text: rv.outcomeAlreadyDisabled, ok: true };
        case "not_owner":
          return { text: rv.outcomeNotOwner, ok: false };
        case "not_linked":
          return { text: rv.outcomeNotLinked, ok: false };
        case "role_not_assigned":
          return { text: rv.outcomeRoleNotAssigned, ok: false };
        case "role_not_allowed":
          return { text: rv.outcomeRoleNotAllowed, ok: false };
        case "profile_missing":
          return { text: rv.outcomeProfileMissing, ok: false };
        case "organization_missing":
          return { text: rv.outcomeOrganizationMissing, ok: false };
        case "engagement_context_missing":
          return { text: rv.outcomeEngagementMissing, ok: false };
      }
    }
    if (reviewState.code === "needs_migration")
      return { text: rv.outcomeNeedsMigration, ok: false };
    return { text: reviewState.message ?? rv.outcomeError, ok: false };
  })();

  const defaultRole =
    currentRole && (ASSIGNABLE_OPERATIONS_ROLES as readonly string[]).includes(currentRole)
      ? currentRole
      : "";
  const [opsRole, setOpsRole] = useState(defaultRole);

  // When the toggle is interactive, the next desired state is the opposite of
  // the current REAL review state.
  const nextEnabled = bridge.reviewActive ? "false" : "true";

  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded-md border border-ink-700 bg-surface-1 p-2"
      data-testid={`worker-ops-role-form-${workerId}`}
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {labels.heading}
      </span>

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="workerId" value={workerId} />
        <label className="flex flex-col gap-0.5 text-meta">
          <span className="text-text-secondary">{labels.roleLabel}</span>
          <DarkListbox
            name="operationsRole"
            value={opsRole}
            onChange={setOpsRole}
            ariaLabel={labels.roleLabel}
            testId={`worker-ops-role-select-${workerId}`}
            options={[
              { value: "", label: labels.none },
              ...ASSIGNABLE_OPERATIONS_ROLES.map((r) => ({
                value: r,
                label: labels.roleOptionLabels[r] ?? r,
              })),
            ]}
          />
        </label>

        <label className="flex flex-col gap-0.5 text-meta">
          <span className="text-text-secondary">{labels.titleLabel}</span>
          <input
            type="text"
            name="operationsTitle"
            maxLength={120}
            defaultValue={currentTitle ?? ""}
            placeholder={labels.titlePlaceholder}
            className="w-full rounded-md border border-border-default bg-ink-700 px-3 py-2.5 text-text-primary outline-none focus:border-brand-blue sm:w-auto sm:py-1.5"
            data-testid={`worker-ops-title-input-${workerId}`}
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-brand-blue px-3 py-1 text-meta font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid={`worker-ops-save-${workerId}`}
        >
          {isPending ? labels.saving : labels.save}
        </button>

        {outcomeMessage ? (
          <p
            className={
              outcomeMessage.ok
                ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-meta text-state-success"
                : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-meta text-state-warning"
            }
            role="status"
            data-testid={`worker-ops-result-${workerId}`}
          >
            {outcomeMessage.text}
          </p>
        ) : null}
      </form>

      {/* Journal-review section. Progressive + honest:
          - missing_engagement_context → owner provisioning button.
          - bridgeReady → interactive enable/disable toggle.
          - otherwise → visibly disabled with the exact blocker note. */}
      <div className="mt-1 flex flex-col gap-1 border-t border-ink-700 pt-2">
        <div className="flex items-center gap-2 text-meta text-text-muted">
          <input
            type="checkbox"
            checked={bridge.reviewActive}
            disabled={!bridge.bridgeReady}
            readOnly
            aria-disabled={bridge.bridgeReady ? undefined : "true"}
            data-testid={`worker-ops-review-toggle-${workerId}`}
          />
          <span>{labels.review.toggleLabel}</span>
        </div>

        {/* Owner provisioning button — only when a reviewer role is set but no
            real engagement link exists yet. */}
        {canProvision ? (
          <form action={provisionFormAction} className="flex flex-col gap-1">
            <input type="hidden" name="workerId" value={workerId} />
            <button
              type="submit"
              disabled={isProvisioning}
              className="self-start rounded-md border border-brand-blue px-3 py-1 text-meta font-semibold text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
              data-testid={`worker-ops-provision-${workerId}`}
            >
              {isProvisioning ? labels.provision.provisioning : labels.provision.button}
            </button>
            {provisionMessage ? (
              <p
                className={
                  provisionMessage.ok
                    ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-meta text-state-success"
                    : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-meta text-state-warning"
                }
                role="status"
                data-testid={`worker-ops-provision-result-${workerId}`}
              >
                {provisionMessage.text}
              </p>
            ) : null}
          </form>
        ) : null}

        {/* Interactive enable/disable toggle — ONLY when genuinely bridge-ready. */}
        {bridge.bridgeReady ? (
          <form action={reviewFormAction} className="flex flex-col gap-1">
            <input type="hidden" name="workerId" value={workerId} />
            <input type="hidden" name="enabled" value={nextEnabled} />
            <button
              type="submit"
              disabled={isReviewPending}
              className="self-start rounded-md bg-brand-blue px-3 py-1 text-meta font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
              data-testid={`worker-ops-review-submit-${workerId}`}
            >
              {bridge.reviewActive
                ? isReviewPending
                  ? labels.review.disabling
                  : labels.review.disableButton
                : isReviewPending
                  ? labels.review.enabling
                  : labels.review.enableButton}
            </button>
            {reviewMessage ? (
              <p
                className={
                  reviewMessage.ok
                    ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-meta text-state-success"
                    : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-meta text-state-warning"
                }
                role="status"
                data-testid={`worker-ops-review-result-${workerId}`}
              >
                {reviewMessage.text}
              </p>
            ) : null}
          </form>
        ) : (
          // Not bridge-ready → exact disabled-state blocker text.
          <p
            className="text-meta leading-relaxed text-text-muted"
            data-testid={`worker-ops-review-disabled-note-${workerId}`}
          >
            {labels.review.blockerNotReady}
          </p>
        )}

        {/* Specific engagement-context bridge reason for this relationship.
            Affirmative styling ONLY when the bridge is ready (review can be set
            up or is active) — never claims review is active unless reviewActive. */}
        <p
          className={
            bridge.bridgeReady
              ? "text-meta leading-relaxed text-brand-blue"
              : "text-meta leading-relaxed text-text-muted"
          }
          data-testid={`worker-ops-bridge-reason-${workerId}`}
          data-bridge-state={bridge.state}
          data-bridge-ready={bridge.bridgeReady ? "true" : "false"}
          data-review-active={bridge.reviewActive ? "true" : "false"}
        >
          {bridgeReasonText}
        </p>
      </div>
    </div>
  );
}
