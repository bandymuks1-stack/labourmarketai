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
   * publisher hands back a continuation token.
   */
  readonly pagination: "none" | "offset_limit" | "cursor";
  /**
   * True when the endpoint requires an API key. The adapter refuses to run a
   * key-requiring endpoint unless the owner has provisioned the secret — it
   * never falls back to an unauthenticated call, and never logs the key.
   */
  readonly requiresApiKey: boolean;
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
 * The governance row (source-governance.ts) ships legalStatus "unconfirmed"
 * and activation "off": the terms review is an OWNER decision and this code
 * does not pre-empt it. Every stage below is therefore built and tested but
 * imports nothing until the owner activates it.
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
      channel: "snapshot",
      host: "jobstream.api.jobtechdev.se",
      path: "/snapshot",
      pagination: "none",
      requiresApiKey: false,
    },
    {
      channel: "stream",
      host: "jobstream.api.jobtechdev.se",
      path: "/stream",
      pagination: "none",
      requiresApiKey: false,
    },
    {
      channel: "links",
      host: "links.api.jobtechdev.se",
      path: "/joblinks",
      pagination: "offset_limit",
      requiresApiKey: false,
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
