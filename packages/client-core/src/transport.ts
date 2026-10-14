/**
 * REACHING THE CANONICAL DOMAIN — the one seam a second client needs.
 *
 * ## The gate is OPEN, and here is the receipt
 *
 * `docs/APP_READINESS_MAP.md` §2 measured the whole gap between this platform
 * and a mobile app as one sentence: every authenticated path resolved identity
 * from browser cookies. That seam was opened by the auth-core bearer resolver
 * (#1331, merged 2026-08-29): `resolveApiIdentity` on the API boundary accepts
 * `Authorization: Bearer <supabase JWT>` and hands every handler the caller's
 * own RLS-scoped client. No service role, no second permission model — a
 * bearer caller can never do more than the same person's web session.
 *
 * The domain surface behind that seam is the capability registry served at
 * `/api/mcp` (`apps/web/lib/capabilities/registry.ts`): POST-only JSON-RPC 2.0
 * (`tools/call`), one capability per domain action, each running the SAME core
 * the web routes run. `callCapability` below speaks that protocol; `callDomain`
 * remains the plain-REST primitive it is built on.
 *
 * ## What still may not happen
 *
 * The improvisation this file forbids is unchanged: querying the database
 * directly with `supabase-js` from the device. RLS would even permit it. But
 * the canonical domain is not the tables — it is the derivation on top of them
 * (a journal entry becomes evidence becomes a capability becomes a CV line),
 * and a device re-deriving that would be the second implementation this
 * architecture exists to prevent. Reads and writes of product meaning go
 * through the canonical capabilities or they do not happen.
 */

/**
 * The refusals a client keeps apart — the #1314 rule: a read that did not
 * answer is not an answer, and "you may not" is not "we could not check".
 *
 * `/api/mcp` deliberately returns NO `reason` field in refusal bodies (naming
 * the exact credential defect would be an oracle), so in practice only the
 * status-code mapping below matters; a named body reason is still honoured for
 * routes that send one.
 */
export type IdentityRefusal =
  | "no_credentials"
  | "invalid_token"
  | "no_profile"
  | "not_authorized"
  | "rate_limited"
  | "identity_unavailable";

export type DomainFailure =
  /**
   * The seam is not open. Not the user's fault, not a permission finding, and
   * NOT an empty result.
   */
  | { readonly kind: "transport_unavailable"; readonly because: string }
  /** The client holds no usable credential. Send the user to sign in. */
  | { readonly kind: "not_authenticated" }
  /** The server refused to establish identity, and said which refusal. */
  | {
      readonly kind: "refused";
      readonly reason: IdentityRefusal;
      readonly status: number;
    }
  /**
   * The server DID identify the caller, ran the capability, and declined it —
   * a domain answer (`{ isError: true }` inside a 200), never a transport
   * problem and NEVER a success. `code` is the capability's machine word
   * (`no_worker_profile`, `unavailable`, …); `message` is the server's own
   * sentence.
   */
  | {
      readonly kind: "capability_refused";
      readonly code: string;
      readonly message: string;
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
 * THE GATE — OPEN since the bearer seam (#1331) merged 2026-08-29 and the
 * capability boundary `/api/mcp` went live behind it. The closed variant
 * remains in the type (and injectable via `DomainDependencies.status`) so a
 * build that must refuse — a broken configuration, a future incident switch —
 * still refuses honestly instead of improvising.
 */
export const DOMAIN_TRANSPORT_STATUS: TransportStatus = { open: true };

const KNOWN_REFUSALS: readonly IdentityRefusal[] = [
  "no_credentials",
  "invalid_token",
  "no_profile",
  "not_authorized",
  "rate_limited",
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
  // The server refused without naming a refusal — which is what `/api/mcp`
  // always does (anti-oracle). Map the status rather than guess a cause:
  //   401 — no usable credential was presented or it was rejected.
  //   403 — identified, but this request is not allowed. Emphatically NOT
  //         "you have no profile": mistranslating an authorization refusal
  //         into a missing-profile finding was a measured defect.
  //   429 — a brake, not a verdict. Back off; do not discard credentials.
  //   503 — "we could not establish identity", which is not "you may not".
  if (status === 401) return "no_credentials";
  if (status === 403) return "not_authorized";
  if (status === 429) return "rate_limited";
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
  /** Injectable so a refusing build stays testable. */
  readonly status?: TransportStatus;
  /**
   * How long one exchange (request AND reading the answer) may take before it
   * is reported as `unreachable`. Defaults to `DOMAIN_REQUEST_TIMEOUT_MS`.
   */
  readonly timeoutMs?: number;
};

/**
 * THE DEADLINE ON ONE EXCHANGE.
 *
 * React Native's `fetch` has no timeout of its own: on a weak mobile link (one
 * bar, a lift, a basement site) a request can neither succeed nor fail for
 * minutes, and a screen waiting on it spins with nothing to say — the "does
 * not spin forever" promise `CapabilityGate` makes was only as good as the
 * network. Past this deadline the exchange resolves to `unreachable`: the
 * screen shows its honest failure with a retry, and asserts nothing about the
 * data. A write that times out is UNSURE, not failed — the composer already
 * treats an `unreachable` confirm as "we do not know whether it arrived".
 *
 * Thirty seconds, not ten: a journal confirm runs the canonical write plus
 * the Living CV update server-side, and calling a slow success a failure
 * would teach people to write the same entry twice.
 */
export const DOMAIN_REQUEST_TIMEOUT_MS = 30_000;

class DeadlineExceeded extends Error {
  constructor(ms: number) {
    super("no answer within " + Math.round(ms / 1000) + " s");
  }
}

/**
 * Race `work` against the deadline. The timer is always cleared, and an
 * `AbortController` (where the runtime has one) cancels the underlying
 * request so a late answer cannot land after the screen moved on.
 */
async function withDeadline<T>(
  ms: number,
  work: (signal: AbortSignal | undefined) => Promise<T>,
): Promise<T> {
  const controller =
    typeof AbortController === "function" ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new DeadlineExceeded(ms));
    }, ms);
  });
  try {
    return await Promise.race([work(controller?.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * A `fetch` with the same deadline, for the one client that does not go
 * through `callDomain`: the auth client (`supabase-js`), whose sign-in,
 * registration and refresh would otherwise wait on a dead link indefinitely.
 * Past the deadline it REJECTS like a dropped connection, which `supabase-js`
 * reports as a retryable fetch error with no HTTP status — the app already
 * maps that to "we could not reach the server", never to "wrong password".
 *
 * A caller's own `signal` keeps working: where the runtime has
 * `AbortSignal.any` both signals reach the request; otherwise the caller's
 * signal does, and the deadline still settles the call by itself.
 */
export function fetchWithDeadline(
  fetchImpl: typeof fetch,
  timeoutMs: number = DOMAIN_REQUEST_TIMEOUT_MS,
): typeof fetch {
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    withDeadline(timeoutMs, (deadlineSignal) => {
      const own = init?.signal ?? undefined;
      const anyOf =
        typeof AbortSignal === "undefined"
          ? undefined
          : (
              AbortSignal as unknown as {
                any?: (signals: AbortSignal[]) => AbortSignal;
              }
            ).any;
      const signal =
        own !== undefined && deadlineSignal !== undefined && typeof anyOf === "function"
          ? anyOf([own, deadlineSignal])
          : (own ?? deadlineSignal);
      return fetchImpl(input, { ...init, signal });
    })) as typeof fetch;
}

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

  const timeoutMs = deps.timeoutMs ?? DOMAIN_REQUEST_TIMEOUT_MS;
  let response: Response;
  let payload: unknown = undefined;
  try {
    // ONE deadline over the whole exchange: a server that sends headers and
    // then trickles the body is as stuck, to the person holding the phone, as
    // one that never answers.
    ({ response, payload } = await withDeadline(timeoutMs, async (signal) => {
      const res = await deps.fetch(deps.apiBaseUrl + request.path, {
        method: request.method ?? "GET",
        headers,
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        signal,
      });
      let body: unknown = undefined;
      try {
        body = await res.json();
      } catch (error) {
        // A deadline that fired while the body was arriving is NOT an
        // unreadable answer — it is no answer. Everything else is.
        if (signal?.aborted === true) throw error;
        body = undefined;
      }
      return { response: res, payload: body };
    }));
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "unreachable",
        detail:
          error instanceof DeadlineExceeded
            ? error.message
            : error instanceof Error
              ? error.message
              : "network request failed",
      },
    };
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
    // Includes a 202-with-empty-body: per streamable-HTTP MCP that
    // acknowledges a NOTIFICATION, and a call that expected an answer did not
    // get one — a defined failure, never a silent success.
    return { ok: false, failure: { kind: "unreadable", status: response.status } };
  }
  return { ok: true, data: payload as T };
}

// ── the capability protocol ────────────────────────────────────────────────

/** Where the capability registry is served. POST-only JSON-RPC 2.0. */
export const CAPABILITY_PATH = "/api/mcp";

export type CapabilityRequest = {
  /**
   * The canonical capability id (`profile.get`, `journal.list`, …). MCP tool
   * names replace the dots with underscores; that translation happens here so
   * no screen ever spells a wire name.
   */
  readonly name: string;
  readonly args?: Record<string, unknown>;
  readonly accessToken: string | null;
  readonly locale?: string;
};

/** JSON-RPC ids only disambiguate within one HTTP exchange here (the server
 *  is stateless single-response), but distinct ids make logs readable. */
let nextRpcId = 1;

type JsonRpcEnvelope = {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Call ONE canonical capability through `/api/mcp`.
 *
 * Frames a JSON-RPC 2.0 `tools/call`, then unwraps the MCP result envelope:
 *
 *   - `result.structuredContent` (falling back to the first text content
 *     block) carries the capability's `ExecResult` — `{ ok, data | code+message }`.
 *   - `{ isError: true }` INSIDE a 200 is a capability refusal and maps to a
 *     `capability_refused` failure. It is NEVER `ok: true`.
 *   - A JSON-RPC `error` object (unknown tool, invalid params) is also a
 *     refusal — the server judged the request, so the caller gets its words.
 *   - Identity refusals arrive as HTTP statuses and keep `callDomain`'s
 *     mapping (401/403/429/503 → the refusal vocabulary above).
 */
export async function callCapability<T>(
  deps: DomainDependencies,
  request: CapabilityRequest,
): Promise<DomainResult<T>> {
  const outcome = await callDomain<JsonRpcEnvelope>(deps, {
    path: CAPABILITY_PATH,
    method: "POST",
    body: {
      jsonrpc: "2.0",
      id: nextRpcId++,
      method: "tools/call",
      params: {
        name: request.name.replace(/\./g, "_"),
        arguments: request.args ?? {},
      },
    },
    accessToken: request.accessToken,
    locale: request.locale,
  });
  if (!outcome.ok) return outcome;

  const envelope = asRecord(outcome.data);
  if (envelope === null) {
    return { ok: false, failure: { kind: "unreadable", status: 200 } };
  }

  const rpcError = asRecord(envelope.error);
  if (rpcError !== null) {
    return {
      ok: false,
      failure: {
        kind: "capability_refused",
        code: "rpc_error",
        message:
          typeof rpcError.message === "string"
            ? rpcError.message
            : "The server rejected the request.",
      },
    };
  }

  const result = asRecord(envelope.result);
  if (result === null) {
    return { ok: false, failure: { kind: "unreadable", status: 200 } };
  }

  let payload = asRecord(result.structuredContent);
  if (payload === null && Array.isArray(result.content)) {
    // Older/other servers may omit structuredContent; the payload is then the
    // JSON text of the first content block.
    const first = asRecord(result.content[0]);
    if (first !== null && typeof first.text === "string") {
      try {
        payload = asRecord(JSON.parse(first.text));
      } catch {
        payload = null;
      }
    }
  }
  if (payload === null) {
    return { ok: false, failure: { kind: "unreadable", status: 200 } };
  }

  // A tool-level failure is a RESULT with isError — and an `ok: false`
  // payload is a refusal even if a server forgot the flag. Neither may ever
  // surface as success.
  if (result.isError === true || payload.ok === false) {
    return {
      ok: false,
      failure: {
        kind: "capability_refused",
        code: typeof payload.code === "string" ? payload.code : "unknown",
        message:
          typeof payload.message === "string"
            ? payload.message
            : "The server declined this request.",
      },
    };
  }
  if (payload.ok !== true) {
    return { ok: false, failure: { kind: "unreadable", status: 200 } };
  }
  return { ok: true, data: payload.data as T };
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
    case "capability_refused":
      return "domain.refused.capability";
    case "unreachable":
      return "domain.unavailable.offline";
    case "unreadable":
      return "domain.unavailable.unexpectedAnswer";
  }
}
