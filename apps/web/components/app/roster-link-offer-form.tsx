"use client";

import { useActionState } from "react";

import {
  offerRosterLinkAction,
  type RosterLinkOfferResult,
} from "@/lib/organization-evidence/roster-link-actions";

/**
 * "This roster name is that worker" — the manager's OFFER, inline on the
 * roster row. One choice among the workers already in an active relationship
 * with the organization (the database admits nobody else), one control. The
 * person accepts or refuses on their own profile; until then the row reads
 * "link proposed" and their imported history reaches nobody.
 */
export interface RosterLinkCandidate {
  readonly workerId: string;
  readonly profileId: string;
  readonly name: string;
}

export function RosterLinkOfferForm({
  personId,
  candidates,
  labels,
}: {
  personId: string;
  candidates: readonly RosterLinkCandidate[];
  labels: {
    readonly label: string;
    readonly choose: string;
    readonly offer: string;
    readonly offered: string;
    readonly error: string;
  };
}) {
  const [state, submit, pending] = useActionState<RosterLinkOfferResult | null, FormData>(
    offerRosterLinkAction,
    null,
  );
  if (state?.ok) {
    return (
      <span className="font-mono text-meta text-state-success" data-testid={`roster-link-offered-${personId}`}>
        {labels.offered}
      </span>
    );
  }
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2" data-testid={`roster-link-offer-${personId}`}>
      <input type="hidden" name="person_id" value={personId} />
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <span className="sr-only">{labels.label}</span>
        <select
          name="worker"
          required
          defaultValue=""
          className="min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 text-xs text-text-primary"
          data-testid={`roster-link-worker-${personId}`}
        >
          <option value="" disabled>
            {labels.choose}
          </option>
          {candidates.map((c) => (
            <option key={c.workerId} value={`${c.workerId}:${c.profileId}`}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending || candidates.length === 0}
        className="min-h-9 rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
      >
        {labels.offer}
      </button>
      {state && !state.ok ? (
        <span className="font-mono text-meta text-state-danger" data-testid={`roster-link-error-${personId}`} data-code={state.code}>
          {labels.error}
        </span>
      ) : null}
    </form>
  );
}
