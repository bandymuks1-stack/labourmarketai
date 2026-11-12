/**
 * PURE — client-safe (the chat imports it): the document TYPE a sentence
 * names. Kept apart from `documents-gap.ts`, whose derivation reaches the
 * server-only readiness module.
 */
const DOCUMENT_TYPE_NEEDLES: ReadonlyArray<{ slug: string; needles: readonly string[] }> = [
  { slug: "a1_certificate", needles: ["a1"] },
  { slug: "health_safety_card", needles: ["vca", "saugos kort", "safety card", "sicherheitskarte", "sccp"] },
  { slug: "residence_permit", needles: ["leidimas gyventi", "leidimą gyventi", "residence", "verblijf", "aufenthalt", "вид на жительство", "uppehållstillst", "uppehallstillst"] },
  { slug: "work_permit", needles: ["leidim", "permit", "vergunning", "arbeitserlaubnis", "разрешен", "arbetstillst"] },
  { slug: "id_document", needles: ["pasas", "pasą", "paso", "passport", "asmens", "tapatyb", "ausweis", "paspoort", "паспорт", "id kort", "id card", "=pass", "=passet", "id-kort", "idkort", "legitimation"] },
  { slug: "employment_contract", needles: ["sutart", "contract", "vertrag", "договор", "overeenkomst", "avtal", "kontrakt"] },
  { slug: "posting_notification", needles: ["komandiruot", "posting", "meldung", "уведомл", "detacher", "utstationering"] },
  { slug: "tax_registration", needles: ["mokesč", "mokesc", "tax", "steuer", "налог", "belasting", "skatt"] },
  { slug: "social_security_registration", needles: ["sodra", "social", "sozial", "соц", "sociale"] },
  { slug: "cv", needles: ["cv", "gyvenimo apraš", "resume", "lebenslauf", "резюме", "meritförteckning", "meritforteckning"] },
  { slug: "professional_certificate", needles: ["pažym", "pazym", "sertifik", "certif", "zertifik", "сертиф", "certificaat", "kvalifik", "diplom", "yrkesbevis", "examensbevis", "utbildningsbevis", "kursintyg", "yrkesintyg", "gesällbrev", "gesallbrev", "truckkort", "heta arbeten"] },
];

export function guessDocumentType(text: string): string | null {
  const hay = ` ${(text ?? "").toLowerCase()} `;
  for (const { slug, needles } of DOCUMENT_TYPE_NEEDLES) {
    for (const n of needles) {
      // Short codes ("a1", "cv", "vca") must stand alone; longer stems may sit inside a word.
      // A needle written "=word" stands alone whatever its length: the Swedish
      // "pass" (passport) is also inside "passar", "kompass" and "passport".
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
