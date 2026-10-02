import type { EpistemicState } from "@/lib/planning/time-lens";
import { cn } from "@/lib/utils";

/**
 * THE EPISTEMIC MARK — how sure the surface is about what it draws.
 *
 * A time surface that paints a plan, a fact and a gap the same way lies. Each
 * state has its OWN shape as well as its own tone, so it never depends on hue
 * alone (WCAG 1.4.1): a solid dot is in effect, a hollow dashed dot is only
 * planned, a square is something that happened, a tick is confirmed by
 * someone else, a plus is a need nobody has covered, a dash is a field the
 * source never carried, and a question mark is a read that did not answer.
 *
 * `label` is caller-localized; `data-state` lets a guard assert that a plan is
 * never drawn as a record.
 */
const TONE: Record<EpistemicState, string> = {
  known: "text-brand-blue border-brand-blue/50",
  planned: "text-text-secondary border-dashed border-border-subtle",
  recorded: "text-brand-cyan border-brand-cyan/40",
  confirmed: "text-trust-accent border-trust-accent/50",
  openNeed: "text-state-warning border-dashed border-state-warning/60",
  notProvided: "text-text-muted border-dashed border-border-subtle",
  unknown: "text-text-muted border-dotted border-border-subtle",
};

export function EpistemicGlyph({ state, className }: { state: EpistemicState; className?: string }) {
  const common = cn("size-2.5 shrink-0", className);
  switch (state) {
    case "known":
      return <span aria-hidden className={cn(common, "rounded-full bg-current")} />;
    case "planned":
      return <span aria-hidden className={cn(common, "rounded-full border border-dashed border-current")} />;
    case "recorded":
      return <span aria-hidden className={cn(common, "rounded-[2px] bg-current")} />;
    case "confirmed":
      return (
        <svg aria-hidden viewBox="0 0 10 10" className={common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 5.5 4 8 8.5 2" />
        </svg>
      );
    case "openNeed":
      return (
        <svg aria-hidden viewBox="0 0 10 10" className={common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M5 1.5v7M1.5 5h7" />
        </svg>
      );
    case "notProvided":
      return (
        <svg aria-hidden viewBox="0 0 10 10" className={common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2 5h6" />
        </svg>
      );
    case "unknown":
      return (
        <span aria-hidden className={cn(common, "inline-flex items-center justify-center text-[0.65rem] font-bold leading-none")}>
          ?
        </span>
      );
  }
}

export function EpistemicMark({
  state,
  label,
  className,
}: {
  readonly state: EpistemicState;
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <span
      data-testid="wit-epistemic"
      data-state={state}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-meta font-medium",
        TONE[state],
        className,
      )}
    >
      <EpistemicGlyph state={state} />
      {label}
    </span>
  );
}
