import { cn } from "@/lib/utils";

/**
 * THE RELATION RAIL — where this thing sits in the work graph.
 *
 * REAL WORK → EVIDENCE → HISTORY → CAPABILITY → NEXT is one chain, and every
 * screen shows one link of it. The rail shows the whole chain once, quietly,
 * with the links that are TRUE for this person marked done and the next one
 * marked as the way forward. It is a map of what the data already knows, never
 * a progress bar to be filled: a link is `done` only when the record behind it
 * exists, and `open` links are offered, not scolded.
 */
export type RailStage = {
  readonly id: string;
  readonly label: string;
  readonly state: "done" | "current" | "open";
};

export function RelationRail({
  stages,
  label,
  className,
}: {
  readonly stages: readonly RailStage[];
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={cn("flex w-full items-start", className)}
      data-testid="relation-rail"
    >
      {stages.map((s, i) => (
        <li
          key={s.id}
          data-state={s.state}
          className="relative flex min-w-0 flex-1 flex-col items-start gap-1.5"
        >
          <span className="flex w-full items-center">
            <span
              aria-hidden
              className={cn(
                "box-border h-2.5 w-2.5 shrink-0 rounded-full border-2",
                s.state === "done" && "border-trust-accent bg-trust-accent",
                s.state === "current" &&
                  "border-brand-blue bg-brand-blue shadow-[0_0_0_4px_rgb(var(--c-brand-blue)/0.18)]",
                s.state === "open" && "border-dashed border-ink-500 bg-transparent",
              )}
            />
            {i < stages.length - 1 ? (
              <span
                aria-hidden
                className={cn("ml-1 h-px flex-1", s.state === "done" ? "bg-trust-accent/60" : "bg-ink-600")}
              />
            ) : null}
          </span>
          <span
            className={cn(
              "pr-2 text-meta leading-tight",
              s.state === "open" ? "text-text-muted" : "text-text-secondary",
              s.state === "current" && "text-text-primary",
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
