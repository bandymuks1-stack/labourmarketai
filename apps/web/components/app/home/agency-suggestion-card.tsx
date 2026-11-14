"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  joinSuggestedAgencyAction,
  type JoinSuggestedAgencyState,
} from "@/lib/agency/agency-suggestion-actions";

/**
 * A RECRUITMENT AGENCY THE WORKER MAY CHOOSE TO JOIN — never pre-selected,
 * never blocking anything, gone for good with "not now".
 *
 * Joining is the person's own tick plus one press: they go onto the agency's
 * list of candidates (its existing roster), which they can leave at any time
 * on their profile. Nothing else happens to their account.
 */
export type AgencySuggestionLabels = {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly leave: string;
  readonly consent: string;
  readonly join: string;
  readonly joining: string;
  readonly notNow: string;
  readonly joined: string;
  readonly errors: Readonly<Record<string, string>>;
};

const IDLE: JoinSuggestedAgencyState = { status: "idle" };
const storageKey = (companyId: string) => `lm:agency-suggestion:${companyId}`;

export function AgencySuggestionCard({
  companyId,
  consentTextVersion,
  labels,
}: {
  companyId: string;
  consentTextVersion: string;
  labels: AgencySuggestionLabels;
}) {
  const [state, submit, pending] = useActionState(joinSuggestedAgencyAction, IDLE);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey(companyId)) === "dismissed") setDismissed(true);
    } catch {
      /* storage unavailable: the card simply stays */
    }
  }, [companyId]);

  if (dismissed) return null;

  if (state.status === "ok") {
    return (
      <section data-testid="agency-suggestion" data-state="joined">
        <Card compact>
          <p role="status" className="text-sm text-state-success" data-testid="agency-suggestion-joined">
            {labels.joined}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section data-testid="agency-suggestion" data-state="open">
      <Card compact className="flex flex-col gap-2">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.eyebrow}</p>
        <h2 className="font-display text-base font-semibold text-text-primary">{labels.title}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{labels.body}</p>
        <p className="text-meta leading-relaxed text-text-muted">{labels.leave}</p>
        <form action={submit} className="flex flex-col gap-2">
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="consent_text_version" value={consentTextVersion} />
          <label className="flex min-h-11 items-start gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              name="consent"
              value="yes"
              required
              className="mt-1 h-4 w-4 shrink-0"
              data-testid="agency-suggestion-consent"
            />
            <span>{labels.consent}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={pending}
              aria-busy={pending}
              data-testid="agency-suggestion-join"
            >
              {pending ? labels.joining : labels.join}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                try {
                  window.localStorage.setItem(storageKey(companyId), "dismissed");
                } catch {
                  /* storage unavailable: hidden for this visit only */
                }
                setDismissed(true);
              }}
              data-testid="agency-suggestion-not-now"
            >
              {labels.notNow}
            </Button>
          </div>
          <div role="status" aria-live="polite">
            {state.status === "error" ? (
              <p className="text-xs text-state-danger" data-testid="agency-suggestion-error">
                {labels.errors[state.code] ?? labels.errors.error}
              </p>
            ) : null}
          </div>
        </form>
      </Card>
    </section>
  );
}
