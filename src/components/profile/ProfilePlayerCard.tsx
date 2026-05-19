/**
 * ProfilePlayerCard — THE canonical player card for a person.
 *
 * Single source of truth for how a Profile appears anywhere in the product
 * (profile, discover, matches, worker search, teams, future map views).
 * It only projects the canonical Profile via profileToPlayerCard and renders
 * the shared PlayerSurface. Do not create a second person card.
 */
import { PlayerSurface } from "@/components/ui/PlayerSurface";
import { profileToPlayerCard } from "@/lib/player-card";
import type { Profile } from "@/lib/types";

export function ProfilePlayerCard({
  profile,
  footer,
}: {
  profile: Profile;
  footer?: React.ReactNode;
}) {
  return <PlayerSurface card={profileToPlayerCard(profile)} footer={footer} />;
}
