import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppState } from "react-native";

import {
  bearerTokenFor,
  clearStoredSession,
  millisecondsUntilRefresh,
  readStoredSession,
  writeStoredSession,
  type AuthState,
  type StoredSession,
} from "@labourmarket/client-core";

import { sessionStore } from "./secure-session-store";
import { supabase } from "./supabase";

/**
 * THE AUTH BOUNDARY, wired.
 *
 * Every decision worth testing — what counts as signed out, what counts as
 * "we could not tell", when a token may be used — lives in
 * `@labourmarket/client-core/session` and is unit-tested there, off-device.
 * This file is the React wiring around it and deliberately holds no rules of
 * its own.
 *
 * Nothing here decides what the person may DO. Roles, organizations and
 * visibility are read from the backend under RLS, never cached as a local
 * claim about authority.
 */

export type AuthFailure =
  /** The credentials were wrong. A finding, and safe to show. */
  | { readonly kind: "rejected"; readonly message: string }
  /** The request never completed. Assert nothing about the credentials. */
  | { readonly kind: "unreachable"; readonly message: string }
  /** Sign-up succeeded but the account needs email confirmation first. */
  | { readonly kind: "confirmation_required" }
  /** This build cannot authenticate at all — no configuration. */
  | { readonly kind: "not_configured" };

export type AuthContextValue = {
  readonly state: AuthState;
  /** The token for a canonical-domain request, or null. Never a permission. */
  readonly accessToken: string | null;
  readonly busy: boolean;
  signIn(email: string, password: string): Promise<AuthFailure | null>;
  register(email: string, password: string): Promise<AuthFailure | null>;
  signOut(): Promise<void>;
  /** Re-read the keychain after an `unavailable` state. */
  retry(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** How long to wait before retrying a renewal that could not reach the auth
 *  server. Short enough that a person walking out of a tunnel is renewed
 *  before they notice, long enough not to hammer a dead network. */
const RENEWAL_RETRY_MS = 60_000;

/** Supabase's session shape → the four fields this client persists. */
function toStored(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string };
}): StoredSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    // `expires_at` comes from the auth server. When it is absent, treat the
    // token as already expired rather than inventing a lifetime: an expired
    // token is refreshed, an invented one is used and fails somewhere less
    // obvious.
    expiresAt: session.expires_at ?? 0,
    userId: session.user.id,
  };
}

function describeAuthError(error: { message: string; status?: number }): AuthFailure {
  // A network failure and a wrong password are different facts and must not be
  // shown as the same sentence — telling someone their password is wrong when
  // the phone had no signal sends them to reset a password that was fine.
  if (error.status === undefined || error.status === 0) {
    return { kind: "unreachable", message: error.message };
  }
  return { kind: "rejected", message: error.message };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "unknown" });
  const [busy, setBusy] = useState(false);

  /**
   * Boot: read the keychain, then let the auth server decide whether the
   * credential is still good. Only it can say — a client that judged locally
   * would either sign people out early or keep them signed in after a
   * revocation.
   */
  const load = useCallback(async () => {
    const stored = await readStoredSession(sessionStore);
    if (stored.status !== "signed_in" || supabase === null) {
      setState(stored);
      return;
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: stored.session.accessToken,
      refresh_token: stored.session.refreshToken,
    });
    if (error !== null || data.session === null) {
      // The refresh could fail because the token was revoked (signed out) or
      // because the network is down (not determined). Supabase reports the
      // latter without a status code.
      if (error !== null && (error.status === undefined || error.status === 0)) {
        setState({ status: "unavailable", reason: "store_unavailable" });
        return;
      }
      await clearStoredSession(sessionStore);
      setState({ status: "signed_out" });
      return;
    }
    const refreshed = toStored(data.session);
    await writeStoredSession(sessionStore, refreshed);
    setState({ status: "signed_in", session: refreshed });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Renew the access token with the refresh token already held.
   *
   * Deliberately NOT `load()`. `load()` is the BOOT read, and it may honestly
   * end at `unavailable` — which the shell reads as "we could not check" and
   * bounces to the entry gate. Doing that to somebody mid-screen because a
   * background renewal happened while they were in a tunnel would be the
   * signed-out-by-a-hiccup defect the entry gate exists to prevent, arriving
   * from the other direction.
   *
   * So the outcomes are kept apart, exactly as they are everywhere else here:
   *
   *   - the auth server judged the credential — a FINDING. The refresh token
   *     was revoked or rotated; the session is over.
   *   - anything else — NOT a finding. Change nothing. The screens render
   *     their own "no connection" and the next tick retries.
   *
   * The second bucket is wider than "no network", and the same widths
   * `transport.ts` already draws: a 429 is a brake, and a 5xx is the auth
   * server's own trouble. Neither is a statement about this person's
   * credential, and signing somebody out over either would be the #1314
   * defect wearing an HTTP status.
   */
  const refresh = useCallback(async (current: StoredSession) => {
    if (supabase === null) return;
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: current.refreshToken,
    });
    if (error !== null) {
      const status = error.status;
      const judged =
        status !== undefined && status >= 400 && status < 500 && status !== 429;
      if (!judged) return;
      await clearStoredSession(sessionStore);
      setState({ status: "signed_out" });
      return;
    }
    // An answer with no session and no error is not an answer. Keep what we
    // have rather than inventing a verdict from silence.
    if (data.session === null) return;
    const renewed = toStored(data.session);
    await writeStoredSession(sessionStore, renewed);
    setState({ status: "signed_in", session: renewed });
  }, []);

  /**
   * KEEPING THE SESSION ALIVE — the difference between an app that works all
   * day and one that works for an hour.
   *
   * `supabase-js` is configured with `autoRefreshToken: false` (it must be:
   * two session writers would drift), so nothing renews the credential unless
   * this does. Without it the token quietly expires mid-use, every capability
   * read starts refusing, and the only cure is killing the app — a session
   * ending in silence, which is the one thing an expiry must never do.
   *
   * Two triggers, because one is not enough:
   *   - a TIMER, for an app left open. `millisecondsUntilRefresh` fires a
   *     minute before the token would be refused, so nothing is ever refused.
   *   - FOREGROUNDING, because a sleeping phone does not run timers. An app
   *     reopened after lunch must not need the timer that never fired.
   */
  useEffect(() => {
    if (state.status !== "signed_in") return;
    const { session } = state;
    let cancelled = false;
    let renewing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      // A renewal already in flight must not be joined. Refresh tokens
      // rotate: a second exchange of the same one can legitimately be
      // REFUSED, and this code reads a refusal as "the session is over" —
      // so racing ourselves would sign people out for switching apps.
      if (cancelled || renewing) return;
      // Foregrounding can also call this while a timer is merely pending; one
      // schedule at a time, or the retries multiply every time the app is
      // switched away from and back.
      if (timer !== undefined) clearTimeout(timer);
      const delay = millisecondsUntilRefresh(session, nowSeconds());
      if (delay > 0) {
        timer = setTimeout(() => void tick(), delay);
        return;
      }
      renewing = true;
      try {
        await refresh(session);
      } finally {
        renewing = false;
      }
      // A successful renewal changes `state`, which re-runs this effect with
      // the new session and cancels this pass. Reaching here still uncancelled
      // means the renewal did not land — no network, a brake, the auth
      // server's own trouble — so try again rather than leaving the session to
      // rot until the next launch.
      if (cancelled) return;
      timer = setTimeout(() => void tick(), RENEWAL_RETRY_MS);
    };

    void tick();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void tick();
    });

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      subscription.remove();
    };
  }, [state, refresh]);

  const signIn = useCallback<AuthContextValue["signIn"]>(
    async (email, password) => {
      if (supabase === null) return { kind: "not_configured" };
      setBusy(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error !== null) return describeAuthError(error);
        if (data.session === null) return { kind: "confirmation_required" };
        const stored = toStored(data.session);
        await writeStoredSession(sessionStore, stored);
        setState({ status: "signed_in", session: stored });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (email, password) => {
      if (supabase === null) return { kind: "not_configured" };
      setBusy(true);
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error !== null) return describeAuthError(error);
        // With email confirmation enabled the project returns a user and NO
        // session. Reporting that as success would drop the person on a
        // sign-in screen with no explanation of why their new account does not
        // work yet.
        if (data.session === null) return { kind: "confirmation_required" };
        const stored = toStored(data.session);
        await writeStoredSession(sessionStore, stored);
        setState({ status: "signed_in", session: stored });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      // Local state first. A person who asked to sign out is signed out of
      // this device even if the server call fails — the reverse order can trap
      // them in the app.
      await clearStoredSession(sessionStore);
      setState({ status: "signed_out" });
      if (supabase !== null) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      accessToken: bearerTokenFor(state, nowSeconds()),
      busy,
      signIn,
      register,
      signOut,
      retry: load,
    }),
    [state, busy, signIn, register, signOut, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return value;
}
