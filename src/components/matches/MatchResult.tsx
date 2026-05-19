/**
 * MatchResult — a deterministic match rendered on the canonical card.
 *
 * Reuses ProfilePlayerCard for identity and adds the transparent score
 * breakdown produced by lib/matching (no model, no hidden ranking).
 */
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import type { MatchResult as MatchResultType, Profile } from "@/lib/types";

export function MatchResult({
  profile,
  match,
}: {
  profile: Profile;
  match: MatchResultType;
}) {
  return (
    <ProfilePlayerCard
      profile={profile}
      footer={
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-fg-mute">
              Match score
            </span>
            <span className="text-sm font-semibold tabular-nums text-cyan">
              {match.score}/100
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
            <div
              className="grad-cv h-full rounded-full"
              style={{ width: `${Math.min(100, match.score)}%` }}
            />
          </div>
          <p className="text-xs text-fg-dim">{match.reason}</p>
          {match.gapSkills.length > 0 ? (
            <p className="text-[0.7rem] text-fg-mute">
              Gap: {match.gapSkills.join(", ")}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
