/**
 * Exact publisher labels for occupations outside the catalogue, paired with
 * the misleading slugs previously inferred from their ad titles.
 */
const PUBLISHER_OCCUPATION_CONFLICTS = new Map([
  ["affärsutvecklare", "software_developer"],
  ["bilrekonditionerare", "caregiver"],
  ["doktorand", "electrician"],
  ["hundtrimmare", "hairdresser"],
  ["specialistofficer", "teacher"],
]);

export function publisherOccupationConflictSlug(occupation: string | null): string | null {
  if (occupation === null) return null;
  const normalized = occupation.trim().toLocaleLowerCase("sv").normalize("NFC");
  return PUBLISHER_OCCUPATION_CONFLICTS.get(normalized) ?? null;
}
