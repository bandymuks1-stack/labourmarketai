import { refusalStatus, type ApiIdentityFailure } from "@/lib/api/api-identity";

/**
 * EXTERNAL-CLIENT AUTH TAXONOMY — one machine-readable vocabulary for what an
 * external client (ChatGPT, Claude, Gemini, the mobile app, an API client —
 * any replaceable adapter) should DO when authentication does not simply
 * succeed. Pure: no I/O, no environment, no framework, so every mapping here
 * is unit-testable and reusable by the resource server AND by first-party
 * clients that talk to the authorization server directly.
 *
 * ## Why this exists (2026-09-02 incident)
 *
 * A real ChatGPT → LabourMarket.ai call failed with the assistant's generic
 * "We couldn't connect your account. Please try again." Root cause was a
 * DELETED refresh grant (the web logout signed out with scope `global`), but
 * nothing in the chain could say so: the token endpoint answered a bare
 * `400 invalid_grant`, the assistant rendered a generic wall, and the person
 * could not tell "retry" from "reconnect". The contract in §2 of the P0 brief:
 *
 *   RETRY AUTOMATICALLY   must be distinguishable from   RECONNECT REQUIRED.
 *
 * ## Two layers emit, one vocabulary names
 *
 * OAuth separates the RESOURCE SERVER (this app: verifies an access token and
 * serves the domain) from the AUTHORIZATION SERVER (Supabase Auth: issues,
 * refreshes and revokes grants). Each can only judge what it sees:
 *
 *   - This app sees ONLY the access token. It can say "rejected" (expired,
 *     revoked, foreign, malformed — deliberately indistinguishable on the
 *     wire, because telling an attacker which is an oracle) or "I could not
 *     ask". It can never know whether a refresh will succeed.
 *   - The authorization server sees the refresh grant. Only it can say
 *     "expired grant", "revoked grant", "missing scope", "unknown client".
 *
 * So the classes below are grouped by WHO emits them. A client maps the
 * resource server's answer to `retry_after_refresh`, attempts the refresh at
 * the authorization server, and only THEN learns whether the state is
 * recoverable. That two-step is the auth UX contract:
 *
 *   valid token                       → request succeeds
 *   rejected token + valid grant      → refresh → retry → succeeds, no UI
 *   rejected token + dead grant       → RECONNECT_REQUIRED, explicitly
 *
 * ## No oracle, still machine-readable
 *
 * `refusalStatus` in api-identity keeps every credential judgement the same
 * 401. This module keeps that property: `malformed-bearer` and
 * `invalid-bearer` map to the SAME class, status and header. The class adds a
 * documented next action, not information about the token.
 */

/** Classes emitted by THIS resource server at its API boundary. */
export type ResourceServerAuthClass =
  /** No credential was presented at all: authenticate (connect) first. */
  | "CREDENTIALS_MISSING"
  /** A credential was presented and NOT accepted — expired, revoked, foreign
   *  or malformed, deliberately not distinguished. Refresh, then retry once;
   *  if the refresh itself fails, the authorization server says why. */
  | "ACCESS_TOKEN_REJECTED"
  /** The credential could not be judged: the auth server was unreachable or
   *  failed. Keep the credential, retry later. NOT a fact about the caller. */
  | "AUTH_PROVIDER_UNAVAILABLE"
  /** A brake, not a verdict. Back off, keep the credential. */
  | "RATE_LIMITED";

/** Classes emitted by the AUTHORIZATION SERVER (token endpoint) and mapped by
 *  clients with `classifyTokenEndpointFailure`. Documented here so the whole
 *  platform uses ONE vocabulary. */
export type AuthorizationServerAuthClass =
  /** The access token's lifetime elapsed; a refresh is expected to work. */
  | "ACCESS_TOKEN_EXPIRED"
  /** The client holds no usable access token and must refresh before use. */
  | "REFRESH_REQUIRED"
  /** The refresh attempt failed for a reason that is not a dead grant
   *  (malformed request, transient rejection). One retry is reasonable. */
  | "REFRESH_FAILED"
  /** The refresh grant no longer exists (revoked, expired, deleted with its
   *  session). Nothing but a new authorization can recover this. */
  | "REFRESH_REVOKED"
  /** The client has no link to an account at all (no consent, no session). */
  | "ACCOUNT_LINK_MISSING"
  /** The link exists but cannot be used (unknown client, bad redirect,
   *  client registration changed). */
  | "ACCOUNT_LINK_INVALID"
  /** The grant lacks a scope the operation needs (e.g. `offline_access`). */
  | "SCOPE_MISSING"
  /** The person revoked the client's access deliberately. */
  | "USER_REVOKED_ACCESS"
  /** The authorization server failed on its side (5xx / unreachable). */
  | "SERVER_AUTH_FAILURE";

export type ExternalClientAuthClass =
  | ResourceServerAuthClass
  | AuthorizationServerAuthClass;

/** What the CLIENT should do next. This is the whole point of the taxonomy. */
export type ClientAction =
  /** Obtain a credential (run the connect / OAuth flow). */
  | "authenticate"
  /** Refresh the access token, then retry the SAME request once. No UI. */
  | "retry_after_refresh"
  /** Retry the same request later with the SAME credential. No UI. */
  | "retry_later"
  /** Slow down; the credential is fine. No UI. */
  | "back_off"
  /** Tell the person their connection must be re-established. UI. */
  | "reconnect";

/** The user-facing distinction — never the technical detail. */
export type UserMessageKind =
  /** Nothing to show; the client handles it. */
  | "retry_automatically"
  /** Show a temporary-problem notice; nothing for the person to fix. */
  | "temporarily_unavailable"
  /** Show a reconnect prompt; it is the ONLY state that needs the person. */
  | "reconnect_required";

export type AuthRefusal = {
  readonly errorClass: ResourceServerAuthClass;
  readonly clientAction: ClientAction;
  readonly userMessage: UserMessageKind;
  readonly status: 401 | 429 | 503;
};

/**
 * Map the identity resolver's refusal to the external-client contract.
 * Status comes from `refusalStatus` — the ONE refusal→HTTP mapping — so this
 * module can never disagree with api-identity about the wire status.
 */
export function classifyRefusal(reason: ApiIdentityFailure): AuthRefusal {
  const status = refusalStatus(reason);
  switch (reason) {
    case "no-credentials":
      return {
        errorClass: "CREDENTIALS_MISSING",
        clientAction: "authenticate",
        userMessage: "reconnect_required",
        status,
      };
    case "malformed-bearer":
    case "invalid-bearer":
      // Same class for both — see "No oracle" above.
      return {
        errorClass: "ACCESS_TOKEN_REJECTED",
        clientAction: "retry_after_refresh",
        userMessage: "retry_automatically",
        status,
      };
    case "rate-limited":
      return {
        errorClass: "RATE_LIMITED",
        clientAction: "back_off",
        userMessage: "retry_automatically",
        status,
      };
    case "identity-unavailable":
      return {
        errorClass: "AUTH_PROVIDER_UNAVAILABLE",
        clientAction: "retry_later",
        userMessage: "temporarily_unavailable",
        status,
      };
  }
}

/**
 * The RFC 6750 §3 `WWW-Authenticate` challenge for a refusal, carrying the
 * RFC 9728 pointer so an OAuth-capable client can discover the authorization
 * server. Per RFC 6750 the `error` attribute is OMITTED when no credential
 * was attempted (the client did not fail — it has not started), and is
 * `invalid_token` for any rejected credential. `invalid_token` is precisely
 * the signal that tells a conforming client "refresh and retry" — it is the
 * standard's own RETRY-vs-RECONNECT hinge, which is why the resource server
 * must emit it rather than a bare 401.
 *
 * Returns null for statuses that are not challenges (429, 503).
 */
export function wwwAuthenticateChallenge(
  origin: string,
  errorClass: ResourceServerAuthClass,
): string | null {
  const resource = `resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
  switch (errorClass) {
    case "CREDENTIALS_MISSING":
      return `Bearer ${resource}`;
    case "ACCESS_TOKEN_REJECTED":
      return `Bearer error="invalid_token", ${resource}`;
    case "AUTH_PROVIDER_UNAVAILABLE":
    case "RATE_LIMITED":
      return null;
  }
}

/** The JSON body an external client receives on refusal. Machine-readable,
 *  and deliberately free of anything an attacker could learn from. */
export function refusalBody(refusal: AuthRefusal): {
  ok: false;
  error: ResourceServerAuthClass;
  client_action: ClientAction;
  user_message: UserMessageKind;
} {
  return {
    ok: false,
    error: refusal.errorClass,
    client_action: refusal.clientAction,
    user_message: refusal.userMessage,
  };
}

/**
 * What an OAuth token-endpoint failure means. Input is the RFC 6749 §5.2
 * error response (`error`, optional `error_description`) plus the HTTP
 * status; output is the platform class and the client's next action.
 *
 * Supabase Auth's `invalid_grant` descriptions are matched on the STABLE
 * phrases it uses ("Refresh Token Not Found", "Already Used"); anything
 * unrecognised stays `REFRESH_FAILED` (one retry, then reconnect) rather
 * than being guessed into a dead-grant class.
 */
export function classifyTokenEndpointFailure(input: {
  readonly status?: number;
  readonly error?: string;
  readonly errorDescription?: string;
  /**
   * Supabase Auth's LEGACY error shape on `/oauth/token` (measured in
   * production 2026-09-02): `{"code":400,"error_code":"refresh_token_not_found",
   * "msg":"Invalid Refresh Token: Refresh Token Not Found"}` — NO RFC 6749 §5.2
   * `error` member at all. A standards-only client cannot recognise that as
   * `invalid_grant` and therefore never restarts authorization; it shows a
   * generic failure instead. First-party clients pass `errorCode` / `msg`
   * here so they classify it correctly regardless of shape.
   */
  readonly errorCode?: string;
  readonly msg?: string;
}): {
  readonly errorClass: AuthorizationServerAuthClass;
  readonly clientAction: ClientAction;
  readonly userMessage: UserMessageKind;
} {
  const status = input.status ?? 0;
  const legacy = (input.errorCode ?? "").toLowerCase();
  // Legacy GoTrue codes fold into their RFC equivalents FIRST, so the rest
  // of this function reasons about one vocabulary.
  const error = (input.error ?? "").toLowerCase() || legacyToRfcError(legacy);
  const desc = ((input.errorDescription ?? "") || (input.msg ?? "")).toLowerCase();

  if (status >= 500 || status === 0) {
    return { errorClass: "SERVER_AUTH_FAILURE", clientAction: "retry_later", userMessage: "temporarily_unavailable" };
  }
  if (status === 429) {
    // Not a class of its own on the AS side: the grant is fine.
    return { errorClass: "REFRESH_FAILED", clientAction: "back_off", userMessage: "retry_automatically" };
  }
  if (error === "invalid_grant") {
    if (desc.includes("not found") || desc.includes("revoked") || desc.includes("expired")) {
      return { errorClass: "REFRESH_REVOKED", clientAction: "reconnect", userMessage: "reconnect_required" };
    }
    if (desc.includes("already used")) {
      // Rotation reuse: GoTrue revokes the family. Unrecoverable without a
      // new authorization.
      return { errorClass: "REFRESH_REVOKED", clientAction: "reconnect", userMessage: "reconnect_required" };
    }
    return { errorClass: "REFRESH_FAILED", clientAction: "retry_after_refresh", userMessage: "retry_automatically" };
  }
  if (error === "invalid_client" || error === "unauthorized_client") {
    return { errorClass: "ACCOUNT_LINK_INVALID", clientAction: "reconnect", userMessage: "reconnect_required" };
  }
  if (error === "invalid_scope" || error === "insufficient_scope") {
    return { errorClass: "SCOPE_MISSING", clientAction: "reconnect", userMessage: "reconnect_required" };
  }
  if (error === "access_denied") {
    return { errorClass: "USER_REVOKED_ACCESS", clientAction: "reconnect", userMessage: "reconnect_required" };
  }
  return { errorClass: "REFRESH_FAILED", clientAction: "reconnect", userMessage: "reconnect_required" };
}

/** GoTrue legacy `error_code` → RFC 6749 `error`. Unknown codes map to "" so
 *  the caller's own fallbacks apply. */
function legacyToRfcError(code: string): string {
  switch (code) {
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "bad_code_verifier":
    case "flow_state_not_found":
    case "flow_state_expired":
    case "invalid_grant":
      return "invalid_grant";
    case "oauth_client_not_found":
    case "invalid_client":
    case "unauthorized_client":
      return "invalid_client";
    case "invalid_scope":
      return "invalid_scope";
    case "access_denied":
      return "access_denied";
    default:
      return "";
  }
}

/**
 * Parse an OAuth token-endpoint failure body of EITHER shape into the input
 * `classifyTokenEndpointFailure` expects — RFC 6749 §5.2
 * (`error` / `error_description`) or Supabase Auth's legacy
 * (`error_code` / `msg`). Tolerates a non-JSON body.
 */
export function parseTokenEndpointError(
  status: number,
  body: unknown,
): Parameters<typeof classifyTokenEndpointFailure>[0] & { readonly rfcShaped: boolean } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (k: string): string | undefined => (typeof b[k] === "string" ? (b[k] as string) : undefined);
  const error = str("error");
  return {
    status,
    error,
    errorDescription: str("error_description"),
    errorCode: str("error_code"),
    msg: str("msg"),
    rfcShaped: typeof error === "string" && error.length > 0,
  };
}

/**
 * Privacy-safe observability record for an external-client auth or tool
 * outcome. It carries CLASSES and NAMES, never contents: no token, no
 * authorization code, no cookie, no user id, no tool arguments, no payload.
 * Emit it as one JSON line so the platform's log search can count
 * `event=external_client.auth outcome=refused error_class=…` operationally —
 * a connector regression must show up here before the owner finds it by hand.
 */
export type ExternalClientAuthEvent =
  | {
      readonly event: "external_client.auth";
      readonly outcome: "ok";
      readonly transport: "bearer" | "cookie";
      readonly door: string;
    }
  | {
      readonly event: "external_client.auth";
      readonly outcome: "refused";
      readonly error_class: ResourceServerAuthClass;
      readonly status: 401 | 429 | 503;
      readonly door: string;
    }
  | {
      readonly event: "external_client.tool";
      readonly door: string;
      readonly tool: string;
      readonly ok: boolean;
      /** The capability's own outcome code on failure (e.g. `confirmation_rejected`). */
      readonly code?: string;
    };

const FORBIDDEN_LOG_KEYS = new Set([
  "token", "access_token", "refresh_token", "authorization", "code", "cookie",
  "secret", "password", "jwt", "user_id", "userId", "email", "arguments", "payload",
]);

/** Serialise an event for logging. Defensive: refuses (throws) if a forbidden
 *  key ever reaches it, so a future edit cannot quietly start logging
 *  credentials or personal data. */
export function serializeAuthEvent(event: ExternalClientAuthEvent): string {
  for (const key of Object.keys(event)) {
    if (FORBIDDEN_LOG_KEYS.has(key)) {
      throw new Error(`external-client auth event must not carry "${key}"`);
    }
  }
  return JSON.stringify(event);
}
