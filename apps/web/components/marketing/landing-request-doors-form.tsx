"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { submitRequestDoorAction, type RequestDoorResult } from "@/lib/staffing/request-door-actions";
import { REQUEST_DOORS, type RequestDoor } from "@/lib/staffing/request-doors";

export type RequestDoorLabels = {
  readonly doors: Readonly<Record<RequestDoor, { readonly title: string; readonly body: string }>>;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly country: string;
  readonly countryChoose: string;
  readonly city: string;
  readonly profession: string;
  readonly workers: string;
  readonly start: string;
  readonly details: string;
  readonly work: string;
  readonly place: string;
  readonly scope: string;
  readonly deadline: string;
  readonly need: string;
  readonly customer: string;
  readonly customerPrivate: string;
  readonly customerBusiness: string;
  readonly optional: string;
  readonly send: string;
  readonly sending: string;
  readonly receivedTitle: string;
  readonly receivedBody: string;
  readonly invalid: string;
  readonly limited: string;
  readonly unavailable: string;
};

const FIELD =
  "w-full min-h-11 rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
      <span>
        {label}
        {hint ? <span className="font-normal text-text-muted"> ({hint})</span> : null}
      </span>
      {children}
    </label>
  );
}

/**
 * The three doors and their one short form. `onSubmit` rather than a form `action`:
 * React resets a form after an action, and a person whose send failed must keep what
 * they typed. Strings come from the server component, so no message root is added.
 */
export function LandingRequestDoorsForm({
  labels,
  countries,
  notice,
}: {
  labels: RequestDoorLabels;
  countries: readonly { readonly code: string; readonly label: string }[];
  notice: ReactNode;
}) {
  const [door, setDoor] = useState<RequestDoor | null>(null);
  const [result, setResult] = useState<RequestDoorResult | null>(null);
  const [pending, start] = useTransition();
  const openedAt = useRef(0);

  function open(next: RequestDoor) {
    openedAt.current = Date.now();
    setDoor(next);
    setResult(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("started", String(openedAt.current));
    start(async () => {
      try {
        setResult(await submitRequestDoorAction(data));
      } catch {
        setResult("unavailable");
      }
    });
  }

  const optional = labels.optional;
  const problem =
    result === "invalid" ? labels.invalid : result === "limited" ? labels.limited : result === "unavailable" ? labels.unavailable : null;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {REQUEST_DOORS.map((d) => (
          <Card key={d} className="wow-card flex flex-col gap-3 p-5">
            <h3 className="font-display text-lg font-bold tracking-tightest text-text-primary">{labels.doors[d].title}</h3>
            <p className="text-sm leading-relaxed text-text-secondary">{labels.doors[d].body}</p>
            <div className="mt-auto pt-1">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full whitespace-normal rounded-xl"
                aria-expanded={door === d}
                aria-controls="request-door-form"
                data-testid={`request-door-${d}-open`}
                onClick={() => open(d)}
              >
                {labels.doors[d].title}
                <ArrowRight className="ml-1.5 size-3.5 shrink-0" aria-hidden />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {door ? (
        <div id="request-door-form" className="mt-3" data-testid="request-door-panel" data-door={door}>
        <Card className="p-5">
          {result === "received" ? (
            <div role="status" className="flex items-start gap-3" data-testid="request-door-received">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-state-success" aria-hidden />
              <div>
                <p className="font-display text-lg font-bold text-text-primary">{labels.receivedTitle}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">{labels.receivedBody}</p>
              </div>
            </div>
          ) : (
            <form key={door} onSubmit={submit} className="grid gap-3 sm:grid-cols-2" data-testid="request-door-form">
              <h3 className="font-display text-lg font-bold tracking-tightest text-text-primary sm:col-span-2">{labels.doors[door].title}</h3>
              <input type="hidden" name="door" value={door} />
              {/* Left empty by a person: out of sight, out of the tab order, not autofilled. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

              {door === "worker-search" ? (
                <>
                  <Field label={labels.profession}>
                    <input name="profession" required minLength={2} maxLength={200} className={FIELD} />
                  </Field>
                  <Field label={labels.workers}>
                    <input name="workers" type="number" inputMode="numeric" required min={1} max={100000} className={FIELD} />
                  </Field>
                </>
              ) : null}
              {door === "b2b" ? (
                <div className="sm:col-span-2">
                  <Field label={labels.work}>
                    <input name="work" required minLength={2} maxLength={200} className={FIELD} />
                  </Field>
                </div>
              ) : null}
              {door === "project" ? (
                <>
                  <div className="sm:col-span-2">
                    <Field label={labels.need}>
                      <textarea name="need" required minLength={2} maxLength={4000} rows={3} className={FIELD} />
                    </Field>
                  </div>
                  <fieldset className="flex flex-col gap-1 text-xs font-medium text-text-secondary sm:col-span-2">
                    <legend className="mb-1">{labels.customer}</legend>
                    <div className="flex flex-wrap gap-4 text-sm text-text-primary">
                      <label className="flex min-h-11 items-center gap-2">
                        <input type="radio" name="customer" value="private" defaultChecked />
                        {labels.customerPrivate}
                      </label>
                      <label className="flex min-h-11 items-center gap-2">
                        <input type="radio" name="customer" value="business" />
                        {labels.customerBusiness}
                      </label>
                    </div>
                  </fieldset>
                </>
              ) : null}

              <Field label={door === "worker-search" ? labels.country : labels.place}>
                <select name="country" required defaultValue="" className={FIELD}>
                  <option value="" disabled>
                    {labels.countryChoose}
                  </option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              {door === "worker-search" ? (
                <Field label={labels.start} hint={optional}>
                  <input name="start" type="date" className={FIELD} />
                </Field>
              ) : (
                <Field label={labels.city} hint={optional}>
                  <input name="city" maxLength={160} className={FIELD} />
                </Field>
              )}

              {door === "worker-search" ? (
                <div className="sm:col-span-2">
                  <Field label={labels.details} hint={optional}>
                    <textarea name="details" maxLength={2000} rows={2} className={FIELD} />
                  </Field>
                </div>
              ) : null}
              {door === "b2b" ? (
                <>
                  <Field label={labels.scope} hint={optional}>
                    <input name="scope" maxLength={2000} className={FIELD} />
                  </Field>
                  <Field label={labels.deadline} hint={optional}>
                    <input name="deadline" maxLength={40} className={FIELD} />
                  </Field>
                </>
              ) : null}

              <Field label={labels.name}>
                <input name="name" required minLength={2} maxLength={200} autoComplete="organization" className={FIELD} />
              </Field>
              <Field label={labels.email}>
                <input name="email" type="email" required maxLength={254} autoComplete="email" className={FIELD} />
              </Field>
              <Field label={labels.phone} hint={optional}>
                <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={FIELD} />
              </Field>

              <p className="text-xs leading-relaxed text-text-muted sm:col-span-2">{notice}</p>
              {problem ? (
                <p role="alert" className="text-sm text-state-danger sm:col-span-2" data-testid="request-door-problem">
                  {problem}
                </p>
              ) : null}
              <div className="sm:col-span-2">
                <Button type="submit" className="min-h-11 rounded-xl" disabled={pending} data-testid="request-door-send">
                  {pending ? labels.sending : labels.send}
                </Button>
              </div>
            </form>
          )}
        </Card>
        </div>
      ) : null}
    </>
  );
}
