/**
 * The project NAME a "create a project" sentence already carried, so the
 * inline form opens with it filled in (visible, editable, still confirmed).
 *
 * Found in a real walk (2026-10-11): "Maak een nieuw project: Renovatie
 * magazijn Waalhaven in Rotterdam, start 2 november" opened the form with the
 * city filled and the name EMPTY — the owner had to type what they just said.
 *
 * Only an EXPLICITLY marked name is read — never a guess from free prose:
 *   1. a quoted name           „Statybos aikštelė“ / "Harbor Warehouse" / «Склад»
 *   2. a name after a naming word
 *      called / named / genaamd / pavadinimu / o nazwie / namens /
 *      mit dem Namen / под названием
 *   3. a name after a colon    "… project: Renovatie magazijn Waalhaven, …"
 * The name stops at the first comma, semicolon or full stop. Null when the
 * sentence names nothing — the form then asks, as before.
 */
const QUOTED = /[„“"«]([^„“”"«»]{2,120})[“”"»]/u;
const AFTER_NAMING_WORD =
  /(?:\bcalled|\bnamed|\bgenaamd|\bpavadinimu|\bnazwie|\bnamens|\bNamen|под\s+названием)\s+([^,;.\n]{2,120})/iu;
const AFTER_COLON = /:\s*([^,;.\n]{2,120})/u;

export function projectTitleFromSentence(sentence: string): string | null {
  const text = sentence.trim();
  const raw =
    text.match(QUOTED)?.[1] ??
    text.match(AFTER_NAMING_WORD)?.[1] ??
    text.match(AFTER_COLON)?.[1] ??
    "";
  const title = raw.trim().replace(/\s+/g, " ");
  return title.length >= 2 ? title.slice(0, 120) : null;
}
