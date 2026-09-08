/**
 * THE AUTH / SESSION BOUNDARY — one identity model, expressed for a client
 * that has no cookie jar.
 *
 * There is no second auth model here and there must never be one. The platform
 * issues exactly one kind of end-user credential: a Supabase access token from
 * its own auth server. The web client keeps it in cookies; a phone keeps it in
 * the OS keychain. That is a difference of STORAGE, not of identity, and every
 * type below is about storage and state — never about permission.
 *
 * **Nothing in this file decides what anyone may see or do.** RLS,
 * `can_view_worker`, `manages_organization` and the SECURITY DEFINER functions
 * decide that, in the database, for every client identically. A client that
 * computed authority from a token would be a second permission model, which is
 * the exact failure `docs/APP_READINESS_MAP.md` exists to prevent.
 *
 * ## The four states, and why "unavailable" is one of them
 *
 * The expensive lesson of #1314: a read that FAILED was reported as a fact
 * about the user ("you do not hold this role"). A real worker was told they
 * were not a worker because a query errored and the code wrote `data ?? []`.
 *
 * So `AuthState` keeps `signed_out` and `unavailable` apart. Signed out is a
 * finding. Unavailable is the absence of a finding — the keychain was locked,
 * the store threw, the network never answered. A client shows a sign-in screen
 * for the first and "we could not check, try again" for the second. Collapsing
 * them would silently sign people out of a working session, on a train, in a
 * tunnel, holding a phone.
 */

/** Where a client keeps the credential. Async because keychains are. */
export type SessionStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

/**
 * The stored credential.
 *
 * Deliberately the shape Supabase already returns, minus everything a client
 * has no business persisting. No profile, no roles, no organization: those are
 * READ from the backend under RLS every time they are needed, never cached as
 * a local claim about authority.
 */
export type StoredSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Unix seconds. From the auth server, never computed locally. */
  readonly expiresAt: number;
  readonly userId: string;
};

export type AuthState =
  /** Before the first read completes. Not a claim about anyone. */
  | { readonly status: "unknown" }
  /** Determined: there is no credential. Show sign-in. */
  | { readonly status: "signed_out" }
  /** Determined: there is a credential. It still proves nothing to the server. */
  | { readonly status: "signed_in"; readonly session: StoredSession }
  /**
   * NOT determined. The store failed, or what it held could not be read.
   * Never render this as "signed out".
   */
  | { readonly status: "unavailable"; readonly reason: SessionReadFailure };

export type SessionReadFailure =
  /** The store itself threw — keychain locked, permission denied, no hardware. */
  | "store_unavailable"
  /** Something was stored but is not a session this version understands. */
  | "corrupt";

export const SESSION_STORE_KEY = "labourmarket.session.v1";

/** Sixty seconds of slack, so a token is not used in the instant it expires. */
const EXPIRY_SKEW_SECONDS = 60;

export function isExpired(session: StoredSession, nowSeconds: number): boolean {
  return session.expiresAt - EXPIRY_SKEW_SECONDS <= nowSeconds;
}

/**
 * The longest a client may wait before looking at the token again.
 *
 * A cap, not a schedule. Its job is to stop an absurd `expiresAt` — a clock
 * that jumped, a store that came back with a number from another century —
 * from overflowing a 32-bit timer, which on most runtimes does not wait a
 * century but fires immediately, forever. Waking early is harmless; spinning
 * is not.
 */
export const MAX_REFRESH_DELAY_MS = 15 * 60 * 1000;

/**
 * How long until this session's access token must be renewed, in
 * milliseconds. Zero means it is due now.
 *
 * A client that only renews at launch works for an hour and then fails at
 * everything until the process is killed: the token expires, but nothing
 * observes that, so the state never changes and the same dead credential is
 * offered to every request. The person sees a screen full of refusals and no
 * way back — a session ending silently, which is the one thing an expiry must
 * never do.
 *
 * The same `EXPIRY_SKEW_SECONDS` that stops `bearerTokenFor` handing out a
 * token in its last minute is what makes this fire a minute early, so the
 * renewal happens BEFORE any request is refused rather than after.
 */
export function millisecondsUntilRefresh(
  session: StoredSession,
  nowSeconds: number,
): number {
  const remaining = session.expiresAt - EXPIRY_SKEW_SECONDS - nowSeconds;
  if (remaining <= 0) return 0;
  return Math.min(remaining * 1000, MAX_REFRESH_DELAY_MS);
}

function parseSession(raw: string): StoredSession | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const { accessToken, refreshToken, expiresAt, userId } = candidate;
  if (typeof accessToken !== "string" || accessToken === "") return null;
  if (typeof refreshToken !== "string" || refreshToken === "") return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  if (typeof userId !== "string" || userId === "") return null;
  return { accessToken, refreshToken, expiresAt, userId };
}

/**
 * Read the persisted session.
 *
 * An expired session is still `signed_in`: the refresh token may well be
 * good, and only the auth server can say. Deciding locally that a session is
 * over — and discarding a valid refresh token to do it — would sign a user out
 * every time their phone slept for an hour.
 */
export async function readStoredSession(
  store: SessionStore,
): Promise<AuthState> {
  let raw: string | null;
  try {
    raw = await store.get(SESSION_STORE_KEY);
  } catch {
    return { status: "unavailable", reason: "store_unavailable" };
  }
  if (raw === null) return { status: "signed_out" };
  const session = parseSession(raw);
  if (session === null) {
    return { status: "unavailable", reason: "corrupt" };
  }
  return { status: "signed_in", session };
}

export async function writeStoredSession(
  store: SessionStore,
  session: StoredSession,
): Promise<void> {
  await store.set(SESSION_STORE_KEY, JSON.stringify(session));
}

/**
 * Forget the credential.
 *
 * Signing out is one of the few operations that must succeed even when things
 * are broken, so a failing store is swallowed here rather than propagated: the
 * user asked to be signed out and the UI must proceed. The failure is returned
 * as a value so a caller can report it honestly without blocking the exit.
 */
export async function clearStoredSession(
  store: SessionStore,
): Promise<{ cleared: boolean }> {
  try {
    await store.remove(SESSION_STORE_KEY);
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}

/**
 * Can this state carry a request to the canonical domain?
 *
 * Only `signed_in` may, and only with a token that has not expired. `unknown`
 * and `unavailable` are NOT permission to try anonymously — an unauthenticated
 * request under RLS returns an empty result, which a screen would render as
 * "you have no work recorded". Absence of an answer must never be shown as an
 * answer of absence.
 */
export function bearerTokenFor(
  state: AuthState,
  nowSeconds: number,
): string | null {
  if (state.status !== "signed_in") return null;
  if (isExpired(state.session, nowSeconds)) return null;
  return state.session.accessToken;
}
