/**
 * ModuleTile — a presentational tile for the landing system scene.
 *
 * Landing-only marketing surface that labels one part of the connected
 * labour-market layer (work evidence, team, project, communication, company,
 * HR & customers, action centre, opportunities). It holds no data and is not
 * a profile / player-card / communication concept — it only illustrates the
 * connected layer. Status uses the shared StatusChip.
 */
import type { ChipTone } from "@/components/ui/StatusChip";
import { StatusChip } from "@/components/ui/StatusChip";

export function ModuleTile({
  glyph,
  label,
  hint,
  tone = "info",
  status,
  progress,
  live = false,
  className = "",
}: {
  glyph: string;
  label: string;
  hint: string;
  tone?: ChipTone;
  status?: string;
  progress?: number;
  live?: boolean;
  className?: string;
}) {
  const dotClass =
    tone === "gold"
      ? "live-dot gold"
      : tone === "info"
        ? "live-dot blue"
        : tone === "warn"
          ? "live-dot gold"
          : tone === "neutral" || tone === "muted"
            ? "live-dot violet"
            : "live-dot";

  return (
    <div className={`module flex flex-col gap-2 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-md border border-line/70 bg-fg/[0.03] text-sm text-fg-dim"
        >
          {glyph}
        </span>
        {live ? <span aria-hidden className={dotClass} /> : null}
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">{label}</p>
        <p className="mt-0.5 text-[0.72rem] leading-snug text-fg-mute">
          {hint}
        </p>
      </div>
      {typeof progress === "number" ? (
        <div className="mt-1 bar" aria-hidden>
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
      {status ? (
        <div className="mt-1">
          <StatusChip tone={tone} dot>
            {status}
          </StatusChip>
        </div>
      ) : null}
    </div>
  );
}
