/**
 * ModuleTile — a lean presentational tile for the landing system scene.
 *
 * Landing-only marketing surface that labels one connected part of the
 * labour-market layer. It holds no data and is not a profile / player-card /
 * communication concept — purely illustrative. Status uses the shared
 * StatusChip.
 */
import type { ChipTone } from "@/components/ui/StatusChip";
import { StatusChip } from "@/components/ui/StatusChip";

export function ModuleTile({
  glyph,
  label,
  sub,
  tone = "info",
  status,
  live = false,
  className = "",
}: {
  glyph: string;
  label: string;
  sub?: string;
  tone?: ChipTone;
  status?: string;
  live?: boolean;
  className?: string;
}) {
  const dot =
    tone === "gold"
      ? "live-dot gold"
      : tone === "info"
        ? "live-dot blue"
        : tone === "neutral" || tone === "muted"
          ? "live-dot violet"
          : "live-dot";

  return (
    <div className={`module flex items-center gap-3 ${className}`}>
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line/70 bg-fg/[0.04] text-sm text-fg-dim"
      >
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">
          {label}
        </p>
        {sub ? (
          <p className="mt-0.5 truncate text-[0.72rem] text-fg-mute">{sub}</p>
        ) : null}
      </div>
      {status ? (
        <StatusChip tone={tone} dot>
          {status}
        </StatusChip>
      ) : live ? (
        <span aria-hidden className={dot} />
      ) : null}
    </div>
  );
}
