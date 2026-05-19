/**
 * StatusChip — the one status-chip primitive.
 *
 * Every state label (availability, hiring, provider state, preview-data
 * notice, match strength) uses this. Ad-hoc chip markup must not be
 * reintroduced and there is no second chip system. Colour comes from the
 * token layer (`globals.css`), never hardcoded here.
 */
export type ChipTone = "neutral" | "positive" | "info" | "warn" | "muted";

const TONE: Record<ChipTone, string> = {
  neutral: "text-fg-dim",
  positive: "text-emerald",
  info: "text-cyan",
  warn: "text-amber",
  muted: "text-fg-mute",
};

const DOT: Record<ChipTone, string> = {
  neutral: "bg-fg-dim",
  positive: "bg-emerald",
  info: "bg-cyan",
  warn: "bg-amber",
  muted: "bg-fg-mute",
};

export function StatusChip({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: ChipTone;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={`chip ${TONE[tone]}`}>
      {dot ? (
        <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      ) : null}
      {children}
    </span>
  );
}
