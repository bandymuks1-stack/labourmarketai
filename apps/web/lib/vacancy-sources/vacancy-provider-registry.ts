/**
 * PUBLIC VACANCY PROVIDER REGISTRY — the provider architecture.
 *
 * Adding a country is a ONE-ENTRY change: append a descriptor here and a
 * matching governance row in lib/intelligence/source-governance.ts. Nothing
 * else in the pipeline is country-aware — the normalizer, the categorizer,
 * the deduper, the validator, the importer and the adapter all read the
 * descriptor. That is what "supports future countries without redesign"
 * means concretely, and the boundary guard pins it (no provider key may be
 * hard-coded outside this file and its provider modules).
 *
 * A descriptor is a CONTRACT, not a switch. It cannot activate anything:
 * activation lives in source-governance (owner decision) and the runtime env
 * kill switch (owner action). A descriptor with a perfect shape still imports
 * nothing until both are on.
 *
 * Pure module: no IO, no env, no fetch. Hosts are BARE HOSTNAMES — this layer
 * never builds a fetchable URL (the server adapter does, from these names).
 */
import {
  VACANCY_IMPORT_BOUNDS,
  type VacancyCountryIso,
  type VacancyImportChannel,
  type VacancyProviderKey,
} from "./vacancy-contract";

/** Per-channel endpoint description. `path` is a path only — never a URL. */
export interface VacancyChannelEndpointV1 {
  readonly channel: VacancyImportChannel;
  /** Bare hostname (no scheme, no path). The adapter adds https:// itself. */
  readonly host: string;
  /** Absolute path on that host, leading slash included. */
  readonly path: string;
  /**
   * Whether the endpoint pages. `none` = one response holds the whole batch
   * (a snapshot); `offset_limit` = classic offset/limit; `cursor` = the
   * publisher hands back a continuation token; `time_window` = the endpoint
   * has no paging of its own and is bounded by a time slice instead, walked
   * forward by the importer (`window` below is then REQUIRED).
   */
  readonly pagination: "none" | "offset_limit" | "cursor" | "time_window";
  /**
   * Time-slice configuration for a `time_window` endpoint. Required for that
   * mode and meaningless otherwise.
   */
  readonly window?: VacancyChannelWindowV1;
  /**
   * True when the endpoint requires an API key. The adapter refuses to run a
   * key-requiring endpoint unless the owner has provisioned the secret — it
   * never falls back to an unauthenticated call, and never logs the key.
   */
  readonly requiresApiKey: boolean;
  /**
   * How often this channel should run, and whether it repeats at all. This is
   * the PROVIDER'S OWN recommendation, recorded here so an operator schedule
   * is derived from it rather than invented. It is a contract, not a
   * scheduler: nothing in this repo runs on a timer today.
   */
  readonly cadence: VacancyChannelCadenceV1;
}

/**
 * Channel cadence. `runOnce` marks a channel that must NOT be repeated on a
 * schedule — a full snapshot is a cold-start / reconciliation act, and
 * re-pulling it every minute is exactly the abuse an open API asks you not to
 * commit.
 */
export interface VacancyChannelCadenceV1 {
  /** Nominal interval between runs, in seconds. */
  readonly intervalSeconds: number;
  /** True when the channel is a one-shot (snapshot), not a poll. */
  readonly runOnce: boolean;
  /**
   * True when the channel resumes from a cursor/checkpoint rather than
   * re-reading from the beginning. Required for any polling channel — polling
   * without a checkpoint is a repeated full read wearing a costume.
   */
  readonly checkpointed: boolean;
}

/**
 * Provider-recommended cadences for Arbetsförmedlingen / JobTech, as given to
 * us by the provider (2026-08-04):
 *   - JobStream: ONE initial snapshot, then poll the stream about once a
 *     minute, resuming from the last timestamp;
 *   - JobAd Links: refresh about once a day.
 *
 * Named constants rather than bare numbers so the recommendation is legible
 * and a change is a visible edit.
 */
const ONE_MINUTE_SECONDS = 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;

/**
 * How a `time_window` channel is sliced. The query-key NAMES live here rather
 * than in the importer for the same reason every other publisher fact does:
 * the shared stages must not learn one publisher's parameter vocabulary, or
 * the next country becomes an edit to the pipeline instead of an entry here.
 */
export interface VacancyChannelWindowV1 {
  /** Query key carrying the INCLUSIVE start of the slice. */
  readonly startQueryKey: string;
  /** Query key carrying the EXCLUSIVE end of the slice. */
  readonly endQueryKey: string;
  /** Width of one slice, in seconds. Chosen from a MEASURED response size. */
  readonly widthSeconds: number;
  /**
   * Never request closer to `now` than this. The publisher's write is not
   * instantaneous, and since a consumed window's end becomes the checkpoint,
   * a record landing just after a window closed would be skipped forever.
   */
  readonly safetyLagSeconds: number;
}

export interface VacancyProviderDescriptorV1 {
  readonly key: VacancyProviderKey;
  /**
   * The lib/intelligence/source-governance.ts profile key. Deliberately the
   * SAME string as `key`: one source, one governance row, one owner decision.
   */
  readonly governanceSourceKey: string;
  readonly countryIso: VacancyCountryIso;
  /** i18n code for the provider's display name — never a display string. */
  readonly displayNameCode: string;
  /**
   * i18n code for the attribution line that MUST accompany any rendering of
   * this provider's records when the governance row sets attributionRequired.
   */
  readonly attributionCode: string;
  /** Language the publisher writes its ads in. Declared, never sniffed. */
  readonly sourceLanguage: string;
  /** Platform locale the translation stage targets for this provider. */
  readonly defaultTargetLanguage: string;
  /** Channels this provider actually offers. */
  readonly endpoints: readonly VacancyChannelEndpointV1[];
  /** Version of the transform code that produces canonical records. Bump on
   *  any change that would alter an existing record's canonical fields. */
  readonly transformVersion: string;
  /**
   * Provider-specific bound overrides. A descriptor may only ever TIGHTEN the
   * shared bounds — `resolveProviderBounds` clamps, so a typo cannot widen a
   * limit (verified by test).
   */
  readonly boundOverrides?: Partial<{
    readonly maxItemsPerPage: number;
    readonly maxPagesPerSession: number;
    readonly maxAcceptedPerSession: number;
    readonly maxResponseBytes: number;
    readonly requestTimeoutMs: number;
  }>;
}

/**
 * Arbetsförmedlingen — the Swedish Public Employment Service, published
 * through JobTech Development. Three channels: a full snapshot, a delta
 * stream, and the aggregated JobAd Links feed.
 *
 * PROVIDER PERMISSION IS CONFIRMED (2026-08-04): the APIs are free, keyless,
 * require no prior notification, and the data is CC0. Attribution is
 * requested by the provider and required by our product policy.
 *
 * The governance row (source-governance.ts) carries legalStatus "confirmed"
 * and, since the owner's 2026-08-09 decision
 * (docs/human-gates/arbetsformedlingen-activation-gate.md), activation "on".
 * The runtime env switch (VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED) remains
 * the second, independent gate — code alone still imports nothing.
 *
 * Channel cadence is the provider's own recommendation, encoded in
 * VACANCY_CHANNEL_CADENCE below so an operator cannot invent a harsher one.
 */
const ARBETSFORMEDLINGEN: VacancyProviderDescriptorV1 = {
  key: "arbetsformedlingen",
  governanceSourceKey: "arbetsformedlingen",
  countryIso: "SE",
  displayNameCode: "intelligence.sources.arbetsformedlingen",
  attributionCode: "vacancySources.attribution.arbetsformedlingen",
  sourceLanguage: "sv",
  defaultTargetLanguage: "en",
  endpoints: [
    {
      // ONE initial snapshot. Never on a schedule — see `runOnce`.
      channel: "snapshot",
      host: "jobstream.api.jobtechdev.se",
      path: "/snapshot",
      pagination: "none",
      requiresApiKey: false,
      cadence: {
        intervalSeconds: 0,
        runOnce: true,
        checkpointed: false,
      },
    },
    {
      // Deltas, polled about once a minute, resuming from the last cursor.
      //
      // WALKED IN TIME SLICES, not requested in one go. `/stream` takes only
      // a start bound and answers with everything changed since it, in a
      // single un-paginated body — so the response grows with the gap since
      // the last success and eventually exceeds the transport byte cap for
      // good (measured 2026-08-11: a ~1.8-day gap answered 31.9 MiB against a
      // 16 MiB cap, and a failed run cannot advance the checkpoint, so the
      // next request is wider still). `updated-before-date` is a real,
      // honoured JobStream parameter — the same request bounded to a ~4 h
      // slice answered 0.51 MiB — so bounding both ends turns an unbounded
      // ask into an affordable walk that drains a backlog instead of
      // deadlocking on it.
      channel: "stream",
      host: "jobstream.api.jobtechdev.se",
      path: "/stream",
      pagination: "time_window",
      window: {
        startQueryKey: "date",
        endQueryKey: "updated-before-date",
        // 3 h measured at ~0.4 MiB — two orders of magnitude under the cap,
        // so an unusually busy slice still cannot reach it.
        widthSeconds: 3 * 60 * 60,
        safetyLagSeconds: ONE_MINUTE_SECONDS,
      },
      requiresApiKey: false,
      cadence: {
        intervalSeconds: ONE_MINUTE_SECONDS,
        runOnce: false,
        checkpointed: true,
      },
    },
    {
      // JobAd Links: a daily refresh, paged.
      channel: "links",
      host: "links.api.jobtechdev.se",
      path: "/joblinks",
      pagination: "offset_limit",
      requiresApiKey: false,
      cadence: {
        intervalSeconds: ONE_DAY_SECONDS,
        runOnce: false,
        checkpointed: true,
      },
    },
  ],
  transformVersion: "vacancy-arbetsformedlingen-v1",
};

export const VACANCY_PROVIDERS: readonly VacancyProviderDescriptorV1[] = [
  ARBETSFORMEDLINGEN,
];

export function getVacancyProvider(
  key: string,
): VacancyProviderDescriptorV1 | null {
  return VACANCY_PROVIDERS.find((p) => p.key === key) ?? null;
}

/** Every provider serving a given country. Empty is a valid answer. */
export function vacancyProvidersForCountry(
  countryIso: string,
): readonly VacancyProviderDescriptorV1[] {
  const iso = countryIso.trim().toUpperCase();
  return VACANCY_PROVIDERS.filter((p) => p.countryIso === iso);
}

export function getVacancyEndpoint(
  provider: VacancyProviderDescriptorV1,
  channel: VacancyImportChannel,
): VacancyChannelEndpointV1 | null {
  return provider.endpoints.find((e) => e.channel === channel) ?? null;
}

export function providerSupportsChannel(
  provider: VacancyProviderDescriptorV1,
  channel: VacancyImportChannel,
): boolean {
  return getVacancyEndpoint(provider, channel) !== null;
}

/** The shared bounds widened from their literal types — a resolved bound is a
 *  number, not the specific ceiling it happened to start from. */
export type ResolvedVacancyBounds = {
  readonly [K in keyof typeof VACANCY_IMPORT_BOUNDS]: number;
};

/**
 * The bounds actually in force for one provider. Overrides may only tighten:
 * each value is clamped to at most the shared ceiling and at least 1, so a
 * descriptor typo can never widen a limit or produce a zero/negative bound.
 */
export function resolveProviderBounds(
  provider: VacancyProviderDescriptorV1,
): ResolvedVacancyBounds {
  const o = provider.boundOverrides;
  if (!o) return VACANCY_IMPORT_BOUNDS;
  const tighten = (ceiling: number, candidate: number | undefined): number => {
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      return ceiling;
    }
    return Math.max(1, Math.min(ceiling, Math.floor(candidate)));
  };
  return {
    ...VACANCY_IMPORT_BOUNDS,
    maxItemsPerPage: tighten(
      VACANCY_IMPORT_BOUNDS.maxItemsPerPage,
      o.maxItemsPerPage,
    ),
    maxPagesPerSession: tighten(
      VACANCY_IMPORT_BOUNDS.maxPagesPerSession,
      o.maxPagesPerSession,
    ),
    maxAcceptedPerSession: tighten(
      VACANCY_IMPORT_BOUNDS.maxAcceptedPerSession,
      o.maxAcceptedPerSession,
    ),
    maxResponseBytes: tighten(
      VACANCY_IMPORT_BOUNDS.maxResponseBytes,
      o.maxResponseBytes,
    ),
    requestTimeoutMs: tighten(
      VACANCY_IMPORT_BOUNDS.requestTimeoutMs,
      o.requestTimeoutMs,
    ),
  };
}
