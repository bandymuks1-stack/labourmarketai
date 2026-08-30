/**
 * REACHING THE CANONICAL DOMAIN — the one seam a second client needs, and the
 * honest statement that it is not open yet.
 *
 * `docs/APP_READINESS_MAP.md` §2 measured the whole gap between this platform
 * and a mobile app, and it is one sentence: every authenticated path — all 184
 * server actions and every `app/api` route — resolves identity from browser
 * cookies. A phone holds a Supabase JWT, not a cookie jar. So today a native
 * client cannot call a server action (they are an RPC protocol private to the
 * Next.js client bundle) and cannot call an API route either (it would resolve
 * no user, and RLS would correctly return nothing).
 *
 * Opening that seam is an auth-core change: RED, owner-gated, and parked as
 * PR #1336 until real-token proof is complete. **This file does not open it.**
 *
 * ## What this file does instead
 *
 * It writes down the contract, so that when the gate opens nothing has to be
 * invented under time pressure, and — more importantly — so that the client
 * REFUSES rather than improvises in the meantime.
 *
 * The improvisation would be obvious and wrong: query the database directly
 * with `supabase-js` from the device. RLS would even permit it. But the
 * canonical domain is not the tables — it is the derivation on top of them (a
 * journal entry becomes evidence becomes a capability becomes a CV line), and
 * a device re-deriving that would be the second implementation this
 * architecture exists to prevent. Reads and writes of product meaning go
 * through the canonical routes or they do not happen.
 *
 * So `callDomain` returns `transport_unavailable`, the UI says so in words a
 * person understands, and no screen ever shows an empty list as if it were a
 * finding.
 */

/**
 * The four refusals `resolveApiIdentity` distinguishes on the server side
 * (PR #1336), restated here so a client can react to each as the different
 * fact it is — the #1314 rule again: a read that did not answer is not an
 * answer.
 */
export type IdentityRefusal =
  | "no_credentials"
  | "invalid_token"
  | "no_profile"
  | "identity_unavailable";

export type DomainFailure =
  /**
   * The seam is not open. Not the user's fault, not a permission finding, and
   * NOT an empty result.
   */
  | { readonly kind: "transport_unavailable"; readonly because: string }
  /** The client holds no usable credential. Send the user to sign in. */
  | { readonly kind: "not_authenticated" }
  /** The server refused, and said which refusal. */
  | {
      readonly kind: "refused";
      readonly reason: IdentityRefusal;
      readonly status: number;
    }
  /** The request never completed. Offer a retry; assert nothing. */
  | { readonly kind: "unreachable"; readonly detail: string }
  /** The server answered, but not with something this client understands. */
  | { readonly kind: "unreadable"; readonly status: number };

export type DomainResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly failure: DomainFailure };

export type TransportStatus =
  | { readonly open: true }
  | { readonly open: false; readonly because: string };

/**
 * THE GATE.
 *
 * Flip this to `{ open: true }` in the same pull request that merges the
 * owner-approved bearer resolver into the API boundary, and not one commit
 * before. Every enabled-path behaviour is already implemented and tested by
 * injecting an open status, so the flip is a one-line change with no new code
 * written under pressure.
 */
export const DOMAIN_TRANSPORT_STATUS: TransportStatus = {
  open: false,
  because:
    "The canonical API boundary accepts browser cookies only. Bearer transport is an owner-gated auth-core change (PR #1336) and is not merged.",
};

const KNOWN_REFUSALS: readonly IdentityRefusal[] = [
  "no_credentials",
  "invalid_token",
  "no_profile",
  "identity_unavailable",
];

function refusalFor(status: number, body: unknown): IdentityRefusal | null {
  const reason =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).reason
      : undefined;
  if (
    typeof reason === "string" &&
    (KNOWN_REFUSALS as readonly string[]).includes(reason)
  ) {
    return reason as IdentityRefusal;
  }
  // The server refused without naming a refusal. Map the status rather than
  // guess a cause: 503 in particular means "we could not establish identity",
  // which is emphatically not "you are not allowed".
  if (status === 401) return "no_credentials";
  if (status === 403) return "no_profile";
  if (status === 503) return "identity_unavailable";
  return null;
}

export type DomainRequest = {
  readonly path: string;
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  /** The caller's Supabase access token, or null when there is none. */
  readonly accessToken: string | null;
  /** Language for server-rendered text. The device's, not a guess. */
  readonly locale?: string;
};

export type DomainDependencies = {
  readonly apiBaseUrl: string;
  readonly fetch: typeof fetch;
  /** Injectable so the enabled path is testable before the gate opens. */
  readonly status?: TransportStatus;
};

/**
 * Call a canonical API route.
 *
 * Note what is absent: any notion of scope, role, organization or visibility.
 * This carries WHO (a token the platform's own auth server issued) and lets
 * the database decide WHAT. A client that filtered results itself would be
 * asserting authority it does not have.
 */
export async function callDomain<T>(
  deps: DomainDependencies,
  request: DomainRequest,
): Promise<DomainResult<T>> {
  const status = deps.status ?? DOMAIN_TRANSPORT_STATUS;
  if (!status.open) {
    return {
      ok: false,
      failure: { kind: "transport_unavailable", because: status.because },
    };
  }
  if (request.accessToken === null) {
    return { ok: false, failure: { kind: "not_authenticated" } };
  }

  const headers: Record<string, string> = {
    // The one transport difference between this client and the browser.
    Authorization: "Bearer " + request.accessToken,
    Accept: "application/json",
  };
  if (request.locale !== undefined) headers["Accept-Language"] = request.locale;
  if (request.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await deps.fetch(deps.apiBaseUrl + request.path, {
      method: request.method ?? "GET",
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "unreachable",
        detail:
          error instanceof Error ? error.message : "network request failed",
      },
    };
  }

  let payload: unknown = undefined;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const reason = refusalFor(response.status, payload);
    if (reason !== null) {
      return {
        ok: false,
        failure: { kind: "refused", reason, status: response.status },
      };
    }
    return { ok: false, failure: { kind: "unreadable", status: response.status } };
  }

  if (payload === undefined) {
    return { ok: false, failure: { kind: "unreadable", status: response.status } };
  }
  return { ok: true, data: payload as T };
}

/**
 * A message key for each failure.
 *
 * Keys, not sentences: the text is translated in the client's own catalogue,
 * because a person reading a refusal in Lithuanian should not be handed
 * English written into a shared package.
 */
export function failureMessageKey(failure: DomainFailure): string {
  switch (failure.kind) {
    case "transport_unavailable":
      return "domain.unavailable.notConnectedYet";
    case "not_authenticated":
      return "domain.unavailable.signInAgain";
    case "refused":
      return "domain.refused." + failure.reason;
    case "unreachable":
      return "domain.unavailable.offline";
    case "unreadable":
      return "domain.unavailable.unexpectedAnswer";
  }
}
