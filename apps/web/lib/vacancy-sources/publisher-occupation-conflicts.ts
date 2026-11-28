import {
  detectNeedProfession,
  namesOccupationOutsideCatalogue,
} from "@/lib/market/need-skills";

// These exact publisher labels name occupations outside the catalogue.
const PUBLISHER_OCCUPATIONS_OUTSIDE_CATALOGUE = new Set([
  "affärsutvecklare",
  "bilrekonditionerare",
  "doktorand",
  "hundtrimmare",
  "specialistofficer",
]);

/** Applies vacancy-specific and shared exclusions only to a publisher's
 * occupation label. A recognized profession in that label takes precedence. */
export function isPublisherOccupationOutsideCatalogue(occupationRaw: string | null): boolean {
  const occupation = occupationRaw?.trim();
  if (!occupation) return false;
  const normalized = occupation.toLocaleLowerCase("sv").normalize("NFC");
  return (PUBLISHER_OCCUPATIONS_OUTSIDE_CATALOGUE.has(normalized) ||
    namesOccupationOutsideCatalogue(occupation)) &&
    detectNeedProfession(occupation) === null;
}
