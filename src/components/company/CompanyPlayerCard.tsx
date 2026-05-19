/**
 * CompanyPlayerCard — THE canonical player card for a company.
 *
 * Same visual system as ProfilePlayerCard, projected from CompanyProfile via
 * companyToPlayerCard. Reused wherever a company appears (company profile,
 * hiring needs, discover, future map views). Do not create a second company
 * card or any separate avatar component.
 */
import { PlayerSurface } from "@/components/ui/PlayerSurface";
import { companyToPlayerCard } from "@/lib/player-card";
import type { CompanyProfile } from "@/lib/types";

export function CompanyPlayerCard({
  company,
  footer,
}: {
  company: CompanyProfile;
  footer?: React.ReactNode;
}) {
  return <PlayerSurface card={companyToPlayerCard(company)} footer={footer} />;
}
