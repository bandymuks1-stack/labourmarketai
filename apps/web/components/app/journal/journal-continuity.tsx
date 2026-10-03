import type { ReactNode } from "react";
import {
  BadgeCheck,
  Camera,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  Hammer,
  UserCheck,
} from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * JOURNAL CONTINUITY — where this record sits in the chain it belongs to:
 *
 *   INSTRUCTION → PERFORMED WORK → TIME → EVIDENCE → MANAGER REVIEW →
 *   CONFIRMATION / RETURN → PROJECT HISTORY → PROFESSIONAL HISTORY
 *
 * The journal is not a feed; it is the middle of a chain. Each station is a
 * real destination (deep link that keeps its context) and, where the page
 * already holds the figure, carries it. Two kinds of station, drawn
 * differently so a door is never mistaken for a measurement:
 *   · MEASURED — a count/duration from the rows this page already loaded.
 *                Filled circle when there is something, dashed when none.
 *                A figure that could not be read is "—" in words, never 0.
 *   · DOOR     — a place the chain continues (planning, project, CV): ringed
 *                circle with an arrow, no number (we do not invent one).
 * The line between stations is solid only between two stations that both
 * hold something. Presentational, server-safe, no state, no data access.
 * Works without photos: shape, rail and numbers carry the premium feel.
 */

export type ContinuityKey =
  | "instruction"
  | "work"
  | "time"
  | "evidence"
  | "review"
  | "confirmed"
  | "project"
  | "history";

export interface ContinuityStation {
  readonly key: ContinuityKey;
  readonly kind: "measured" | "door";
  /** Measured stations only. `null` = could not be read ("—", never 0). */
  readonly value: string | null;
  /** Whether the station holds anything (value > 0). Doors: always false. */
  readonly active: boolean;
  /** Extra state that needs attention (e.g. entries returned for changes). */
  readonly attention?: string | null;
  readonly href: string;
  readonly label: string;
  readonly unit: string;
}

const ICON: Record<ContinuityKey, ReactNode> = {
  instruction: <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  work: <Hammer className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  time: <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  evidence: <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  review: <UserCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  confirmed: <BadgeCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  project: <FolderKanban className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  history: <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
};

export function JournalContinuity({
  title,
  intro,
  stations,
}: {
  readonly title: string;
  readonly intro: string;
  readonly stations: readonly ContinuityStation[];
}) {
  const reached = stations.map((s) => s.active);
  const last = stations.length - 1;
  return (
    <nav
      aria-label={title}
      className="relative overflow-hidden rounded-2xl border border-ink-600 bg-surface-1/50 p-3 sm:p-4"
      data-testid="journal-continuity"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_0%_0%,rgb(var(--c-brand-blue)/0.10),transparent_70%)]"
      />
      <div className="flex flex-col gap-0.5 px-1">
        <h2 className="font-display text-base font-semibold tracking-tightest text-text-primary">{title}</h2>
        <p className="text-meta text-text-secondary">{intro}</p>
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-y-3 lg:grid-cols-8">
        {stations.map((s, i) => {
          const leftOn = i > 0 && reached[i] && reached[i - 1];
          const rightOn = i < last && reached[i] && reached[i + 1];
          // Mobile rows hold 4 stations, desktop one row of 8: the rail is
          // trimmed at the row edges on each, never run off the grid.
          const leftHide = i === 0 ? "invisible" : i % 4 === 0 ? "invisible lg:visible" : "";
          const rightHide = i === last ? "invisible" : i % 4 === 3 ? "invisible lg:visible" : "";
          const measured = s.kind === "measured";
          return (
            <li key={s.key} data-station={s.key} data-kind={s.kind} data-active={s.active ? "true" : "false"} className="relative">
              <span aria-hidden className={cn("absolute left-0 top-[1.05rem] w-1/2", leftHide, leftOn ? "h-0.5 bg-brand-blue/70" : "h-0 border-t-2 border-dashed border-ink-500")} />
              <span aria-hidden className={cn("absolute left-1/2 top-[1.05rem] w-1/2", rightHide, rightOn ? "h-0.5 bg-brand-blue/70" : "h-0 border-t-2 border-dashed border-ink-500")} />
              <Link
                href={s.href as "/dashboard"}
                className="group relative flex min-h-11 flex-col items-center gap-1 rounded-lg px-0.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid={`journal-continuity-${s.key}`}
              >
                <span
                  className={cn(
                    "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 bg-ink-900 transition-colors group-hover:border-brand-blue",
                    measured && s.active && "border-brand-blue bg-brand-blue/15 text-brand-blue",
                    measured && !s.active && "border-dashed border-ink-500 text-text-secondary",
                    !measured && "border-ink-500 text-text-secondary",
                    s.attention && "border-state-warning text-state-warning",
                  )}
                >
                  {ICON[s.key]}
                </span>
                <span className="text-meta font-semibold leading-tight text-text-primary">{s.label}</span>
                {measured ? (
                  <span className="font-display text-lg font-bold leading-none tabular-nums text-text-primary">
                    {s.value ?? "—"}
                  </span>
                ) : (
                  <span aria-hidden className="font-display text-lg font-bold leading-none text-text-muted">
                    →
                  </span>
                )}
                <span className="text-meta leading-tight text-text-secondary">{s.unit}</span>
                {s.attention ? (
                  <span className="text-meta font-semibold leading-tight text-state-warning">{s.attention}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
