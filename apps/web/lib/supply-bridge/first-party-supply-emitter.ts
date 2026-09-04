/**
 * The emitter. PURE — no database, no filesystem, no clock, no network.
 *
 * It takes rows exactly as `public.first_party_supply_feed_v1()` produced them
 * and turns them into the JSONL body of
 * `runtime/labourmarket-supply/first-party-supply-feed.jsonl`.
 *
 * WHY THIS LAYER EXISTS AT ALL, GIVEN THAT SQL ALREADY BUILT THE SHAPE
 * ---------------------------------------------------------------------------
 * The authority filter is in SQL deliberately — one place, so a second caller
 * cannot get a laxer answer than the first. This layer does not re-decide
 * consent and must not: a second opinion about consent is a second chance to
 * get consent wrong.
 *
 * What it does instead is refuse to WRITE a row it cannot verify. The database
 * hands back `unknown`; a TypeScript interface cannot guard a value that
 * crossed that boundary. So every row is re-checked structurally, and a row
 * that fails is DROPPED and COUNTED, never repaired. Repairing a malformed
 * consent record means guessing what a person agreed to.
 *
 * A ROW THAT LOOKS WRONG IS DROPPED; A FEED THAT LOOKS WRONG IS NOT WRITTEN
 * ---------------------------------------------------------------------------
 * Those are different failures and they get different answers. One unreadable
 * row is a bug in one row. A read that failed entirely is *not knowing*, and
 * writing an empty file in that case would state "we looked and hold nobody" —
 * which the consumer would believe. See `buildFeedBody`: it takes an outcome,
 * not an array, and there is no way to hand it "nothing" without also saying
 * whether that means zero or unknown.
 */

import {
  FIRST_PARTY_SIGNAL_SCHEMA,
  FORBIDDEN_IDENTITY_KEYS,
  V1_AUTHORITY_KEYS,
  V1_SIGNAL_KEYS,
  WORKER_INTENT_STATES,
  readAuthority,
  type FirstPartyMarketSignal,
  type SignalFreshness,
} from "@/lib/supply-bridge/first-party-signal-contract";

/** Why one row did not make it into the file. Counted, never silent. */
export type RowRejection =
  | "not-an-object"
  | "wrong-schema-version"
  | "missing-required-string"
  | "unknown-key"
  | "forbidden-identity-key"
  | "unknown-intent-state"
  | "unknown-freshness"
  | "match-authority-not-granted"
  | "not-current-supply"
  | "bad-country-code"
  | "bad-completeness";

export interface RejectedRow {
  /** The row's own id when it had a readable one, so a person can find it. */
  readonly signalId: string | null;
  readonly reason: RowRejection;
}

export interface EmitResult {
  readonly signals: readonly FirstPartyMarketSignal[];
  readonly rejected: readonly RejectedRow[];
  /** Counts by declared intent, for the run log an owner actually reads. */
  readonly byIntent: Readonly<Record<string, number>>;
  /** How many rows carry each authority. A blanket-GRANTED bug is visible here. */
  readonly authorityCounts: Readonly<Record<string, number>>;
}

const FRESHNESS_VALUES: readonly SignalFreshness[] = [
  "CURRENT",
  "AGEING",
  "EXPIRED",
  "WITHDRAWN",
];

/** Freshness values a row may still carry when it is emitted as CURRENT supply.
 *  EXPIRED and WITHDRAWN are historical facts, not live claims, and the owner
 *  contract (§5) forbids exporting them as current. The consumer would exclude
 *  them anyway; dropping them here means the file never asserts them at all. */
const EMITTABLE_FRESHNESS: readonly SignalFreshness[] = ["CURRENT", "AGEING"];

const ISO2 = /^[A-Z]{2}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return null;
    out.push(item);
  }
  return out;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * Validate one row from the feed RPC into a signal, or say why not.
 *
 * Exported so the contract tests can drive it row by row and assert the exact
 * rejection reason rather than only that "something was dropped".
 */
export function validateEmittedRow(
  raw: unknown,
): { ok: true; signal: FirstPartyMarketSignal } | { ok: false; rejection: RejectedRow } {
  const fail = (reason: RowRejection, signalId: string | null = null) =>
    ({ ok: false as const, rejection: { signalId, reason } });

  if (!isPlainObject(raw)) return fail("not-an-object");
  const id = nonEmptyString(raw["signalId"]);

  if (raw["schemaVersion"] !== FIRST_PARTY_SIGNAL_SCHEMA) {
    return fail("wrong-schema-version", id);
  }

  // Both directions: nothing extra, nothing missing. An extra key would be
  // dropped silently by the consumer; a missing one changes meaning.
  const keys = Object.keys(raw);
  for (const k of keys) {
    if (FORBIDDEN_IDENTITY_KEYS.includes(k)) return fail("forbidden-identity-key", id);
    if (!V1_SIGNAL_KEYS.includes(k)) return fail("unknown-key", id);
  }
  for (const k of V1_SIGNAL_KEYS) {
    if (!keys.includes(k)) return fail("unknown-key", id);
  }

  const actorRef = nonEmptyString(raw["actorRef"]);
  const verifiedAtIso = nonEmptyString(raw["verifiedAtIso"]);
  const projectScope = nonEmptyString(raw["projectScope"]);
  const actorType = nonEmptyString(raw["actorType"]);
  if (id === null || actorRef === null || verifiedAtIso === null
    || projectScope === null || actorType === null) {
    return fail("missing-required-string", id);
  }

  if (raw["signalType"] !== "WORKER_AVAILABILITY") {
    // This emitter produces supply, never demand. A requirement row here means
    // the query changed under us.
    return fail("missing-required-string", id);
  }

  const currentState = raw["currentState"];
  if (typeof currentState !== "string"
    || !(WORKER_INTENT_STATES as readonly string[]).includes(currentState)) {
    return fail("unknown-intent-state", id);
  }

  const freshness = raw["freshness"];
  if (typeof freshness !== "string"
    || !(FRESHNESS_VALUES as readonly string[]).includes(freshness)) {
    return fail("unknown-freshness", id);
  }
  if (!(EMITTABLE_FRESHNESS as readonly string[]).includes(freshness)) {
    return fail("not-current-supply", id);
  }

  const authorities = raw["authorities"];
  if (!isPlainObject(authorities)) return fail("missing-required-string", id);
  for (const k of Object.keys(authorities)) {
    if (!V1_AUTHORITY_KEYS.includes(k)) return fail("unknown-key", id);
  }
  // Read every authority through the same defensive reader the consumer uses,
  // so a value that is not exactly "GRANTED" becomes a denial on both ends
  // rather than differing between them.
  const matchAuthority = readAuthority(authorities["matchAuthority"]);
  if (matchAuthority !== "GRANTED") return fail("match-authority-not-granted", id);

  const geography = stringArray(raw["geography"]);
  const allowedMarkets = stringArray(raw["allowedMarkets"]);
  const allowedChannels = stringArray(raw["allowedChannels"]);
  const trades = stringArray(raw["trades"]);
  if (geography === null || allowedMarkets === null
    || allowedChannels === null || trades === null) {
    return fail("missing-required-string", id);
  }
  for (const c of [...geography, ...allowedMarkets]) {
    if (!ISO2.test(c)) return fail("bad-country-code", id);
  }

  const completenessRaw = raw["evidenceCompleteness"];
  let evidenceCompleteness: number | null = null;
  if (completenessRaw !== null && completenessRaw !== undefined) {
    if (typeof completenessRaw !== "number" || !Number.isFinite(completenessRaw)
      || completenessRaw < 0 || completenessRaw > 1) {
      return fail("bad-completeness", id);
    }
    evidenceCompleteness = completenessRaw;
  }

  const headcountRaw = raw["headcount"];
  const headcount =
    typeof headcountRaw === "number" && Number.isFinite(headcountRaw) ? headcountRaw : null;

  return {
    ok: true,
    signal: {
      schemaVersion: FIRST_PARTY_SIGNAL_SCHEMA,
      signalId: id,
      signalType: "WORKER_AVAILABILITY",
      actorType: actorType as FirstPartyMarketSignal["actorType"],
      actorRef,
      projectScope,
      currentState: currentState as FirstPartyMarketSignal["currentState"],
      freshness: freshness as SignalFreshness,
      geography,
      trades,
      availableFromIso: nonEmptyString(raw["availableFromIso"]),
      headcount,
      requirementSummary: null,
      evidenceCompleteness,
      verifiedAtIso,
      expiresAtIso: nonEmptyString(raw["expiresAtIso"]),
      authorities: {
        matchAuthority,
        contactAuthority: readAuthority(authorities["contactAuthority"]),
        publicationAuthority: readAuthority(authorities["publicationAuthority"]),
        identityDisclosureAuthority: readAuthority(
          authorities["identityDisclosureAuthority"],
        ),
      },
      allowedMarkets,
      allowedChannels,
      // A first-party FEED row is first-party by construction. Letting the row
      // declare its own provenance would let a mislabelled import claim the
      // first-party confidence advantage.
      provenance: "FIRST_PARTY_REGISTERED",
    },
  };
}

/** Validate a whole batch and summarise it. */
export function emitSignals(rows: readonly unknown[]): EmitResult {
  const signals: FirstPartyMarketSignal[] = [];
  const rejected: RejectedRow[] = [];
  const byIntent: Record<string, number> = {};
  const authorityCounts: Record<string, number> = {
    matchAuthority: 0,
    contactAuthority: 0,
    publicationAuthority: 0,
    identityDisclosureAuthority: 0,
  };

  for (const row of rows) {
    const result = validateEmittedRow(row);
    if (!result.ok) {
      rejected.push(result.rejection);
      continue;
    }
    const s = result.signal;
    signals.push(s);
    byIntent[s.currentState] = (byIntent[s.currentState] ?? 0) + 1;
    for (const k of V1_AUTHORITY_KEYS) {
      const grant = s.authorities[k as keyof typeof s.authorities];
      if (grant === "GRANTED") authorityCounts[k] = (authorityCounts[k] ?? 0) + 1;
    }
  }

  return { signals, rejected, byIntent, authorityCounts };
}

/**
 * One JSON object per line, newline-terminated, key order fixed by
 * `V1_SIGNAL_KEYS`.
 *
 * Stable key order is not cosmetic: it makes two rebuilds of unchanged consent
 * state byte-identical, which is what lets the transport skip a write and lets
 * an operator diff two runs and see only what a person actually changed.
 */
export function serialiseSignal(signal: FirstPartyMarketSignal): string {
  const source = signal as unknown as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const k of V1_SIGNAL_KEYS) {
    if (k === "authorities") {
      const auth: Record<string, unknown> = {};
      for (const a of V1_AUTHORITY_KEYS) {
        auth[a] = signal.authorities[a as keyof typeof signal.authorities];
      }
      ordered[k] = auth;
      continue;
    }
    ordered[k] = source[k];
  }
  return JSON.stringify(ordered);
}

/** What the read of the canonical state actually produced. */
export type FeedReadOutcome =
  | { readonly kind: "read"; readonly rows: readonly unknown[] }
  /** The read failed. NOT zero supply — no file may be written from this. */
  | { readonly kind: "unavailable"; readonly reason: string };

export interface FeedBuild {
  /** The file body, or null when no file may be written. */
  readonly body: string | null;
  readonly emitted: EmitResult | null;
  readonly unavailableReason: string | null;
}

/**
 * Build the file body from a read outcome.
 *
 * The consumer derives "present" from THE FILE EXISTING, never from its row
 * count, and it reports an absent file as SUPPLY_SOURCE_UNAVAILABLE ("we did
 * not look") versus an empty file as a real zero ("we looked and hold
 * nobody"). Those are different sentences said to an employer, so this
 * function refuses to collapse them: an `unavailable` outcome returns a null
 * body and the caller must leave the previous file alone rather than truncate
 * it to a zero it did not measure.
 */
export function buildFeedBody(outcome: FeedReadOutcome): FeedBuild {
  if (outcome.kind === "unavailable") {
    return { body: null, emitted: null, unavailableReason: outcome.reason };
  }
  const emitted = emitSignals(outcome.rows);
  const body = emitted.signals.map(serialiseSignal).join("\n")
    + (emitted.signals.length > 0 ? "\n" : "");
  return { body, emitted, unavailableReason: null };
}
