import { cn } from "@/lib/utils";

/**
 * THE JOURNEY STRIP — one visual grammar for "how far has this got": a need
 * moving to accepted people (company), a presented candidate moving to a
 * placement (agency). Same world, two perspectives (owner command
 * 2026-09-29 §15, §18–§19).
 *
 * Presentational only: it draws the steps it is GIVEN, each already labelled
 * by its caller, with the caller's own test ids. It reads nothing and knows
 * nothing about projects, journals, hours or other workers — so mounting it
 * on an agency surface can never widen what the agency sees.
 *
 * Phone: a vertical spine. From `sm`: one horizontal line of nodes.
 * State is never colour alone: `current` is bold, `ended` is struck through
 * words the caller supplies, and every step carries its label as text.
 */
export interface JourneyStripStep {
  readonly key: string;
  readonly label: string;
  /** A count or a date, already formatted — or null. */
  readonly detail: string | null;
  readonly state: "done" | "current" | "upcoming" | "ended";
  /** The caller's own per-step test id (kept stable for its guards). */
  readonly testid?: string;
}

const NODE: Record<JourneyStripStep["state"], string> = {
  done: "border-brand-cyan bg-brand-cyan/70",
  current: "border-brand-blue bg-brand-blue shadow-[0_0_14px_-2px_rgb(var(--c-brand-blue)/0.7)]",
  upcoming: "border-dashed border-ink-500 bg-transparent",
  ended: "border-state-amber bg-state-amber/40",
};

export function JourneyStrip({
  steps,
  ariaLabel,
  testid,
}: {
  steps: readonly JourneyStripStep[];
  ariaLabel: string;
  testid?: string;
}) {
  return (
    <ol
      aria-label={ariaLabel}
      data-testid={testid}
      className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0"
    >
      {steps.map((s, i) => (
        <li
          key={s.key}
          data-testid={s.testid}
          data-state={s.state}
          className="relative flex min-w-0 flex-1 items-start gap-2.5 pb-3 last:pb-0 sm:flex-col sm:items-center sm:gap-1.5 sm:pb-0 sm:text-center"
        >
          {/* the connecting line to the next step */}
          {i < steps.length - 1 ? (
            <span
              aria-hidden
              className={cn(
                "absolute left-[5px] top-3 h-full w-px sm:left-1/2 sm:top-[5px] sm:h-px sm:w-full",
                s.state === "done" || s.state === "current" ? "bg-brand-cyan/50" : "bg-ink-600",
              )}
            />
          ) : null}
          <span aria-hidden className={cn("relative z-10 mt-0.5 size-[11px] shrink-0 rounded-full border-2 sm:mt-0", NODE[s.state])} />
          <span className="flex min-w-0 flex-col sm:items-center">
            <span
              className={cn(
                "text-support leading-tight",
                s.state === "current"
                  ? "font-semibold text-text-primary"
                  : s.state === "upcoming"
                    ? "text-text-muted"
                    : s.state === "ended"
                      ? "text-state-amber"
                      : "text-text-secondary",
              )}
            >
              {s.label}
            </span>
            {s.detail ? (
              <span className="font-mono text-meta tabular-nums text-text-muted">{s.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
