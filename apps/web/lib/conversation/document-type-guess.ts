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

export function guessDocumentType(text: string): string | null {
  const hay = ` ${(text ?? "").toLowerCase()} `;
  for (const { slug, needles } of DOCUMENT_TYPE_NEEDLES) {
    for (const n of needles) {
      // Short codes ("a1", "cv", "vca") must stand alone; longer stems may sit inside a word.
      const hit = n.length <= 3 ? new RegExp(`[^\\p{L}\\p{N}]${n}[^\\p{L}\\p{N}]`, "u").test(hay) : hay.includes(n);
      if (hit) return slug;
    }
  }
  return null;
}
