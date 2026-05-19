/**
 * ProjectCard — a presentational example of an active work/project surface.
 *
 * Landing-only product preview (clearly labelled by the scene). It holds no
 * data and does not duplicate any product concept — it only shows the kind of
 * real work/project context the connected layer carries. No real client, no
 * market metric: the percentage is an illustrative example of one project's
 * own progress.
 */
import { StatusChip } from "@/components/ui/StatusChip";

export function ProjectCard({
  title,
  place,
  progress,
  state,
  className = "",
}: {
  title: string;
  place: string;
  progress: number;
  state: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className={`module ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.66rem] uppercase tracking-[0.16em] text-fg-mute">
            Active project
          </p>
          <p className="mt-1 truncate text-sm font-semibold">{title}</p>
          <p className="mt-0.5 truncate text-[0.72rem] text-fg-mute">
            {place}
          </p>
        </div>
        <StatusChip tone="positive" dot>
          {state}
        </StatusChip>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-fg-dim">
        <span>Progress</span>
        <span className="tabular-nums text-fg">{pct}%</span>
      </div>
      <div className="mt-2 bar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
