"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  retirePlacementTermAction,
  setPlacementTermAction,
  type PlacementTermActionState,
} from "@/lib/agency/placement-terms-actions";

/**
 * THE AGENCY'S PLACEMENT TERM — stated by the agency, shown to employers on
 * its candidates, accepted by an employer only when accepting a candidate.
 *
 * One current term. Saving a new one retires the old (the term an employer
 * already accepted is never edited). Nothing here prices the platform: the
 * agency writes its own amount, currency and condition.
 */
export type PlacementTermFormLabels = {
  readonly title: string;
  readonly intro: string;
  readonly current: string;
  readonly none: string;
  readonly amount: string;
  readonly currency: string;
  readonly condition: string;
  readonly conditionHint: string;
  readonly termsUrl: string;
  readonly termsUrlHint: string;
  readonly save: string;
  readonly saving: string;
  readonly retire: string;
  readonly saved: string;
  readonly retired: string;
  readonly unavailable: string;
  readonly errors: Readonly<Record<string, string>>;
};

const IDLE: PlacementTermActionState = { status: "idle" };

export function PlacementTermForm({
  companyId,
  locale,
  current,
  unavailable,
  labels,
}: {
  companyId: string;
  locale: string;
  current: {
    readonly feeLine: string;
    readonly conditionText: string;
    readonly conditionLanguage: string;
    readonly termsUrl: string | null;
    readonly feeAmount: number;
    readonly currency: string;
  } | null;
  unavailable: boolean;
  labels: PlacementTermFormLabels;
}) {
  const [state, submit, pending] = useActionState(setPlacementTermAction, IDLE);
  const [retireState, retire, retiring] = useActionState(retirePlacementTermAction, IDLE);
  const busy = pending || retiring;
  const shown = retireState.status === "ok" ? retireState : state;

  return (
    <Card className="flex flex-col gap-3" data-testid="agency-placement-term">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{labels.title}</h2>
        <p className="text-sm text-text-secondary">{labels.intro}</p>
      </header>

      {unavailable ? (
        <p className="text-sm text-text-muted" data-testid="agency-placement-term-unavailable">
          {labels.unavailable}
        </p>
      ) : (
        <>
          {current ? (
            <div
              className="flex flex-col gap-1 rounded-md border border-ink-500 bg-ink-800/40 p-3"
              data-testid="agency-placement-term-current"
            >
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.current}</p>
              <p className="text-sm font-semibold text-text-primary">{current.feeLine}</p>
              <p className="text-xs text-text-secondary" lang={current.conditionLanguage}>
                {current.conditionText}
              </p>
              {current.termsUrl ? (
                <p className="break-all text-xs text-text-muted">{current.termsUrl}</p>
              ) : null}
              <form action={retire} className="pt-1">
                <input type="hidden" name="company_id" value={companyId} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={busy}
                  aria-busy={retiring}
                  data-testid="agency-placement-term-retire"
                >
                  {labels.retire}
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-text-muted" data-testid="agency-placement-term-none">
              {labels.none}
            </p>
          )}

          <form action={submit} className="flex flex-col gap-3" data-testid="agency-placement-term-form">
            <input type="hidden" name="company_id" value={companyId} />
            <input type="hidden" name="condition_language" value={locale} />
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex min-w-0 flex-col gap-1 sm:w-40">
                <Label htmlFor="placement-term-amount">{labels.amount}</Label>
                <Input
                  id="placement-term-amount"
                  name="fee_amount"
                  inputMode="decimal"
                  required
                  defaultValue={current ? String(current.feeAmount) : ""}
                  data-testid="agency-placement-term-amount"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1 sm:w-28">
                <Label htmlFor="placement-term-currency">{labels.currency}</Label>
                <Input
                  id="placement-term-currency"
                  name="currency"
                  required
                  maxLength={3}
                  defaultValue={current?.currency ?? "EUR"}
                  className="uppercase"
                  data-testid="agency-placement-term-currency"
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="placement-term-condition">{labels.condition}</Label>
              <textarea
                id="placement-term-condition"
                name="condition_text"
                required
                maxLength={1000}
                rows={3}
                defaultValue={current?.conditionText ?? ""}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
                data-testid="agency-placement-term-condition"
              />
              <p className="text-meta text-text-muted">{labels.conditionHint}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="placement-term-url">{labels.termsUrl}</Label>
              <Input
                id="placement-term-url"
                name="terms_url"
                type="url"
                maxLength={500}
                placeholder="https://"
                defaultValue={current?.termsUrl ?? ""}
                data-testid="agency-placement-term-url"
              />
              <p className="text-meta text-text-muted">{labels.termsUrlHint}</p>
            </div>
            <div>
              <Button
                type="submit"
                variant="secondary"
                className="min-h-11"
                disabled={busy}
                aria-busy={pending}
                data-testid="agency-placement-term-save"
              >
                {pending ? labels.saving : labels.save}
              </Button>
            </div>
          </form>
          <div role="status" aria-live="polite">
            {shown.status === "ok" ? (
              <p className="text-xs text-state-success" data-testid="agency-placement-term-done">
                {shown.outcome === "set" ? labels.saved : labels.retired}
              </p>
            ) : shown.status === "error" ? (
              <p className="text-xs text-state-danger" data-testid="agency-placement-term-error">
                {labels.errors[shown.code] ?? labels.errors.error}
              </p>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
