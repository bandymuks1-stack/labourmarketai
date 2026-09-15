/* eslint-disable */
// @ts-nocheck
//
// VENDORED, TEST-ONLY. DO NOT EDIT AND DO NOT IMPORT FROM PRODUCTION CODE.
//
//   source repo : agantai (Agentai OS)
//   source path : agent-control-center/src/labourmarket/first-party-signal-contract.ts
//   source ref  : origin/main @ 8f5ccf19d25a484061f7d648212fec98d79dd839
//   vendored on : 2026-09-04
//
// This is the consumer that Agentai actually runs against the feed this repo
// emits. It is copied rather than imported because the two products deploy
// separately and neither may take a build dependency on the other — but a
// mirror that is never compared is just a comment, so the contract tests run
// EVERY emitted row through these functions. If Agentai changes the shape, the
// re-vendored copy makes the tests here fail before a malformed feed ships.
//
// NOT VENDORED, and therefore NOT proven here: `classifyOccupation` and the
// construction occupation taxonomy, which decide whether a trade string
// resolves to an occupation group. That is ~600 lines of Agentai-owned
// vocabulary; this repo proves the SHAPE and the AUTHORITY semantics, and an
// unresolved trade is countable on the Agentai side (`unresolvedTrades`)
// rather than silently dropped.
//
// Refresh with: scripts/vendor-agentai-contract (see the contract test).

// THE FIRST-PARTY SIGNAL PROJECTION: what LabourMarket.ai hands Agentai OS.
//
// PURE. Validates and classifies. Reads no database and opens no socket.
//
// WHY A PROJECTION AND NOT A QUERY
// ---------------------------------------------------------------------------
// The tempting design is for Agentai OS to query the LabourMarket.ai database
// for available workers. It is the wrong shape for a reason that outlives any
// convenience: consent, visibility and identity rules live in the product, and
// a consumer that reads the tables directly will eventually read a row whose
// permissions it does not understand and publish something a person did not
// agree to publish. There is no way to un-publish that.
//
// So LabourMarket.ai OWNS user data, current intent, consent and visibility,
// and EMITS the minimum authorised projection. Agentai OS consumes it and can
// physically do no more than the projection allows, because the fields that
// would let it are not present. This file is the shape of that boundary.
//
// FOUR AUTHORITIES, NOT ONE FLAG
// ---------------------------------------------------------------------------
// "The user registered" grants nothing. The owner separated four permissions
// that a single `isPublic` boolean would silently merge, and they genuinely
// differ per person:
//
//   MATCH               may we consider them in matching at all
//   CONTACT             may we or a counterparty contact them
//   PUBLICATION         may this signal be published to an audience
//   IDENTITY_DISCLOSURE may the published form name them
//
// The common real case is a worker who wants matching and contact but NOT a
// public post with their name on it — visible to a current employer. Merging
// PUBLICATION and IDENTITY_DISCLOSURE would out them. So an aggregate form
// ("5 qualified scaffolders available from October") requires PUBLICATION
// alone, and only naming requires IDENTITY_DISCLOSURE on top.
//
// EVERY AUTHORITY DEFAULTS TO DENY, and an absent field is a denial rather than
// a question — see `readAuthority`. A missing permission in a feed is far more
// likely to be a serialisation bug than a grant.

// [VENDORED EDIT] The upstream file imports these two aliases from
// `../opportunity/source-class-priority.js`, which is not part of the contract
// surface. They are inlined here verbatim from that module. This is the ONLY
// change to the upstream text.
export type SignalSourceClass =
  | 'FIRST_PARTY_REGISTERED'
  | 'PARTNER_SUPPLIED'
  | 'EXTERNAL_DISCOVERED'
  | 'DERIVED'
  | 'FORECAST';

export type SignalFreshness = 'CURRENT' | 'AGEING' | 'EXPIRED' | 'WITHDRAWN';

export const FIRST_PARTY_SIGNAL_SCHEMA = 'agentai-first-party-market-signal/v1' as const;

export type FirstPartySignalType = 'WORKER_AVAILABILITY' | 'EMPLOYER_REQUIREMENT';

export type FirstPartyActorType =
  | 'WORKER'
  | 'TEAM'
  | 'EMPLOYER'
  | 'CONTRACTOR'
  | 'RECRUITER'
  | 'STAFFING_PARTNER';

/** The declared states that can make a worker signal priority-eligible. */
export type WorkerIntentState =
  | 'AVAILABLE_NOW'
  | 'AVAILABLE_FROM'
  | 'OPEN_TO_OFFERS'
  | 'LOOKING_FOR_WORK'
  | 'LOOKING_FOR_PROJECTS';

/** A permission as the feed states it. Absent is not "maybe" — it is "no". */
export type AuthorityGrant = 'GRANTED' | 'DENIED';

export interface FirstPartyAuthorities {
  readonly matchAuthority: AuthorityGrant;
  readonly contactAuthority: AuthorityGrant;
  readonly publicationAuthority: AuthorityGrant;
  readonly identityDisclosureAuthority: AuthorityGrant;
}

/**
 * The projection itself.
 *
 * NOTE WHAT IS ABSENT: no name, no email, no phone, no address, no date of
 * birth, no free-text profile. Identity is a stable opaque `actorRef` that the
 * product can resolve and Agentai OS cannot. If a future need genuinely
 * requires a name, it arrives as a deliberate contract change with a consent
 * story attached — not by someone adding a convenient field.
 */
export interface FirstPartyMarketSignal {
  readonly schemaVersion: typeof FIRST_PARTY_SIGNAL_SCHEMA;
  readonly signalId: string;
  readonly signalType: FirstPartySignalType;
  readonly actorType: FirstPartyActorType;
  /** Opaque, stable, product-resolvable. NEVER a name or contact detail. */
  readonly actorRef: string;
  /** Which project this signal belongs to. */
  readonly projectScope: string;
  readonly currentState: WorkerIntentState | 'REQUIREMENT_OPEN' | 'REQUIREMENT_CLOSED';
  readonly freshness: SignalFreshness;
  /** ISO country codes the signal applies to. */
  readonly geography: readonly string[];
  readonly trades: readonly string[];
  /** ISO date the availability or requirement starts, when stated. */
  readonly availableFromIso: string | null;
  /** Headcount for a requirement. Null when not stated — never 0 as a stand-in. */
  readonly headcount: number | null;
  /** One line summarising the requirement. Absent for worker signals. */
  readonly requirementSummary: string | null;
  /** 0..1 as measured by the product. Null when the product did not report it. */
  readonly evidenceCompleteness: number | null;
  readonly verifiedAtIso: string;
  readonly expiresAtIso: string | null;
  readonly authorities: FirstPartyAuthorities;
  /** Markets the actor agreed to be represented in. Empty = none. */
  readonly allowedMarkets: readonly string[];
  /** Channel ids the actor agreed to. Empty = none, not "all". */
  readonly allowedChannels: readonly string[];
  readonly provenance: SignalSourceClass;
}

/**
 * Read a permission defensively.
 *
 * Anything that is not the exact string GRANTED is a denial: undefined, null,
 * true, 'granted', 'yes', ''. Being strict here means a malformed feed loses
 * capability rather than gaining it, which is the correct direction for a
 * failure that reaches the public.
 */
export function readAuthority(raw: unknown): AuthorityGrant {
  return raw === 'GRANTED' ? 'GRANTED' : 'DENIED';
}

export type SignalRefusal =
  | 'NOT_MATCHABLE'
  | 'NOT_PUBLISHABLE'
  | 'NOT_IDENTIFIABLE'
  | 'CHANNEL_NOT_ALLOWED'
  | 'MARKET_NOT_ALLOWED'
  | 'EXPIRED_OR_WITHDRAWN'
  | 'INCOMPLETE';

export interface PublicationDecision {
  readonly allowed: boolean;
  /** Whether the published text may name the actor. */
  readonly mayDiscloseIdentity: boolean;
  readonly refusals: readonly SignalRefusal[];
  readonly explanation: string;
}

/**
 * May this signal be published to this channel, in this market?
 *
 * Returns EVERY reason it cannot, not the first, so an owner fixing consent
 * settings sees the whole list instead of discovering them one run at a time.
 */
export function decidePublication(
  signal: FirstPartyMarketSignal,
  channelId: string,
  market: string,
): PublicationDecision {
  const refusals: SignalRefusal[] = [];

  if (signal.authorities.publicationAuthority !== 'GRANTED') refusals.push('NOT_PUBLISHABLE');
  if (signal.freshness === 'EXPIRED' || signal.freshness === 'WITHDRAWN') {
    refusals.push('EXPIRED_OR_WITHDRAWN');
  }
  // An empty allow-list is an empty allow-list. Treating it as "unrestricted"
  // is the single most likely way this contract would leak, because that is
  // how permissive systems usually behave and the reading feels natural.
  if (!signal.allowedChannels.includes(channelId)) refusals.push('CHANNEL_NOT_ALLOWED');
  if (!signal.allowedMarkets.includes(market)) refusals.push('MARKET_NOT_ALLOWED');

  const allowed = refusals.length === 0;
  const mayDiscloseIdentity = allowed
    && signal.authorities.identityDisclosureAuthority === 'GRANTED';

  return {
    allowed,
    mayDiscloseIdentity,
    refusals,
    explanation: allowed
      ? (mayDiscloseIdentity
        ? 'publishable, identity disclosure granted'
        : 'publishable in aggregate/anonymous form only — identity disclosure not granted')
      : `not publishable: ${refusals.join(', ')}`,
  };
}

/** May this signal be considered in matching at all? */
export function decideMatchability(signal: FirstPartyMarketSignal): PublicationDecision {
  const refusals: SignalRefusal[] = [];
  if (signal.authorities.matchAuthority !== 'GRANTED') refusals.push('NOT_MATCHABLE');
  if (signal.freshness === 'WITHDRAWN') refusals.push('EXPIRED_OR_WITHDRAWN');
  const allowed = refusals.length === 0;
  return {
    allowed,
    mayDiscloseIdentity: false,
    refusals,
    explanation: allowed ? 'matchable' : `not matchable: ${refusals.join(', ')}`,
  };
}

/**
 * Render a privacy-preserving aggregate line for a set of worker signals.
 *
 * This is the DEFAULT published form. It names nobody, and it is built only
 * from signals that individually passed `decidePublication`, so the aggregate
 * cannot become a loophole that publishes a person who refused.
 *
 * Returns null rather than a line when the cohort is too small: "1 scaffolder
 * available in Vilnius from October" is not anonymous in a small market, and an
 * aggregate that identifies someone is a disclosure wearing a disguise.
 */
export const MIN_AGGREGATE_COHORT = 3;

export function renderAvailabilityAggregate(
  signals: readonly FirstPartyMarketSignal[],
  channelId: string,
  market: string,
  trade: string,
): string | null {
  const eligible = signals.filter((s) =>
    s.signalType === 'WORKER_AVAILABILITY'
    && s.trades.includes(trade)
    && decidePublication(s, channelId, market).allowed);

  if (eligible.length < MIN_AGGREGATE_COHORT) return null;

  const dates = eligible
    .map((s) => s.availableFromIso)
    .filter((d): d is string => typeof d === 'string' && d !== '')
    .sort();
  const from = dates[0];

  return from === undefined
    ? `${eligible.length} qualified ${trade} available`
    : `${eligible.length} qualified ${trade} available from ${from}`;
}

/**
 * Validate a feed row before anything downstream trusts it.
 *
 * A row that fails is DROPPED, never repaired. Repairing a malformed consent
 * record means guessing what a person agreed to.
 */
export function validateFirstPartySignal(raw: unknown): FirstPartyMarketSignal | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r['schemaVersion'] !== FIRST_PARTY_SIGNAL_SCHEMA) return null;

  const str = (k: string): string | null =>
    (typeof r[k] === 'string' && (r[k] as string).trim() !== '' ? r[k] as string : null);
  const arr = (k: string): string[] =>
    (Array.isArray(r[k]) ? (r[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []);

  const signalId = str('signalId');
  const actorRef = str('actorRef');
  const verifiedAtIso = str('verifiedAtIso');
  if (signalId === null || actorRef === null || verifiedAtIso === null) return null;

  const signalType = r['signalType'];
  if (signalType !== 'WORKER_AVAILABILITY' && signalType !== 'EMPLOYER_REQUIREMENT') return null;

  const a = (r['authorities'] ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null =>
    (typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? r[k] as number : null);

  return {
    schemaVersion: FIRST_PARTY_SIGNAL_SCHEMA,
    signalId,
    signalType,
    actorType: (str('actorType') ?? 'WORKER') as FirstPartyActorType,
    actorRef,
    projectScope: str('projectScope') ?? 'labourmarketai',
    currentState: (str('currentState') ?? 'OPEN_TO_OFFERS') as FirstPartyMarketSignal['currentState'],
    freshness: (str('freshness') ?? 'EXPIRED') as SignalFreshness,
    geography: arr('geography'),
    trades: arr('trades'),
    availableFromIso: str('availableFromIso'),
    headcount: num('headcount'),
    requirementSummary: str('requirementSummary'),
    evidenceCompleteness: num('evidenceCompleteness'),
    verifiedAtIso,
    expiresAtIso: str('expiresAtIso'),
    authorities: {
      matchAuthority: readAuthority(a['matchAuthority']),
      contactAuthority: readAuthority(a['contactAuthority']),
      publicationAuthority: readAuthority(a['publicationAuthority']),
      identityDisclosureAuthority: readAuthority(a['identityDisclosureAuthority']),
    },
    allowedMarkets: arr('allowedMarkets'),
    allowedChannels: arr('allowedChannels'),
    // A first-party FEED row is first-party by construction. Letting the row
    // declare its own provenance would let a mislabelled external import claim
    // the first-party advantage.
    provenance: 'FIRST_PARTY_REGISTERED',
  };
}
