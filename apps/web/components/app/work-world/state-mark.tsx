import { cn } from "@/lib/utils";

import { evidenceVariant, type EvidenceStanding } from "./primitives";

/**
 * THE STATE VOCABULARY — one mark for what has happened to a piece of work.
 *
 * Every surface that says "recorded", "waiting", "confirmed", "returned",
 * "disputed" or "not known" uses THIS mark, so a person learns the shapes once
 * and reads them everywhere: the journal, the Living CV, a match, an agreement,
 * a project. A state is ALWAYS shape + word — never colour alone — so it holds
 * in light and dark, for colour-blind readers, and in print.
 *
 * The states follow the provenance ladder (product-truth SEP-1/SEP-3):
 *   recorded   somebody wrote it down (a ring — present, not yet checked)
 *   waiting    it is with someone else for a decision (dashed, turning)
 *   confirmed  a second party stands behind it (filled, with a check)
 *   returned   it was sent back for changes (a ring with a return arrow)
 *   disputed   two records disagree (a split ring)
 *   unknown    nothing can be said — NOT zero, NOT failed (SEP-7; dotted)
 *
 * Gold is deliberately absent from `confirmed`: gold is brand and waiting,
 * green is confirmation (visual-system-black-gold; BRAND ≠ CONFIRMATION).
 *
 * Pure and i18n-agnostic: the caller passes the resolved word.
 */
export type WorkState =
  | "recorded"
  | "waiting"
  | "confirmed"
  | "returned"
  | "disputed"
  | "unknown";

export const WORK_STATES: readonly WorkState[] = [
  "recorded",
  "waiting",
  "confirmed",
  "returned",
  "disputed",
  "unknown",
];

/**
 * The bridge from the canonical evidence standing (primitives.tsx — the
 * colour rule lives in `evidenceVariant`, once) to the state a person reads.
 * Only a confirmation by someone else is `confirmed`; a self-record is
 * `recorded`; two records that disagree are `disputed`; nothing known (or a
 * withdrawn record) is `unknown`.
 */
export function workStateOfStanding(standing: EvidenceStanding): WorkState {
  switch (evidenceVariant(standing)) {
    case "verified":
    case "attested":
      return "confirmed";
    case "contested":
      return "disputed";
    case "unknown":
      return "unknown";
    default:
      return "recorded";
  }
}

const TONE: Record<WorkState, string> = {
  recorded: "text-brand-cyan",
  waiting: "text-brand-blue",
  confirmed: "text-trust-accent",
  returned: "text-state-amber",
  disputed: "text-brand-orange",
  unknown: "text-text-muted",
};

export function StateGlyph({
  state,
  className,
}: {
  readonly state: WorkState;
  readonly className?: string;
}) {
  const common = {
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true,
    focusable: false,
    className: cn("h-4 w-4 shrink-0", TONE[state], className),
    "data-state": state,
  } as const;
  switch (state) {
    case "confirmed":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.6 8.2l2.3 2.3 4.5-4.7"
            stroke="rgb(var(--c-ink-900))"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "recorded":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      );
    case "waiting":
      return (
        <svg {...common} className={cn(common.className, "motion-safe:animate-[spin_9s_linear_infinite]")}>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="3 2.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "returned":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M10.6 8H5.6m0 0l2-2m-2 2l2 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "disputed":
      return (
        <svg {...common}>
          <path d="M8 1.8a6.2 6.2 0 010 12.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M8 1.8a6.2 6.2 0 000 12.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="1.2 2.4"
          />
        </svg>
      );
    case "unknown":
      return (
        <svg {...common}>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="0.1 3"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

/** The glyph and its word, sentence case. */
export function StateMark({
  state,
  children,
  className,
}: {
  readonly state: WorkState;
  /** The resolved word for this state, in the viewer's language. */
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-support text-text-secondary", className)}
      data-testid="state-mark"
      data-state={state}
    >
      <StateGlyph state={state} />
      <span>{children}</span>
    </span>
  );
}
