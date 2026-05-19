/**
 * DiscoverCard — the draft-floor card.
 *
 * It does NOT define its own visuals. It reuses the canonical
 * ProfilePlayerCard and only adds draft-style actions in the footer slot.
 */
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import type { Profile } from "@/lib/types";

export function DiscoverCard({ profile }: { profile: Profile }) {
  return (
    <ProfilePlayerCard
      profile={profile}
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cta cta-primary flex-1 justify-center py-2 text-sm"
          >
            Draft
          </button>
          <button
            type="button"
            className="cta cta-ghost flex-1 justify-center py-2 text-sm"
          >
            Shortlist
          </button>
        </div>
      }
    />
  );
}
