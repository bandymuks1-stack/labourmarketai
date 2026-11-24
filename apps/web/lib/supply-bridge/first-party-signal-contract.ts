/**
 * `agentai-first-party-market-signal/v1` — the EMITTING side of the contract.
 *
 * PURE. No database, no filesystem, no clock, no network.
 *
 * PROVENANCE. This is the LabourMarket.ai mirror of a type that is owned by
 * Agentai OS and lives at
 *   agent-control-center/src/labourmarket/first-party-signal-contract.ts
 * (Agentai `main`, contract merged in #634, handoff document
 *  docs/handoff/labourmarket-first-party-supply-feed-v1.md, SHA 4cdb30c).
 *
 * It is a mirror rather than an import because the two products deploy
 * separately and neither may take a build dependency on the other. A mirror
 * can drift, so drift is made loud instead of tolerated: the vendored consumer
 * in `__contract__/agentai-v1-consumer.vendored.ts` is a verbatim copy of the
 * functions Agentai actually runs on this feed, and the contract tests assert
 * that every row this repo emits survives them. If Agentai changes the shape,
 * those tests fail here before a malformed feed reaches production.
 *
 * WHY A PROJECTION RATHER THAN A QUERY
 * ---------------------------------------------------------------------------
 * Agentai OS could have queried this database for available workers. That is
 * the wrong shape: consent, visibility and identity rules live in this product,
 * and a consumer reading these tables would eventually read a row whose
 * permissions it does not understand and publish something a person did not
 * agree to publish. There is no un-publishing that. So LabourMarket.ai owns the
 * person and EMITS the minimum authorised projection; the consumer can
 * physically do no more than the projection allows, because the fields that
 * would let it are not present in the type.
 *
 * NOTE WHAT IS ABSENT: no name, no email, no phone, no address, no date of
 * birth, no free-text profile, no document reference, no journal content. Not
 * "empty unless permitted" — ABSENT. A field that could hold an identity is a
 * field something will eventually put one in.
 */

export const FIRST_PARTY_SIGNAL_SCHEMA =
  "agentai-first-party-market-signal/v1" as const;

export type FirstPartySignalType = "WORKER_AVAILABILITY" | "EMPLOYER_REQUIREMENT";

export type FirstPartyActorType =
  | "WORKER"
  | "TEAM"
  | "EMPLOYER"
  | "CONTRACTOR"
  | "RECRUITER"
  | "STAFFING_PARTNER";

/** The declared states that can make a worker signal priority-eligible. */
export type WorkerIntentState =
  | "AVAILABLE_NOW"
  | "AVAILABLE_FROM"
  | "OPEN_TO_OFFERS"
  | "LOOKING_FOR_WORK"
  | "LOOKING_FOR_PROJECTS";

export const WORKER_INTENT_STATES: readonly WorkerIntentState[] = [
  "AVAILABLE_NOW",
  "AVAILABLE_FROM",
  "OPEN_TO_OFFERS",
  "LOOKING_FOR_WORK",
  "LOOKING_FOR_PROJECTS",
];

/** Lifecycle of a declared intent. Supplied by this product, never recomputed
 *  downstream — two systems that both derive freshness from timestamps end up
 *  disagreeing about whether a person is available, and the one talking to
 *  employers is the wrong one to be guessing. */
export type SignalFreshness = "CURRENT" | "AGEING" | "EXPIRED" | "WITHDRAWN";

export type SignalSourceClass =
  | "FIRST_PARTY_REGISTERED"
  | "PARTNER_SUPPLIED"
  | "EXTERNAL_DISCOVERED"
  | "DERIVED"
  | "FORECAST";

/** A permission as the feed states it. Absent is not "maybe" — it is "no". */
export type AuthorityGrant = "GRANTED" | "DENIED";

export interface FirstPartyAuthorities {
  readonly matchAuthority: AuthorityGrant;
  readonly contactAuthority: AuthorityGrant;
  readonly publicationAuthority: AuthorityGrant;
  readonly identityDisclosureAuthority: AuthorityGrant;
}

export interface FirstPartyMarketSignal {
  readonly schemaVersion: typeof FIRST_PARTY_SIGNAL_SCHEMA;
  readonly signalId: string;
  readonly signalType: FirstPartySignalType;
  readonly actorType: FirstPartyActorType;
  /** Opaque, stable, product-resolvable. NEVER a name or contact detail. */
  readonly actorRef: string;
  readonly projectScope: string;
  readonly currentState: WorkerIntentState | "REQUIREMENT_OPEN" | "REQUIREMENT_CLOSED";
  readonly freshness: SignalFreshness;
  /** ISO-3166-1 alpha-2 codes the person may LEGALLY work in. */
  readonly geography: readonly string[];
  readonly trades: readonly string[];
  readonly availableFromIso: string | null;
  /** Headcount for a TEAM row. Null when not stated — never 0 as a stand-in. */
  readonly headcount: number | null;
  readonly requirementSummary: string | null;
  /** 0..1 as this product measured it. Null when it did not measure one. */
  readonly evidenceCompleteness: number | null;
  readonly verifiedAtIso: string;
  readonly expiresAtIso: string | null;
  readonly authorities: FirstPartyAuthorities;
  /** Markets the actor agreed to be represented in. Empty = none, not "all". */
  readonly allowedMarkets: readonly string[];
  /** Channel ids the actor agreed to. Empty = none, not "all". */
  readonly allowedChannels: readonly string[];
  readonly provenance: SignalSourceClass;
}

/**
 * The exact key set of a v1 row, in the order the contract document lists it.
 *
 * Emitting an EXTRA key is not harmless-looking sloppiness: the consumer's
 * validator rebuilds the object from the keys it knows, so an extra field is
 * dropped in silence, and a feed that appears to carry credential data which
 * nobody downstream can see is worse than one that never claimed to. The
 * emitter asserts against this list so an added field is a test failure here
 * rather than an invisible no-op there.
 */
export const V1_SIGNAL_KEYS: readonly string[] = [
  "schemaVersion",
  "signalId",
  "signalType",
  "actorType",
  "actorRef",
  "projectScope",
  "currentState",
  "freshness",
  "geography",
  "allowedMarkets",
  "trades",
  "availableFromIso",
  "headcount",
  "requirementSummary",
  "evidenceCompleteness",
  "verifiedAtIso",
  "expiresAtIso",
  "authorities",
  "allowedChannels",
  "provenance",
];

export const V1_AUTHORITY_KEYS: readonly string[] = [
  "matchAuthority",
  "contactAuthority",
  "publicationAuthority",
  "identityDisclosureAuthority",
];

/**
 * Fields that must NEVER appear on a row, checked by name at emit time.
 *
 * The type system already forbids them, but the row this repo emits is built
 * in SQL and arrives as `unknown`. A structural type cannot guard a value that
 * crossed a database boundary, so the guard is a runtime one — and it is a
 * deny-list on purpose, because the failure it catches is somebody adding a
 * convenient field, and convenient fields have predictable names.
 */
export const FORBIDDEN_IDENTITY_KEYS: readonly string[] = [
  "name",
  "fullName",
  "full_name",
  "displayName",
  "display_name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "phoneNumber",
  "address",
  "street",
  "postcode",
  "dateOfBirth",
  "birthDate",
  "personalCode",
  "nationalId",
  "profileId",
  "profile_id",
  "userId",
  "user_id",
  "workerId",
  "worker_id",
  "cv",
  "cvUrl",
  "documentUrl",
  "filePath",
  "file_path",
  "bio",
  "headline",
  "note",
  "avatarUrl",
];

/**
 * Read a permission defensively.
 *
 * Anything that is not the exact string GRANTED is a denial: undefined, null,
 * true, 'granted', 'yes', ''. Being strict here means a malformed feed loses
 * capability rather than gaining it, which is the correct direction for a
 * failure that can reach the public. Kept identical to the consumer's
 * `readAuthority` so both ends agree about what a broken row means.
 */
export function readAuthority(raw: unknown): AuthorityGrant {
  return raw === "GRANTED" ? "GRANTED" : "DENIED";
}
