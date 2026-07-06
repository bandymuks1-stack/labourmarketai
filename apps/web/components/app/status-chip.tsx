import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * StatusChip — THE reusable status-pill pattern (audit PR8). The app grew
 * four parallel chip systems with raw off-token colors (emerald-500,
 * amber-700 — near-illegible on dark ink). This component maps every status
 * to the SEMANTIC token families only, so a theme change or a11y fix happens
 * in one place:
 *
 *   neutral   → ink        (no signal, informational)
 *   waiting   → brand-blue (something is in flight, no action needed)
 *   attention → brand-orange (the user should act)
 *   success   → state-success (a real positive fact)
 *   danger    → state-danger  (a real problem)
 *
 * Honesty rules: a chip states a REAL persisted status — never a fabricated
 * rating/match — and it is presentation-only (never clickable; put actions
 * on buttons/links, not on status text).
 */
export type StatusChipVariant =
  | "neutral"
  | "waiting"
  | "attention"
  | "success"
  | "danger";

const VARIANT: Record<StatusChipVariant, string> = {
  neutral: "border-ink-500 bg-ink-800/40 text-text-muted",
  waiting: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  attention: "border-brand-orange/50 bg-brand-orange/10 text-brand-orange",
  success: "border-state-success/40 bg-state-success/10 text-state-success",
  danger: "border-state-danger/40 bg-state-danger/10 text-state-danger",
};

export function StatusChip({
  variant,
  children,
  icon: Icon,
  testid,
  className,
}: {
  variant: StatusChipVariant;
  /** Already-localized status text. */
  children: React.ReactNode;
  icon?: LucideIcon;
  testid?: string;
  className?: string;
}) {
  return (
    <span
      data-testid={testid}
      data-variant={variant}
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        VARIANT[variant],
        className,
      )}
    >
      {Icon ? (
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
