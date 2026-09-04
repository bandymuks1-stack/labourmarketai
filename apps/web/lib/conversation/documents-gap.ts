/**
 * DOCUMENT GAP — pure derivation for the conversation (owner contract
 * 2026-09-04 §12, §16).
 *
 *   "For person / country answer: WHAT DO I HAVE? WHAT IS VALID? WHAT EXPIRES?
 *    WHAT IS MISSING? WHAT IS REQUIRED? … WHO CAN ISSUE / HELP? WHAT NEXT?"
 *
 * Before this module the chat answered "documents" with a route chip only;
 * the document centre and the country-readiness join existed but no
 * conversation reader called them, so "what am I missing?" could only talk
 * about skills. This is the pure half: it joins the person's own documents
 * against the requirements of the countries they said they want to work in
 * (the same `computeCountryReadiness` the documents page renders) and returns
 * the facts the answer is built from. No IO, no copy.
 */

import {
  computeCountryReadiness,
  type RequirementRow,
  type WorkerDocumentRow,
} from "@/lib/documents/readiness";

export interface DocumentGapItem {
  readonly documentTypeSlug: string;
  readonly country: string;
  readonly requirementLevel: "required" | "recommended" | "conditional";
  /** The authority / source the requirement was sourced from — "who can
   *  issue / verify" when the matrix knows it; null when it does not. */
  readonly sourceTitle: string | null;
  readonly sourceUrl: string | null;
}

export interface DocumentExpiringItem {
  readonly documentTypeSlug: string;
  readonly country: string | null;
  readonly validUntil: string;
}

export interface DocumentGap {
  /** Countries the person wants to work in that the requirement matrix knows. */
  readonly countriesKnown: readonly string[];
  /** Countries the person named that have no requirement rows (stated, never guessed). */
  readonly countriesUnknown: readonly string[];
  readonly ready: number;
  readonly expiring: readonly DocumentExpiringItem[];
  /** Required / conditional documents the person does not have, per country. */
  readonly missing: readonly DocumentGapItem[];
}

export const DOCUMENT_GAP_LINE_CAP = 5;

/**
 * The document TYPE a sentence names, in the person's own words — a PREFILL
 * for the one inline form (visible, editable, confirmed), never a write on
 * its own. Slugs are the closed `document_types` set the upsert RPC
 * validates; the most specific reading wins (an "A1" is not a mere
 * certificate, a residence permit is not a work permit).
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

/**
 * Join own documents × the requirements of the countries the person named.
 * `countries` are the person's stated preferences (ISO-2), already limited by
 * the caller; an empty list means the answer must ASK where they want to work
 * rather than invent a country.
 */
export function deriveDocumentGap(
  documents: readonly WorkerDocumentRow[],
  requirements: readonly RequirementRow[],
  countries: readonly string[],
  now: Date,
): DocumentGap {
  const countriesKnown: string[] = [];
  const countriesUnknown: string[] = [];
  const missing: DocumentGapItem[] = [];
  const seen = new Set<string>();
  for (const country of countries) {
    const readiness = computeCountryReadiness(country, documents, requirements, now);
    if (!readiness.requirementsKnown) {
      countriesUnknown.push(country);
      continue;
    }
    countriesKnown.push(country);
    for (const item of readiness.items) {
      if (item.status !== "missing" || item.requirementLevel === "recommended") continue;
      const key = `${country}:${item.documentTypeSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      missing.push({
        documentTypeSlug: item.documentTypeSlug,
        country,
        requirementLevel: item.requirementLevel,
        sourceTitle: item.sourceTitle ?? null,
        sourceUrl: item.sourceUrl ?? null,
      });
    }
  }

  const expiring: DocumentExpiringItem[] = [];
  let ready = 0;
  const limit = new Date(now.getTime() + 30 * 86_400_000);
  for (const d of documents) {
    if (d.storedStatus !== "ready") continue;
    if (d.validUntil) {
      const until = new Date(`${d.validUntil}T00:00:00.000Z`);
      if (until.getTime() < now.getTime()) continue; // expired → counted as missing by readiness
      if (until.getTime() <= limit.getTime()) {
        expiring.push({ documentTypeSlug: d.documentTypeSlug, country: d.country, validUntil: d.validUntil });
        continue;
      }
    }
    ready += 1;
  }
  expiring.sort((a, b) => a.validUntil.localeCompare(b.validUntil));

  return { countriesKnown, countriesUnknown, ready, expiring, missing };
}
