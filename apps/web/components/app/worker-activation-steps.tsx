import type { ActivationStep } from "@/lib/privacy/worker-activation-steps";

export interface WorkerActivationLabels {
  title: string;
  intro: string;
  steps: Record<ActivationStep["key"], { title: string; hint?: string }>;
  stateDone: string;
  stateOpen: string;
  stateUnknown: string;
  go: string;
}

/**
 * The next-step list for a worker who arrived through the inbound campaign.
 * Presentational only: it shows where each existing control is and whether the
 * person has already answered it. It carries NO action that writes anything -
 * every consent and the declaration stay on the controls below it.
 */
export function WorkerActivationSteps({
  steps,
  labels,
  locale,
}: {
  steps: readonly ActivationStep[];
  labels: WorkerActivationLabels;
  /** Prefixes the one non-anchor door (the profile page). */
  locale: string;
}) {
  const stateLabel = (s: ActivationStep["state"]): string | null =>
    s === "done"
      ? labels.stateDone
      : s === "open"
        ? labels.stateOpen
        : s === "unknown"
          ? labels.stateUnknown
          : null;
  const linkClass =
    "inline-flex min-h-11 items-center text-sm font-medium text-brand-blue hover:text-brand-champagne";
  return (
    <section
      className="card-border p-5"
      data-testid="privacy-activation"
      aria-labelledby="privacy-activation-title"
    >
      <h2
        id="privacy-activation-title"
        className="font-display text-xl font-bold text-text-primary"
      >
        {labels.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
        {labels.intro}
      </p>
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step, i) => {
          const copy = labels.steps[step.key];
          const state = stateLabel(step.state);
          return (
            <li
              key={step.key}
              data-testid={`activation-step-${step.key}`}
              data-state={step.state}
              className="flex flex-col gap-1 rounded-md border border-ink-500 px-3 py-2"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-text-primary">
                  {i + 1}. {copy.title}
                </span>
                {state ? (
                  <span className="rounded-sm border border-ink-500 bg-ink-800/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                    {state}
                  </span>
                ) : null}
              </span>
              {copy.hint ? (
                <span className="text-xs leading-relaxed text-text-muted">
                  {copy.hint}
                </span>
              ) : null}
              <a
                href={step.href.startsWith("#") ? step.href : `/${locale}${step.href}`}
                className={linkClass}
              >
                {labels.go} →
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
