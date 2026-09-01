/**
 * @labourmarket/client-core — what every LabourMarket.ai client shares.
 *
 * Zero runtime dependencies, zero framework imports, no `server-only`. That is
 * the whole point: a Next.js server component, a React Native screen and a
 * future MCP server can all import this, and none of them needs the others.
 *
 * What is deliberately NOT here:
 *
 *   - Domain logic. Journal evidence derivation, matching, entitlements and AI
 *     routing already live in framework-free modules under `apps/web/lib`
 *     (measured in `docs/APP_READINESS_MAP.md` §3). Copying any of it here
 *     would create the second implementation this package exists to avoid.
 *     They move — once, when the canonical transport opens.
 *   - Permission rules. Those are RLS and SECURITY DEFINER functions in the
 *     database, and every client reaches them identically.
 *   - Secrets of any kind.
 */

export {
  LOCALES,
  ACTIVE_LOCALES,
  DEFAULT_LOCALE,
  TIER1_LOCALES,
  isActiveLocale,
  isPreviewTranslation,
  resolveDeviceLocale,
} from "./locales";
export type { Locale, ActiveLocale } from "./locales";

export {
  readClientConfig,
  describeConfigProblem,
  looksPrivileged,
} from "./config";
export type { ClientConfig, ConfigProblem, ConfigResult } from "./config";

export {
  SESSION_STORE_KEY,
  MAX_REFRESH_DELAY_MS,
  isExpired,
  millisecondsUntilRefresh,
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
  bearerTokenFor,
} from "./session";
export type {
  SessionStore,
  StoredSession,
  AuthState,
  SessionReadFailure,
} from "./session";

export {
  CAPABILITY_PATH,
  DOMAIN_TRANSPORT_STATUS,
  callCapability,
  callDomain,
  failureMessageKey,
} from "./transport";
export type {
  IdentityRefusal,
  CapabilityRequest,
  DomainFailure,
  DomainResult,
  DomainRequest,
  DomainDependencies,
  TransportStatus,
} from "./transport";

export {
  PARTICIPATION_MODES,
  contextKey,
  sameContext,
  initialSelection,
  selectContext,
} from "./actor-context";
export type {
  ParticipationMode,
  ActorContext,
  ContextHoldings,
  ContextSelection,
} from "./actor-context";
