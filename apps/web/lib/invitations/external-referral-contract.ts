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
        residenceCountry: z.string().regex(/^[A-Z]{2}$/).optional(),
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
