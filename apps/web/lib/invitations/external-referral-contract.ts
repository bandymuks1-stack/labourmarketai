import { z } from "zod";

import type { DeclaredContextV1 } from "@/lib/invitations/model";

/**
 * EXTERNAL WORKER REFERRAL — the receiving contract (universal network v1).
 *
 * What an approved source POSTs to `/api/referrals/external/v1`. The shape
 * is the partner's `NONSTOP_WORKER_REFERRAL` v1 envelope, accepted as the
 * generic `kind` list below so the next approved partner sends the same
 * thing under its own kind. Strict: unknown keys are refused, every string
 * is bounded, and the consent object is REQUIRED with `given: true` — a
 * schema-valid envelope without consent does not exist.
 *
 * WHAT IS NOT IN HERE
 *   - No verification field. A source cannot say "verified"; the schema has
 *     no place to put it.
 *   - No LabourMarket identity. A source never names a profile id or an
 *     account; the person claims the referral themselves by opening the link
 *     signed in.
 *   - No phone in storage. `contact.phone` is accepted for schema fidelity
 *     and then DROPPED before anything is stored — the invitation stores the
 *     addressee e-mail and name only; the source keeps the phone and the lead.
 */
export const EXTERNAL_REFERRAL_KINDS = ["NONSTOP_WORKER_REFERRAL"] as const;

const bounded = (max: number) => z.string().trim().min(1).max(max);
const boundedList = (max: number, each: number) =>
  z.array(bounded(each)).max(max).default([]);

export const externalWorkerReferralV1Schema = z
  .object({
    v: z.literal(1),
    kind: z.enum(EXTERNAL_REFERRAL_KINDS),
    /** The source's own reference (Nonstop: `leadId`). Idempotency key with
     *  the source slug. Never PII by contract; bounded either way. */
    leadId: bounded(120),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    locale: z.string().regex(/^[a-z]{2}$/).optional(),
    worker: z
      .object({
        subjectType: z.enum(["INDIVIDUAL_WORKER", "SPECIALIST", "TEAM", "BRIGADE"]),
        professions: z
          .array(
            z
              .object({ id: bounded(80).optional(), raw: bounded(120).optional() })
              .strict()
              .refine((p) => Boolean(p.id || p.raw), "profession needs id or raw"),
          )
          .max(20)
          .default([]),
        sectors: boundedList(30, 60),
        skills: boundedList(50, 120),
        yearsClaimed: z.number().int().min(0).max(60).optional(),
        languages: boundedList(20, 40),
        /** ISO-2, or the country's NAME as a person typed it into the partner's form
         *  (measured 2026-09-22, lead_4735a23a: "Vietnam" was refused as `invalid_envelope`
         *  and a consenting worker's referral was lost). A name that resolves to exactly one
         *  ISO-2 code becomes that code; one that does not is DROPPED — residence unknown —
         *  never guessed, and never a reason to refuse the whole consent. */
        residenceCountry: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .transform((v) => resolveCountryIso2(v) ?? undefined)
          .optional(),
        availability: bounded(40).optional(),
        destinations: z.array(z.string().regex(/^[A-Z]{2}$/)).max(40).default([]),
        mobilityScope: z.enum(["LISTED", "EU_WIDE"]).optional(),
        freeText: z.string().trim().max(4000).optional(),
        contact: z
          .object({
            name: bounded(120).optional(),
            phone: bounded(40).optional(),
            email: z.string().trim().toLowerCase().email().max(254).optional(),
          })
          .strict(),
      })
      .strict(),
    /** The permission the envelope exists on. `given` must be literally true. */
    consent: z
      .object({
        given: z.literal(true),
        text: bounded(4000),
        version: bounded(80),
      })
      .strict(),
    requests: z
      .array(z.enum(["WORKER_PROFILE", "OPPORTUNITY_SEARCH", "OPPORTUNITY_DELIVERY"]))
      .max(3)
      .default([]),
  })
  .strict();

export type ExternalWorkerReferralV1 = z.infer<typeof externalWorkerReferralV1Schema>;

/** The languages a partner's form may be answered in (the product's own locales + the
 *  partner's). A name is matched EXACTLY (case-folded, trimmed) against the region display
 *  name in each of them; two codes sharing a name would be ambiguous and resolve to nothing. */
const COUNTRY_NAME_LOCALES = ["en", "lt", "pl", "ru", "uk", "de", "nl", "sv", "no", "da", "fi", "fr", "es", "it", "pt", "ro", "tr", "vi"] as const;

let countryNameIndex: Map<string, string> | null = null;

/**
 * ISO 3166-1 alpha-2, the 249 officially assigned codes (plus XK, Kosovo, which every partner form
 * offers). A static list on purpose: ICU also names DEPRECATED codes — "VD" (North Vietnam) is
 * "Vietnam" in eleven languages, which made the name ambiguous and resolved nothing.
 */
const ISO_3166_ALPHA2 = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK".split(" ");

const knownIso2Codes = new Set(ISO_3166_ALPHA2);

function buildCountryNameIndex(): Map<string, string> {
  const index = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const locale of COUNTRY_NAME_LOCALES) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    } catch {
      continue;
    }
    for (const code of ISO_3166_ALPHA2) {
      const name = names.of(code);
      if (!name) continue;
      const key = name.trim().toLowerCase();
      const seen = index.get(key);
      if (seen !== undefined && seen !== code) ambiguous.add(key);
      else index.set(key, code);
    }
  }
  for (const key of ambiguous) index.delete(key);
  return index;
}

/**
 * ISO-3166 alpha-2 for what a person typed as their country: the code itself ("VN", "vn"), or
 * the country's name in any of the listed languages ("Vietnam", "Vietnamas", "Вьетнам").
 * Null when it is neither — the caller drops the field. Exact name match only: "Viet Nam" or
 * a city is not a country here, and nothing is inferred from a substring.
 */
export function resolveCountryIso2(value: string): string | null {
  const t = value.trim();
  if (t === "") return null;
  if (/^[A-Za-z]{2}$/.test(t)) {
    const code = t.toUpperCase();
    return knownIso2Codes.has(code) ? code : null;
  }
  countryNameIndex ??= buildCountryNameIndex();
  return countryNameIndex.get(t.toLowerCase()) ?? null;
}

/**
 * The envelope → what the invitation stores. Contact is split off: the
 * e-mail becomes the addressee, the name the invited name, the phone is
 * dropped. Everything else is declared context, verbatim, as declared.
 */
export function toDeclaredContext(
  envelope: ExternalWorkerReferralV1,
): DeclaredContextV1 {
  const w = envelope.worker;
  return {
    v: 1,
    subjectType: w.subjectType,
    professions: w.professions.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      ...(p.raw ? { raw: p.raw } : {}),
    })),
    sectors: [...w.sectors],
    skills: [...w.skills],
    ...(w.yearsClaimed !== undefined ? { yearsClaimed: w.yearsClaimed } : {}),
    languages: [...w.languages],
    ...(w.residenceCountry ? { residenceCountry: w.residenceCountry } : {}),
    ...(w.availability ? { availability: w.availability } : {}),
    destinations: [...w.destinations],
    ...(w.mobilityScope ? { mobilityScope: w.mobilityScope } : {}),
    ...(w.freeText ? { freeText: w.freeText } : {}),
  };
}

/**
 * Parse a raw body. A failure is reported as a bounded list of paths, never
 * the offending values — the response goes back to a machine and its log,
 * and a person's free text must not be echoed into either.
 */
export type ParsedReferral =
  | { readonly ok: true; readonly envelope: ExternalWorkerReferralV1 }
  | { readonly ok: false; readonly issues: readonly string[] };

export function parseExternalWorkerReferral(body: unknown): ParsedReferral {
  const r = externalWorkerReferralV1Schema.safeParse(body);
  if (r.success) return { ok: true, envelope: r.data };
  const issues = r.error.issues
    .slice(0, 20)
    .map((i) => `${i.path.map(String).join(".") || "$"}: ${i.code}`);
  return { ok: false, issues };
}
