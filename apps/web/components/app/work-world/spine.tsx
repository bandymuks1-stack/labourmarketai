import { cn } from "@/lib/utils";

import { evidenceVariant, type EvidenceStanding } from "./primitives";

/**
 * THE TIMELINE SPINE — the work-world spine, made aware of time.
 *
 * `WorkSpine` / `WorkSpineNode` (primitives.tsx — frozen with the landing)
 * draw real work on one cyan thread with a diamond per record, coloured by the
 * record's evidence standing. This is the SAME motif — the cyan thread and the
 * diamond node — extended with the one thing a history needs and that file
 * cannot gain without regenerating the landing baseline: WHERE IN TIME each
 * node sits.
 *
 *   now   the present — a filled gold diamond
 *   past  something that happened — a quiet cyan diamond (green and solid
 *         when `standing` says someone else confirmed it: design rule #4)
 *   next  not history yet — a dashed gold diamond; the thread to it is dashed
 *   gap   a period with nothing known — a dotted diamond (UNKNOWN ≠ ZERO)
 *
 * The Living CV, a day of journal entries, a project's history and the steps
 * of an agreement are the same shape, so they use the same component. New
 * surfaces use this; the old pair stays for the surfaces it already serves.
 */
export type SpinePosition = "now" | "past" | "next" | "gap";

export function Spine({
  children,
  label,
  className,
  testId,
}: {
  readonly children: React.ReactNode;
  readonly label?: string;
  readonly className?: string;
  readonly testId?: string;
}) {
  return (
    <ol aria-label={label} className={cn("relative flex list-none flex-col", className)} data-testid={testId}>
      {children}
    </ol>
  );
}

const NODE: Record<SpinePosition, string> = {
  now: "border-brand-blue bg-brand-blue shadow-[0_0_0_4px_rgb(var(--c-brand-blue)/0.18)]",
  past: "border-brand-cyan bg-ink-900",
  next: "border-dashed border-brand-blue bg-ink-900",
  gap: "border-dotted border-ink-500 bg-ink-900",
};

export function SpineItem({
  position = "past",
  standing,
  children,
  className,
  testId,
  ...data
}: {
  readonly position?: SpinePosition;
  /** The record's evidence standing, when the item IS a record. A confirmation
   *  by someone else turns a past node green and solid; nothing else does. */
  readonly standing?: EvidenceStanding;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly testId?: string;
  readonly [key: `data-${string}`]: string | undefined;
}) {
  const confirmed =
    position === "past" &&
    standing !== undefined &&
    (evidenceVariant(standing) === "verified" || evidenceVariant(standing) === "attested");
  return (
    <li
      data-position={position}
      data-testid={testId}
      {...data}
      className={cn(
        "relative pb-9 pl-9 last:pb-0",
        // the thread: from this node down to the next one
        "before:absolute before:left-[0.4375rem] before:top-4 before:h-full before:w-0.5",
        position === "next"
          ? "before:border-l-2 before:border-dashed before:border-brand-blue/40"
          : "before:bg-gradient-to-b before:from-brand-cyan/45 before:to-brand-cyan/15",
        "last:before:hidden",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-[0.4rem] box-border h-3.5 w-3.5 rotate-45 rounded-[3px] border-2",
          confirmed ? "border-trust-accent bg-trust-accent" : NODE[position],
        )}
      />
      {children}
    </li>
  );
}
