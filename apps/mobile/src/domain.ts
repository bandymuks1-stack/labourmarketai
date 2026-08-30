import {
  DOMAIN_TRANSPORT_STATUS,
  callDomain,
  failureMessageKey,
  type DomainFailure,
  type DomainRequest,
  type DomainResult,
} from "@labourmarket/client-core";

import { CONFIG } from "./config";
import type { MessageKey } from "./i18n/messages";

/**
 * THE ONLY WAY THIS APP READS OR WRITES PRODUCT DATA — and today it refuses.
 *
 * Every screen that would show journal entries, hours, a Living CV or
 * opportunities goes through here. Not through `supabase` in `supabase.ts`:
 * that client authenticates and nothing else. Querying tables from a phone
 * would mean re-deriving on the device the meaning the canonical domain
 * already owns, and that second implementation is precisely what
 * `docs/APP_READINESS_MAP.md` exists to prevent.
 *
 * The transport is closed (owner-gated auth-core, PR #1336), so `request`
 * returns `transport_unavailable`. A screen renders that as a sentence a
 * person can act on. Nothing renders an empty list, because there is no list —
 * absence of an answer is never shown as an answer of absence.
 */

export type { DomainFailure, DomainResult };

export const TRANSPORT_STATUS = DOMAIN_TRANSPORT_STATUS;

export async function request<T>(
  input: Omit<DomainRequest, "accessToken"> & { accessToken: string | null },
): Promise<DomainResult<T>> {
  if (CONFIG === null) {
    return {
      ok: false,
      failure: {
        kind: "transport_unavailable",
        because: "this build has no API configuration",
      },
    };
  }
  return callDomain<T>(
    { apiBaseUrl: CONFIG.apiBaseUrl, fetch: globalThis.fetch },
    input,
  );
}

/**
 * The message key for a failure, resolved through this app's own catalogue.
 *
 * The switch is written out rather than casting `failureMessageKey`'s string,
 * so that adding a failure kind to the shared package without adding its
 * sentence to every language catalogue is a TYPECHECK failure here. A cast
 * would have compiled and shipped a raw key to somebody's phone.
 *
 * `failureMessageKey` is still called, and its answer asserted against this
 * one, so the two cannot silently disagree about which key names which
 * failure.
 */
export function failureKey(failure: DomainFailure): MessageKey {
  const key: MessageKey = (() => {
    switch (failure.kind) {
      case "transport_unavailable":
        return "domain.unavailable.notConnectedYet";
      case "not_authenticated":
        return "domain.unavailable.signInAgain";
      case "unreachable":
        return "domain.unavailable.offline";
      case "unreadable":
        return "domain.unavailable.unexpectedAnswer";
      case "refused":
        switch (failure.reason) {
          case "no_credentials":
            return "domain.refused.no_credentials";
          case "invalid_token":
            return "domain.refused.invalid_token";
          case "no_profile":
            return "domain.refused.no_profile";
          case "identity_unavailable":
            return "domain.refused.identity_unavailable";
        }
    }
  })();
  return key;
}

/** The shared package and this catalogue must name the same key. */
export function keysAgree(failure: DomainFailure): boolean {
  return failureMessageKey(failure) === failureKey(failure);
}
