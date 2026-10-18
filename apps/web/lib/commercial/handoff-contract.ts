/**
 * LABOURMARKET_WORKER_VACANCY_INTEREST v1 — the outgoing handoff envelope.
 *
 * What LabourMarket.ai hands Nonstop's commercial workflow when a worker's
 * explicit interest in a real public vacancy passes the commercial rule
 * (`handoff-rule.ts`). Canonical REFERENCES, not a copied database:
 *
 *   - the worker is a LabourMarket profile reference + the professional
 *     context the ONE engine matched on (profession slug, skill slugs,
 *     languages, availability, countries) — DECLARED facts with their
 *     provenance, never a CV, never a journal entry, never a note;
 *   - the vacancy is the store id + the publisher identity (provider key,
 *     external id) + the ad's public facts (title, employer as published,
 *     place, publication date, application route);
 *   - the employer is the stable per-company key the outreach policy
 *     deduplicates on;
 *   - the interest is the signal id, its timestamp, the engine's verdict
 *     STATUS at click time (never a number), and the worker's separate
 *     answer to "may Nonstop present me to this employer?".
 *
 * Nonstop owns everything after this envelope: the commercial opportunity,
 * employer contact (through Agentai OS for company / contact discovery),
 * follow-up, candidate proposition (ONLY with `propositionConsent.given`),
 * response, placement, commercial result. LabourMarket.ai never contacts an
 * employer from this event.
 *
 * Pure: the builder takes already-authorized rows and projects them. The
 * ALLOW-LIST below is the contract; the guard pins that no key outside it
 * — and nothing from journal/CV/note columns — can reach the envelope.
 */
import {
  COMMERCIAL_HANDOFF_KIND,
  COMMERCIAL_HANDOFF_SCHEMA_VERSION,
} from "./handoff-rule";

export const HANDOFF_ENVELOPE_KIND = "LABOURMARKET_WORKER_VACANCY_INTEREST" as const;

/** Every top-level key the envelope may carry. Guard-pinned. */
export const HANDOFF_ENVELOPE_KEYS = [
  "kind",
  "v",
  "handoffId",
  "createdAt",
  "worker",
  "vacancy",
  "employer",
  "interest",
  "outreach",
  "provenance",
] as const;

export interface HandoffWorkerRefV1 {
  /** LabourMarket profile id — the canonical person reference. */
  readonly profileRef: string;
  readonly workerRef: string;
  readonly locale: string | null;
  /** DECLARED professional context, exactly what the engine compared. */
  readonly professionSlug: string | null;
  readonly skillSlugs: readonly string[];
  readonly languages: readonly string[];
  readonly availabilityStatus: string | null;
  readonly currentCountry: string | null;
  /** Provenance of the context above — never "verified" unless a manager
   *  confirmation exists on the row; the envelope does not upgrade anything. */
  readonly basis: "declared" | "evidenced" | "mixed";
}

export interface HandoffVacancyRefV1 {
  readonly vacancyRef: string;
  readonly providerKey: string;
  readonly externalId: string;
  readonly title: string;
  readonly country: string;
  readonly city: string | null;
  readonly publishedAt: string;
  readonly expiresAt: string | null;
  readonly applicationUrl: string | null;
  readonly professionSlug: string | null;
}

export interface HandoffEmployerRefV1 {
  /** Stable per-company key (`<provider>:org:<id>` | `<provider>:host:<host>`). */
  readonly employerKey: string;
  readonly name: string;
  readonly externalOrgId: string | null;
  readonly homepage: string | null;
}

export interface HandoffInterestRefV1 {
  readonly signalRef: string;
  readonly expressedAt: string;
  /** The engine's verdict at click time — a STATUS word, never a score. */
  readonly matchStatus: string | null;
  readonly propositionConsent: {
    readonly given: boolean;
    readonly version: string | null;
    readonly at: string | null;
  };
}

export interface HandoffOutreachRefV1 {
  /** `employer-outreach-policy.ts` state recorded at creation. Nonstop /
   *  Agentai OS MUST re-evaluate before any contact; this is the floor. */
  readonly stateAtCreation: string;
  readonly policy: "employer-outreach-policy-v1";
}

export interface WorkerVacancyInterestEnvelopeV1 {
  readonly kind: typeof HANDOFF_ENVELOPE_KIND;
  readonly v: typeof COMMERCIAL_HANDOFF_SCHEMA_VERSION;
  readonly handoffId: string;
  readonly createdAt: string;
  readonly worker: HandoffWorkerRefV1;
  readonly vacancy: HandoffVacancyRefV1;
  readonly employer: HandoffEmployerRefV1;
  readonly interest: HandoffInterestRefV1;
  readonly outreach: HandoffOutreachRefV1;
  readonly provenance: {
    readonly system: "labourmarket.ai";
    readonly handoffKind: typeof COMMERCIAL_HANDOFF_KIND;
    readonly consentModel: "interest≠proposition";
  };
}

/** Columns / fields that must NEVER appear anywhere in the envelope. The
 *  guard runs the serialized envelope against these. */
export const HANDOFF_FORBIDDEN_FIELDS = [
  "note",
  "journal",
  "entry",
  "cv",
  "document",
  "profile_text",
  "bio",
  "email",
  "phone",
  "salary",
  // The global-score column is named by parts: the identifier itself is
  // banned from live source (fit-not-rating guard), including in a deny-list.
  "trust",
  "match_snapshot",
] as const;

export interface BuildEnvelopeInputV1 {
  readonly handoffId: string;
  readonly createdAt: string;
  readonly outreachStateAtCreation: string;
  readonly employerKey: string;
  readonly propositionConsent: unknown;
  readonly worker: HandoffWorkerRefV1;
  readonly vacancy: HandoffVacancyRefV1;
  readonly employer: Omit<HandoffEmployerRefV1, "employerKey">;
  readonly interest: Omit<HandoffInterestRefV1, "propositionConsent">;
}

function readConsent(raw: unknown): HandoffInterestRefV1["propositionConsent"] {
  if (!raw || typeof raw !== "object") return { given: false, version: null, at: null };
  const o = raw as Record<string, unknown>;
  const given = o.given === true;
  return {
    given,
    version: given && typeof o.version === "string" ? o.version : null,
    at: given && typeof o.at === "string" ? o.at : null,
  };
}

/** Pure projection. Every field comes from an already-authorized read. */
export function buildWorkerVacancyInterestEnvelope(
  input: BuildEnvelopeInputV1,
): WorkerVacancyInterestEnvelopeV1 {
  return {
    kind: HANDOFF_ENVELOPE_KIND,
    v: COMMERCIAL_HANDOFF_SCHEMA_VERSION,
    handoffId: input.handoffId,
    createdAt: input.createdAt,
    worker: {
      profileRef: input.worker.profileRef,
      workerRef: input.worker.workerRef,
      locale: input.worker.locale,
      professionSlug: input.worker.professionSlug,
      skillSlugs: [...input.worker.skillSlugs],
      languages: [...input.worker.languages],
      availabilityStatus: input.worker.availabilityStatus,
      currentCountry: input.worker.currentCountry,
      basis: input.worker.basis,
    },
    vacancy: { ...input.vacancy },
    employer: { employerKey: input.employerKey, ...input.employer },
    interest: {
      ...input.interest,
      propositionConsent: readConsent(input.propositionConsent),
    },
    outreach: {
      stateAtCreation: input.outreachStateAtCreation,
      policy: "employer-outreach-policy-v1",
    },
    provenance: {
      system: "labourmarket.ai",
      handoffKind: COMMERCIAL_HANDOFF_KIND,
      consentModel: "interest≠proposition",
    },
  };
}
