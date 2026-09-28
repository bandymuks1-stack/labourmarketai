"use client";

import { useActionState } from "react";

import {
  draftClientNeedAction,
  type BridgeActionState,
} from "@/lib/agency/bridge-actions";
import type {
  DraftedNeedRow,
  PlacementRow,
  ReadState,
} from "@/lib/agency/delegation-read";
import { DisplayedWorkspaceField } from "@/components/app/workspace/displayed-workspace-field";
import { Card } from "@/components/ui/Card";

export interface AgencyDelegationLabels {
  readonly title: string;
  readonly intro: string;
  readonly clientLabel: string;
  readonly needTitle: string;
  readonly role: string;
  readonly location: string;
  readonly country: string;
  readonly teamSize: string;
  readonly summary: string;
  readonly draftSubmit: string;
  readonly draftSaved: string;
  readonly draftFailed: string;
  readonly draftsTitle: string;
  readonly awaitingClient: string;
  readonly confirmedShared: string;
  readonly openScouting: string;
  readonly placementsTitle: string;
  readonly placementsEmpty: string;
  readonly unavailable: string;
  readonly lifecycle: Readonly<Record<string, string>>;
}

const IDLE: BridgeActionState = { status: "idle" };

/**
 * The agency's delegated work beside its connections (owner decisions
 * 2026-09-28 A and D): draft a need FOR a connected client — the client
 * confirms it, never the agency — and keep sight of the placements that came
 * from its own accepted offers, as lifecycle statuses only.
 */
export function AgencyDelegationPanel({
  connections,
  drafts,
  placements,
  requestTitles,
  labels,
  locale,
}: {
  connections: readonly { id: string; label: string }[];
  drafts: ReadState<DraftedNeedRow>;
  placements: ReadState<PlacementRow>;
  /** Titles of needs this agency may already see (its shares / drafts). */
  requestTitles: Readonly<Record<string, string>>;
  labels: AgencyDelegationLabels;
  locale: string;
}) {
  const [state, action, pending] = useActionState(draftClientNeedAction, IDLE);
  const input =
    "min-h-11 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary";

  return (
    <Card>
      <section className="flex flex-col gap-4" data-testid="agency-delegation">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {labels.title}
          </h2>
          <p className="text-sm text-text-secondary">{labels.intro}</p>
        </header>

        {connections.length > 0 ? (
          <form
            action={action}
            className="grid gap-2 sm:grid-cols-2"
            data-testid="agency-draft-need-form"
          >
            <DisplayedWorkspaceField />
            <label className="flex flex-col gap-1 text-meta text-text-muted sm:col-span-2">
              {labels.clientLabel}
              <select
                name="connectionId"
                className={input}
                data-testid="agency-draft-connection"
                defaultValue={connections[0].id}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-meta text-text-muted sm:col-span-2">
              {labels.needTitle}
              <input
                name="title"
                required
                maxLength={200}
                className={input}
                data-testid="agency-draft-title"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-text-muted">
              {labels.role}
              <input
                name="role"
                maxLength={120}
                className={input}
                data-testid="agency-draft-role"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-text-muted">
              {labels.teamSize}
              <input
                name="teamSize"
                type="number"
                min={1}
                className={input}
                data-testid="agency-draft-team-size"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-text-muted">
              {labels.location}
              <input
                name="location"
                maxLength={120}
                className={input}
                data-testid="agency-draft-location"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-text-muted">
              {labels.country}
              <input
                name="country"
                maxLength={2}
                className={input}
                data-testid="agency-draft-country"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-text-muted sm:col-span-2">
              {labels.summary}
              <textarea
                name="summary"
                maxLength={2000}
                rows={2}
                className={input}
                data-testid="agency-draft-summary"
              />
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-brand-blue px-3 py-2 text-sm font-semibold text-text-primary disabled:opacity-50"
                data-testid="agency-draft-submit"
              >
                {labels.draftSubmit}
              </button>
              {state.status === "ok" ? (
                <span
                  className="text-meta text-state-success"
                  role="status"
                  data-testid="agency-draft-saved"
                >
                  {labels.draftSaved}
                </span>
              ) : state.status !== "idle" ? (
                <span
                  className="text-meta text-state-warning"
                  role="status"
                  data-testid="agency-draft-failed"
                >
                  {labels.draftFailed}
                </span>
              ) : null}
            </div>
          </form>
        ) : null}

        <div className="flex flex-col gap-2">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.draftsTitle}
          </h3>
          {drafts.kind === "error" ? (
            <p className="text-sm text-text-muted">{labels.unavailable}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {drafts.rows.map((d) => (
                <li
                  key={d.requestId}
                  className="flex flex-wrap items-center gap-2 text-sm"
                  data-testid={`agency-draft-${d.requestId}`}
                  data-shared={d.shared ? "true" : "false"}
                >
                  <span className="font-medium text-text-primary">
                    {d.title}
                  </span>
                  <span
                    className={
                      d.shared
                        ? "text-meta text-state-success"
                        : "text-meta text-state-warning"
                    }
                  >
                    {d.shared ? labels.confirmedShared : labels.awaitingClient}
                  </span>
                  {d.shared ? (
                    <a
                      href={`/${locale}/dashboard/company/scouting?request=${d.requestId}`}
                      className="text-meta text-brand-blue hover:underline"
                      data-testid={`agency-draft-scouting-${d.requestId}`}
                    >
                      {labels.openScouting} →
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2" data-testid="agency-placements">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.placementsTitle}
          </h3>
          {placements.kind === "error" ? (
            <p className="text-sm text-text-muted">{labels.unavailable}</p>
          ) : placements.rows.length === 0 ? (
            <p className="text-sm text-text-muted">{labels.placementsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {placements.rows.map((p) => (
                <li
                  key={p.offerId}
                  className="rounded-md border border-ink-600 px-3 py-2 text-sm"
                  data-testid={`agency-placement-${p.offerId}`}
                >
                  <span className="font-medium text-text-primary">
                    {requestTitles[p.requestId] ?? "—"}
                  </span>
                  <ol className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-meta text-text-secondary">
                    {placementSteps(p).map((s) => (
                      <li
                        key={s.key}
                        data-testid={`agency-placement-step-${s.key}`}
                      >
                        {labels.lifecycle[s.key] ?? s.key}
                        {s.at ? ` · ${s.at.slice(0, 10)}` : ""}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Card>
  );
}

/** The placement's lifecycle as the steps that actually happened, in order. */
export function placementSteps(
  p: PlacementRow,
): { key: string; at: string | null }[] {
  const steps: { key: string; at: string | null }[] = [
    { key: "presented", at: p.offeredAt },
    { key: "clientAccepted", at: p.clientDecidedAt },
  ];
  if (p.bookingStatus) steps.push({ key: "workerProposed", at: null });
  if (p.bookingStatus === "accepted")
    steps.push({ key: "workerAccepted", at: p.workerDecidedAt });
  else if (p.bookingStatus === "declined")
    steps.push({ key: "workerDeclined", at: p.workerDecidedAt });
  else if (p.bookingStatus === "withdrawn" || p.bookingStatus === "expired") {
    steps.push({ key: `booking_${p.bookingStatus}`, at: null });
  }
  if (p.assignmentStatus) {
    steps.push({ key: "assigned", at: p.assignedAt });
    if (p.assignmentEndedAt || p.assignmentStatus === "ended")
      steps.push({ key: "assignmentEnded", at: p.assignmentEndedAt });
  }
  if (p.engagementStatus === "ended")
    steps.push({ key: "engagementEnded", at: p.engagementEndedAt });
  return steps;
}
