"use client";

import { Explain } from "@/components/app/premium/grammar";
import { useActionState, useState } from "react";
import { Link } from "@/lib/i18n/navigation";

import {
  inviteCompanyWorkerAction,
  assignCompanyWorkerRoleAction,
  provisionCompanyWorkerEngagementContextAction,
  setCompanyWorkerJournalReviewAction,
  type InviteCompanyFormState,
} from "@/lib/company/actions";
import type {
  CompanyWorkerInvitation,
  LinkedCompanyWorker,
} from "@/lib/company/company-workers";
import { MessageButton } from "@/components/app/message-button";
import {
  IdentityDisclosure,
  PersonIdentityCard,
  type IdentityMeta,
} from "@/components/app/identity/person-identity-card";
import { personMonogram } from "@/lib/visual/avatar-monogram";
import { RosterLinkEndControl } from "@/components/app/roster-link-end";
import { computeEmploymentJournalContext } from "@/lib/operations/employment-journal-context";
import {
  WorkerOperationsRoleForm,
  type OperationsRoleControlLabels,
} from "@/components/app/worker-operations-role-form";
import { DisplayedWorkspaceField } from "@/components/app/workspace/displayed-workspace-field";

/**
 * Company workers + invitations panel.
 *
 * Mirrors AgencyWorkersSection exactly: empty state, invite-by-email
 * form, pending list, active workers list, migration-blocker banner.
 * The parent server component supplies the RLS-respected lists; this
 * client renderer just visualises them.
 */

type ListState<T> =
  | { kind: "ok"; rows: readonly T[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export interface CompanyWorkersSectionLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly inviteHeading: string;
  readonly inviteDescription: string;
  readonly inviteEmailLabel: string;
  readonly inviteEmailPlaceholder: string;
  readonly inviteNoteLabel: string;
  readonly inviteNoteHint: string;
  readonly inviteSubmit: string;
  readonly invitationsHeading: string;
  readonly invitationsEmpty: string;
  /** Shown instead of the invite form and the pending list to a person
   *  without `manage-invitations`. */
  readonly invitationsManagedElsewhere: string;
  readonly statusInvited: string;
  readonly statusAlreadyPending: string;
  readonly statusAlreadyLinked: string;
  readonly statusWordActive: string;
  readonly statusWordPending: string;
  readonly statusWordAccepted: string;
  readonly statusWordCancelled: string;
  readonly statusWordExpired: string;
  readonly statusWordEnded: string;
  readonly statusNotOwner: string;
  readonly statusInvalidEmail: string;
  readonly statusError: string;
  readonly statusNoCompany: string;
  readonly migrationBlockerHeading: string;
  readonly migrationBlockerBody: string;
  readonly activeWorkersHeading: string;
  readonly openProfile: string;
  readonly columnEmail: string;
  readonly columnStatus: string;
  readonly columnInvitedAt: string;
  readonly noWorkersHeading: string;
  readonly noWorkersBody: string;
  readonly coordinationHeading: string;
  readonly coordinationBody: string;
  readonly coordinationNextAction: string;
  readonly operations: OpsCellLabels;
  /** Identity-card copy: the worker's own stated availability, by status. */
  readonly identity: { readonly availability: Record<string, string> };
  /** Team-at-a-glance copy: the state of each person and the one action it asks for. */
  readonly team: {
    readonly free: string;
    readonly working: string;
    readonly away: string;
    readonly assign: string;
    readonly openCalendar: string;
  };
}

/** The team as a whole + each person's state, resolved by the page from the
 *  ONE capacity read. `byWorker` text is display-ready (dates formatted).
 *  Absent = the read did not answer; nothing is then said about anyone. */
export interface CompanyWorkersTeamView {
  readonly counts: {
    readonly free: number;
    readonly working: number;
    readonly away: number;
  } | null;
  readonly byWorker: Readonly<
    Record<string, { readonly state: "free" | "working" | "away"; readonly text: string }>
  >;
}

const PRIMARY_ACTION =
  "inline-flex min-h-11 items-center rounded-control border border-ink-500 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan";
const QUIET_ACTION =
  "inline-flex min-h-11 items-center rounded-control px-2.5 py-2 text-xs font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan";

export interface OpsCellLabels {
  readonly columnHeading: string;
  readonly notAssigned: string;
  readonly reviewEnabled: string;
  readonly reviewNotEnabled: string;
  readonly roleLabels: Record<string, string>;
  /** Plain-language note shown when no worker has an ops role assigned yet. */
  readonly setupNote: string;
  /** One next action per relationship, keyed by context nextAction. */
  readonly nextActionLabels: Record<string, string>;
  /** Owner-only role-select control copy (assign / clear + disabled review). */
  readonly assign: OperationsRoleControlLabels;
}

/** Human word for a stored link/invitation status; an unknown value falls back to the stored word. */
function statusWord(labels: CompanyWorkersSectionLabels, status: string): string {
  switch (status) {
    case "active":
      return labels.statusWordActive;
    case "pending":
      return labels.statusWordPending;
    case "accepted":
      return labels.statusWordAccepted;
    case "cancelled":
      return labels.statusWordCancelled;
    case "expired":
      return labels.statusWordExpired;
    case "ended":
    case "inactive":
      return labels.statusWordEnded;
    default:
      return status;
  }
}

export function CompanyWorkersSection({
  workersResult,
  invitationsResult,
  labels,
  avatarByWorker,
  professionsByWorker,
  roleCoordinationEnabled,
  canAssignRoles = false,
  reviewElsewhere,
  canManageInvitations = false,
  team,
}: {
  readonly workersResult: ListState<LinkedCompanyWorker>;
  readonly invitationsResult: ListState<CompanyWorkerInvitation>;
  readonly labels: CompanyWorkersSectionLabels;
  /** Signed photo URL per workerId, resolved by the page through the one
   *  photo rule; absent / null = initials. */
  readonly avatarByWorker?: Record<string, string | null>;
  /** Profession names per workerId from the canonical profession read (primary
   *  first), already in the viewer's language. Absent / empty = the person has
   *  declared none that could be named; the card then shows the role alone. */
  readonly professionsByWorker?: Record<string, readonly string[]>;
  /** From the operations role-capability map — false today (foreman /
   *  manager coordination is not enabled). When false, show the honest
   *  not-enabled note instead of pretending coordination works. */
  readonly roleCoordinationEnabled: boolean;
  /** Owner/admin viewing their own company → show the role-select control.
   *  The RPC re-validates ownership regardless. */
  readonly canAssignRoles?: boolean;
  /** Where the page's ONE journal-review control lives (org members panel). */
  readonly reviewElsewhere?: { readonly href: string; readonly label: string };
  /** `manage-invitations` (owner/admin, never a job title): the invite form
   *  and the pending-invitations list. Without it, a neutral explanation. */
  readonly canManageInvitations?: boolean;
  /** Team state from the ONE capacity read (see `derivePeopleTeamState`). */
  readonly team?: CompanyWorkersTeamView;
}) {
  const [state, formAction, isPending] = useActionState<
    InviteCompanyFormState | null,
    FormData
  >(inviteCompanyWorkerAction, null);
  const [shouldShowOutcome, setShouldShowOutcome] = useState(true);

  const migrationNeeded =
    workersResult.kind === "needs-migration" ||
    invitationsResult.kind === "needs-migration";

  const activeWorkers =
    workersResult.kind === "ok"
      ? workersResult.rows
      : ([] as LinkedCompanyWorker[]);
  const pendingInvitations =
    invitationsResult.kind === "ok"
      ? invitationsResult.rows.filter((i) => i.status === "pending")
      : ([] as CompanyWorkerInvitation[]);

  const outcomeLabel: string | null = (() => {
    if (!state || !shouldShowOutcome) return null;
    if (state.ok) {
      switch (state.outcome) {
        case "invited":
          return labels.statusInvited;
        case "already_pending":
          return labels.statusAlreadyPending;
        case "already_linked":
          return labels.statusAlreadyLinked;
        case "not_owner":
          return labels.statusNotOwner;
        case "invalid_email":
          return labels.statusInvalidEmail;
      }
    }
    if (state.code === "no_company") return labels.statusNoCompany;
    if (state.code === "needs_migration") return labels.migrationBlockerHeading;
    return state.message ?? labels.statusError;
  })();

  return (
    <section
      className="card-border flex flex-col gap-5 p-5"
      data-testid="company-workers-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        {labels.subtitle ? <p className="text-sm text-text-secondary">{labels.subtitle}</p> : null}
      </header>

      {team?.counts ? (
        <ul
          className="grid grid-cols-3 gap-2"
          data-testid="company-team-counts"
          aria-label={labels.title}
        >
          {(
            [
              ["free", team.counts.free, labels.team.free],
              ["working", team.counts.working, labels.team.working],
              ["away", team.counts.away, labels.team.away],
            ] as const
          ).map(([key, n, label]) => (
            <li
              key={key}
              className="flex min-w-0 flex-col rounded-control border border-ink-600 bg-ink-900/40 px-3 py-2"
              data-testid={`company-team-count-${key}`}
            >
              <span className="font-display text-2xl font-bold tabular-nums text-text-primary">{n}</span>
              <span className="min-w-0 break-words text-meta text-text-secondary">{label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {migrationNeeded ? (
        <div
          className="rounded-md border border-state-warning bg-state-warning/10 p-3"
          data-testid="company-workers-migration-blocker"
        >
          <p className="font-mono text-meta uppercase tracking-label text-state-warning">
            {labels.migrationBlockerHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {labels.migrationBlockerBody}
          </p>
        </div>
      ) : null}

      <section
        className="flex flex-col gap-2"
        data-testid="company-workers-active-list"
      >
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {labels.activeWorkersHeading}
        </h3>
        {activeWorkers.length === 0 ? (
          <div
            className="rounded-md border border-dashed border-ink-500 p-3"
            data-testid="company-workers-empty"
          >
            <p className="text-xs font-semibold text-text-primary">
              {labels.noWorkersHeading}
            </p>
            <p className="text-xs text-text-secondary">{labels.noWorkersBody}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeWorkers.map((w) => {
                const ctx = computeEmploymentJournalContext({
                  relationship: "company",
                  operationsRole: w.operationsRole,
                  journalReviewEnabled: w.journalReviewEnabled,
                });
                const roleLabel =
                  ctx.operationsRole === "not_enabled"
                    ? labels.operations.notAssigned
                    : (labels.operations.roleLabels[ctx.operationsRole] ??
                      labels.operations.notAssigned);
                const personName = w.displayName?.trim() || w.email || "\u2014";
                const availabilityText = w.availabilityStatus
                  ? (labels.identity.availability[w.availabilityStatus] ?? null)
                  : null;
                const ts = team?.byWorker[w.workerId] ?? null;
                const tradeNames = professionsByWorker?.[w.workerId] ?? [];
                // The one real role: a stated title, or an assigned role. An
                // unassigned role is simply not said (SEP-5: identity ≠ role).
                const roleText =
                  w.operationsTitle?.trim() ||
                  (ctx.operationsRole === "not_enabled" ? "" : roleLabel);
                // State in ONE meta line: from the capacity read when it
                // answered, otherwise the person's own stated availability.
                const meta: IdentityMeta[] = [];
                if (ts) {
                  meta.push({
                    key: "state",
                    kind: ts.state === "working" ? "assignment" : "availability",
                    label: ts.text,
                    live: ts.state === "free",
                  });
                } else {
                  if (availabilityText) {
                    meta.push({
                      key: "avail",
                      kind: "availability",
                      label: w.availableFrom
                        ? `${availabilityText} · ${w.availableFrom.slice(0, 10)}`
                        : availabilityText,
                      live: w.availabilityStatus === "available",
                    });
                  }
                  if (w.currentProjects.length > 0) {
                    meta.push({
                      key: "project",
                      kind: "assignment",
                      label: w.currentProjects.join(" · "),
                    });
                  }
                }
                if (w.locationCountry) {
                  meta.push({ key: "loc", kind: "location", label: w.locationCountry });
                }
                // The trade leads the card; the role (a different fact, SEP-5)
                // moves to its own meta entry instead of standing in for it.
                if (tradeNames.length > 0 && roleText) {
                  meta.unshift({ key: "role", kind: "role", label: roleText });
                }
                // ONE contextual primary action by state; everything else is
                // quieter. free → give work; working → see it in time; away or
                // unknown → reach the person.
                const primary: "assign" | "calendar" | "message" =
                  ts?.state === "free" ? "assign" : ts?.state === "working" ? "calendar" : "message";
                return (
                  <li
                    key={w.workerId}
                    className="card-border flex flex-col gap-2 p-3"
                    data-testid={`company-worker-row-${w.workerId}`}
                    data-review-capability={ctx.reviewCapability}
                    data-team-state={ts?.state ?? "unknown"}
                  >
                    {/* ONE identity, team depth (owner 2026-10-01): the same
                        PersonIdentityCard the employer reads an application
                        with. Layer 1 = who, role, state, place; the role and
                        journal controls open as a layer. */}
                    <PersonIdentityCard
                      variant="team-member"
                      testid={`company-worker-identity-${w.workerId}`}
                      name={personName}
                      initials={personMonogram(personName)}
                      avatarUrl={avatarByWorker?.[w.workerId] ?? null}
                      nameHref={`/dashboard/people/${w.workerId}`}
                      professions={tradeNames.length > 0 ? [...tradeNames] : roleText ? [roleText] : []}
                      meta={meta}
                      status={
                        w.status && w.status !== "active" ? (
                          <span className="shrink-0 rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-secondary">
                            {statusWord(labels, w.status)}
                          </span>
                        ) : null
                      }
                      actions={
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                          {primary === "assign" ? (
                            <Link
                              href={"/dashboard/projects" as "/dashboard"}
                              className={PRIMARY_ACTION}
                              data-testid={`company-worker-assign-${w.workerId}`}
                            >
                              {labels.team.assign}
                            </Link>
                          ) : null}
                          {primary === "calendar" ? (
                            <Link
                              href={"/dashboard/company/planning" as "/dashboard"}
                              className={PRIMARY_ACTION}
                              data-testid={`company-worker-calendar-${w.workerId}`}
                            >
                              {labels.team.openCalendar}
                            </Link>
                          ) : null}
                          <MessageButton
                            profileId={w.profileId}
                            labelKey="messageWorker"
                            variant={primary === "message" ? "primary" : "quiet"}
                          />
                          <Link
                            href={`/dashboard/people/${w.workerId}`}
                            className={QUIET_ACTION}
                            data-testid={`company-worker-open-${w.workerId}`}
                          >
                            {labels.openProfile}
                          </Link>
                          {/* R-9: the owner ends the relationship through the one
                              gated write (the RPC re-derives ownership). Destructive,
                              so it is the quietest control on the card. */}
                          {canAssignRoles && w.companyId ? (
                            <span className="ml-auto">
                              <RosterLinkEndControl
                                kind="company"
                                orgLegacyId={w.companyId}
                                workerId={w.workerId}
                                side="owner"
                              />
                            </span>
                          ) : null}
                        </div>
                      }
                    >
                      <IdentityDisclosure
                        id="operations"
                        title={labels.operations.columnHeading}
                      >
                        <div className="flex flex-col gap-1 text-xs text-text-secondary">
                          <span>
                            {roleText}
                            <span className="ml-1 text-meta text-text-muted">
                              {"\u00b7 "}
                              {ctx.reviewCapability === "can_review"
                                ? labels.operations.reviewEnabled
                                : labels.operations.reviewNotEnabled}
                            </span>
                          </span>
                          <span
                            className="text-meta text-text-muted"
                            data-testid={`company-worker-next-action-${w.workerId}`}
                          >
                            {labels.operations.nextActionLabels[ctx.nextAction] ?? ""}
                          </span>
                          {w.email ? (
                            <span className="break-all text-meta text-text-muted">{w.email}</span>
                          ) : null}
                        </div>
                        {canAssignRoles ? (
                          <WorkerOperationsRoleForm
                            workerId={w.workerId}
                            currentRole={w.operationsRole}
                            currentTitle={w.operationsTitle}
                            journalReviewEnabled={w.journalReviewEnabled}
                            engagementContextLinked={w.engagementContextLinked}
                            action={assignCompanyWorkerRoleAction}
                            provisionAction={provisionCompanyWorkerEngagementContextAction}
                            setReviewAction={setCompanyWorkerJournalReviewAction}
                            reviewElsewhere={reviewElsewhere}
                            labels={{
                              ...labels.operations.assign,
                              roleOptionLabels: labels.operations.roleLabels,
                            }}
                          />
                        ) : null}
                        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                          {labels.columnInvitedAt}: {w.createdAt.slice(0, 10)}
                        </span>
                      </IdentityDisclosure>
                    </PersonIdentityCard>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {activeWorkers.length > 0 &&
      activeWorkers.every((w) => !w.operationsRole?.trim()) ? (
        <p
          className="rounded-md border border-ink-700 bg-surface-1 px-3 py-2 text-meta text-text-secondary"
          data-testid="company-workers-ops-setup-note"
        >
          {labels.operations.setupNote}
        </p>
      ) : null}

      {/* A feature that is not on yet is a quiet line, not a block in the
          team's way (owner 2026-10-10) — its explanation one tap away. */}
      {!roleCoordinationEnabled ? (
        <Explain summary={labels.coordinationHeading}>
          <p data-testid="company-workers-coordination-note">{labels.coordinationBody}</p>
          <p>{labels.coordinationNextAction}</p>
        </Explain>
      ) : null}

      {/* INVITATIONS — `manage-invitations` only (owner direction 2026-09-24):
          owner/admin, never a job title. Anyone else reads who handles them
          instead of an invite form the database refuses and an empty list
          that reads as "nobody is invited" (SEP-7: refused ≠ empty). */}
      {canManageInvitations ? (
        <>
          <form
            action={(fd) => {
              setShouldShowOutcome(true);
              return formAction(fd);
            }}
            className="flex flex-col gap-3"
            data-testid="company-workers-invite-form"
          >
            <DisplayedWorkspaceField />
            <header className="flex flex-col gap-1">
              <h3 className="font-display text-sm font-semibold text-text-primary">
                {labels.inviteHeading}
              </h3>
              <p className="text-xs text-text-secondary">
                {labels.inviteDescription}
              </p>
            </header>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-text-secondary">{labels.inviteEmailLabel}</span>
              <input
                type="email"
                name="email"
                required
                placeholder={labels.inviteEmailPlaceholder}
                className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                data-testid="company-workers-invite-email"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-text-secondary">{labels.inviteNoteLabel}</span>
              <textarea
                name="note"
                rows={2}
                maxLength={500}
                className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                data-testid="company-workers-invite-note"
              />
              <span className="text-meta text-text-muted">
                {labels.inviteNoteHint}
              </span>
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
              data-testid="company-workers-invite-submit"
            >
              {labels.inviteSubmit}
            </button>
            {outcomeLabel ? (
              <p
                className={
                  state?.ok && state.outcome === "invited"
                    ? "rounded-md border border-state-success bg-state-success/10 px-3 py-2 text-xs text-state-success"
                    : "rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
                }
                role="status"
                data-testid="company-workers-invite-result"
              >
                {outcomeLabel}
              </p>
            ) : null}
          </form>

          <section
            id="company-invitations"
            className="flex flex-col gap-2 scroll-mt-20"
            data-testid="company-workers-pending-list"
          >
            <h3 className="font-display text-sm font-semibold text-text-primary">
              {labels.invitationsHeading}
            </h3>
            {pendingInvitations.length === 0 ? (
              <p className="text-xs text-text-secondary">
                {labels.invitationsEmpty}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pendingInvitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="card-border flex flex-col gap-1 p-3"
                    data-testid={`company-invitation-row-${inv.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="break-all text-sm text-text-primary">{inv.invitedEmail}</span>
                      <span className="shrink-0 rounded-full border border-state-warning/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning">{statusWord(labels, inv.status)}</span>
                    </div>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {labels.columnInvitedAt}: {inv.createdAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section
          id="company-invitations"
          className="flex flex-col gap-2 scroll-mt-20"
          data-testid="company-invitations-managed-elsewhere"
        >
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {labels.invitationsHeading}
          </h3>
          <p className="text-xs text-text-secondary">
            {labels.invitationsManagedElsewhere}
          </p>
        </section>
      )}
    </section>
  );
}
