/**
 * ADDRESS PASS-THROUGH — one certain rule, nothing guessed.
 *
 * A place label from a timesheet ("Hoofdgracht 3", "Hoofdgracht 3, Hilversum")
 * is, when it has exactly the shape `<street> <house number>[, <city>]`, an
 * address. The importer used to create every work object with a NULL address
 * and only the label as its name, so the address was in the product only as
 * a name. This returns the address columns the existing object writer
 * (`create_work_object_v1`: `p_address_line`, `p_city`) already accepts, and
 * returns null for anything that is not unmistakably that shape — a label
 * with no number ("Kantoor"), a number-only label, free text, several places
 * in one cell. Country, region and coordinates are never set from a label.
 *
 * Pure. No IO, no organization knowledge, no hardcoded place or word list
 * beyond the structural shape and a short list of non-address context words
 * that sit in the street position of an otherwise address-shaped label.
 */

export interface SplitAddress {
  readonly addressLine: string;
  readonly city: string | null;
}

// Words that are a work CONTEXT, not a street, in the languages the import
// reads. A label such as "Kantoor 2" is not an address.
const CONTEXT_WORDS = new Set([
  "kantoor",
  "office",
  "biuras",
  "buro",
  "extra",
  "garantie",
  "pallet",
  "osb",
  "administraciniai",
  "koordinavimo",
]);

const ADDRESS =
  /^(\p{L}[\p{L}.'’\- ]*?)\s+(\d{1,4}(?:[-/]\d{1,4})?[A-Za-z]?)(?:\s*,\s*(\p{L}[\p{L}'’\- ]*))?$/u;

const tidy = (s: string): string => s.replace(/\s+/g, " ").trim();

export function splitAddress(label: string | null | undefined): SplitAddress | null {
  if (!label) return null;
  const text = tidy(label);
  if (text.length === 0 || text.length > 120 || text.includes(";")) return null;
  const m = ADDRESS.exec(text);
  if (!m) return null;
  const street = tidy(m[1]);
  if (street.length < 3) return null;
  const firstWord = street.split(" ")[0]!.toLowerCase();
  if (CONTEXT_WORDS.has(firstWord) || street.split(" ").some((w) => CONTEXT_WORDS.has(w.toLowerCase()))) {
    return null;
  }
  return {
    addressLine: `${street} ${m[2]}`,
    city: m[3] ? tidy(m[3]) : null,
  };
}
