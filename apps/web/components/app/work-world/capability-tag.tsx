import { cn } from "@/lib/utils";

import { StateGlyph, type WorkState } from "./state-mark";

/**
 * A CAPABILITY — what a person can do, with what stands behind it.
 *
 * The same tag in the Living CV, a profile, a need's requirements and a match,
 * so "this capability is backed by confirmed work" looks identical everywhere:
 *   confirmed  a second party stands behind the work that shows it
 *   evidence   the person's own records show it
 *   declared   the person says so; nothing yet shows it
 * Tier is shape + word (the glyph and the group label), never colour alone.
 */
export type CapabilityTier = "confirmed" | "evidence" | "declared";

const STATE_OF: Record<CapabilityTier, WorkState> = {
  confirmed: "confirmed",
  evidence: "recorded",
  declared: "unknown",
};

const SURFACE: Record<CapabilityTier, string> = {
  confirmed: "bg-trust-accent/10 text-text-primary",
  evidence: "bg-brand-cyan/10 text-text-primary",
  declared: "bg-ink-700 text-text-secondary",
};

export function CapabilityTag({
  tier,
  children,
  detail,
  className,
}: {
  readonly tier: CapabilityTier;
  readonly children: React.ReactNode;
  /** Optional quiet detail — "184 h". */
  readonly detail?: string;
  readonly className?: string;
}) {
  return (
    <span
      data-tier={tier}
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-support",
        SURFACE[tier],
        className,
      )}
    >
      <StateGlyph state={STATE_OF[tier]} className="h-3.5 w-3.5" />
      <span>{children}</span>
      {detail ? <span className="text-meta tabular-nums text-text-muted">{detail}</span> : null}
    </span>
  );
}
