import { looksSwedish } from "@/lib/structuring/looks-swedish";

/**
 * PURE — client-safe (the chat imports it): the document TYPE a sentence
 * names. Kept apart from `documents-gap.ts`, whose derivation reaches the
 * server-only readiness module.
 */
const DOCUMENT_TYPE_NEEDLES: ReadonlyArray<{ slug: string; needles: readonly string[] }> = [
  { slug: "a1_certificate", needles: ["a1"] },
  { slug: "health_safety_card", needles: ["vca", "saugos kort", "safety card", "sicherheitskarte", "sccp"] },
  { slug: "residence_permit", needles: ["leidimas gyventi", "leidimą gyventi", "residence", "verblijf", "aufenthalt", "вид на жительство"] },
  { slug: "work_permit", needles: ["leidim", "permit", "vergunning", "arbeitserlaubnis", "разрешен"] },
  { slug: "id_document", needles: ["pasas", "pasą", "paso", "passport", "asmens", "tapatyb", "ausweis", "paspoort", "паспорт", "id kort", "id card"] },
  { slug: "employment_contract", needles: ["sutart", "contract", "vertrag", "договор", "overeenkomst"] },
  { slug: "posting_notification", needles: ["komandiruot", "posting", "meldung", "уведомл", "detacher"] },
  { slug: "tax_registration", needles: ["mokesč", "mokesc", "tax", "steuer", "налог", "belasting"] },
  { slug: "social_security_registration", needles: ["sodra", "social", "sozial", "соц", "sociale"] },
  { slug: "cv", needles: ["cv", "gyvenimo apraš", "resume", "lebenslauf", "резюме"] },
  { slug: "professional_certificate", needles: ["pažym", "pazym", "sertifik", "certif", "zertifik", "сертиф", "certificaat", "kvalifik", "diplom"] },
];

/**
 * The SWEDISH document words — read only in a sentence `looksSwedish` reads
 * as Swedish, after the shared needles of the same type. "pass" (passport) is
 * an English verb and noun, "kontrakt" is Polish and German, "skatt" opens
 * nothing else but would be the first to: a Swedish needle in the shared list
 * guessed "Here is my pass" as an identity document (review finding 11).
 * A needle written "=word" stands alone whatever its length: "pass" is also
 * inside "passar" and "kompass".
 */
const SV_DOCUMENT_TYPE_NEEDLES: Readonly<Record<string, readonly string[]>> = {
  residence_permit: ["uppehållstillst", "uppehallstillst"],
  work_permit: ["arbetstillst"],
  id_document: ["=pass", "=passet", "id-kort", "idkort", "legitimation"],
  employment_contract: ["avtal", "kontrakt"],
  posting_notification: ["utstationering"],
  tax_registration: ["skatt"],
  cv: ["meritförteckning", "meritforteckning"],
  professional_certificate: ["yrkesbevis", "examensbevis", "utbildningsbevis", "kursintyg", "yrkesintyg", "gesällbrev", "gesallbrev", "truckkort", "heta arbeten"],
};

export function guessDocumentType(text: string): string | null {
  const hay = ` ${(text ?? "").toLowerCase()} `;
  const swedish = looksSwedish(text);
  for (const { slug, needles } of DOCUMENT_TYPE_NEEDLES) {
    const all = swedish ? [...needles, ...(SV_DOCUMENT_TYPE_NEEDLES[slug] ?? [])] : needles;
    for (const n of all) {
      // Short codes ("a1", "cv", "vca") must stand alone; longer stems may sit inside a word.
      const word = n.startsWith("=") ? n.slice(1) : n;
      const hit =
        n.startsWith("=") || n.length <= 3
          ? new RegExp(`[^\\p{L}\\p{N}]${word}[^\\p{L}\\p{N}]`, "u").test(hay)
          : hay.includes(n);
      if (hit) return slug;
    }
  }
  return null;
}
