import { describe, expect, it } from "vitest";

import {
  MAX_REFRESH_DELAY_MS,
  SESSION_STORE_KEY,
  bearerTokenFor,
  clearStoredSession,
  isExpired,
  millisecondsUntilRefresh,
  readStoredSession,
  writeStoredSession,
  type SessionStore,
  type StoredSession,
} from "./session";

const NOW = 1_800_000_000;

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: NOW + 3600,
    userId: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

function memoryStore(initial: Record<string, string> = {}): SessionStore {
  const data = new Map(Object.entries(initial));
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

const throwingStore: SessionStore = {
  async get() {
    throw new Error("keychain locked");
  },
  async set() {
    throw new Error("keychain locked");
  },
  async remove() {
    throw new Error("keychain locked");
  },
};

describe("a failed read is never reported as a fact about the user", () => {
  // The #1314 defect class: a roles read that ERRORED was rendered as "you do
  // not hold this role" to a real worker. The same mistake here signs someone
  // out of a working session because their phone's keychain was momentarily
  // locked.
  it("a store that throws yields unavailable, not signed_out", async () => {
    const state = await readStoredSession(throwingStore);
    expect(state.status).toBe("unavailable");
    expect(state.status === "unavailable" && state.reason).toBe(
      "store_unavailable",
    );
  });

  it("an unreadable stored value yields unavailable, not signed_out", async () => {
    const state = await readStoredSession(
      memoryStore({ [SESSION_STORE_KEY]: "{not json" }),
    );
    expect(state.status).toBe("unavailable");
    expect(state.status === "unavailable" && state.reason).toBe("corrupt");
  });

  it("a session missing a required field is corrupt, not a half-session", async () => {
    // A partially-valid session is the dangerous one: it would authenticate
    // requests with an empty token and read every refusal as the user's fault.
    for (const broken of [
      { ...session(), accessToken: "" },
      { ...session(), refreshToken: "" },
      { ...session(), expiresAt: "soon" },
      { ...session(), userId: undefined },
    ]) {
      const state = await readStoredSession(
        memoryStore({ [SESSION_STORE_KEY]: JSON.stringify(broken) }),
      );
      expect(state.status, JSON.stringify(broken)).toBe("unavailable");
    }
  });

  it("nothing stored IS a finding — that is signed_out", async () => {
    const state = await readStoredSession(memoryStore());
    expect(state.status).toBe("signed_out");
  });
});

describe("persistence round-trips", () => {
  it("what is written is what is read back", async () => {
    const store = memoryStore();
    await writeStoredSession(store, session());
    const state = await readStoredSession(store);
    expect(state).toEqual({ status: "signed_in", session: session() });
  });

  it("signing out proceeds even when the store fails, and says it failed", async () => {
    // A user who asked to sign out must not be trapped in the app by a
    // keychain error — but the client must not claim the credential is gone.
    expect(await clearStoredSession(throwingStore)).toEqual({ cleared: false });
    expect(await clearStoredSession(memoryStore())).toEqual({ cleared: true });
  });
});

describe("expiry is about the access token, not about the session", () => {
  it("an expired session stays signed_in — only the server can end it", async () => {
    // Discarding the refresh token locally would sign people out every time
    // their phone slept for an hour.
    const store = memoryStore();
    await writeStoredSession(store, session({ expiresAt: NOW - 10 }));
    const state = await readStoredSession(store);
    expect(state.status).toBe("signed_in");
  });

  it("but an expired token is never handed to a request", () => {
    const expired = { status: "signed_in", session: session({ expiresAt: NOW - 10 }) } as const;
    expect(bearerTokenFor(expired, NOW)).toBeNull();
  });

  it("the skew window refuses a token that expires within the minute", () => {
    expect(isExpired(session({ expiresAt: NOW + 59 }), NOW)).toBe(true);
    expect(isExpired(session({ expiresAt: NOW + 61 }), NOW)).toBe(false);
  });

  it("unknown and unavailable never produce a token", () => {
    // Falling back to an anonymous request would make RLS return nothing, and
    // an empty list would be rendered as "you have recorded no work".
    expect(bearerTokenFor({ status: "unknown" }, NOW)).toBeNull();
    expect(
      bearerTokenFor({ status: "unavailable", reason: "corrupt" }, NOW),
    ).toBeNull();
    expect(bearerTokenFor({ status: "signed_out" }, NOW)).toBeNull();
  });

  it("a live session does produce its token", () => {
    expect(
      bearerTokenFor({ status: "signed_in", session: session() }, NOW),
    ).toBe("access-token");
  });
});

describe("a session that is about to expire announces itself in time", () => {
  // The defect this closes: a client that renewed only at launch. After an
  // hour the token was dead, nothing observed it, and every read failed with
  // "please sign in again" until the app was killed and reopened.

  it("is due BEFORE the token is refused, not after", () => {
    // The renewal window and the token-refusal window are the same skew, so a
    // renewal is always due while the token still works. If these two ever
    // disagreed, there would be a gap in which requests fail and no renewal
    // has been scheduled — the silent expiry, reintroduced.
    // Inside the cap, so the answer is the real due time rather than a
    // re-check interval.
    const s = session({ expiresAt: NOW + 600 });
    const dueAt = NOW + millisecondsUntilRefresh(s, NOW) / 1000;
    expect(isExpired(s, dueAt)).toBe(true);
    expect(isExpired(s, dueAt - 1)).toBe(false);
  });

  it("an already-expired session is due now, never negative", () => {
    // A negative delay handed to a timer fires immediately on some runtimes
    // and never on others. Zero is the one answer both read the same way.
    expect(millisecondsUntilRefresh(session({ expiresAt: NOW - 10_000 }), NOW)).toBe(0);
    expect(millisecondsUntilRefresh(session({ expiresAt: NOW }), NOW)).toBe(0);
  });

  it("an absurd expiry is capped instead of overflowing a timer", () => {
    // A clock jump or a corrupt store can produce a delay larger than a 32-bit
    // timer holds, and an overflowed timer does not wait — it fires in a loop.
    const distant = session({ expiresAt: NOW + 60 * 60 * 24 * 365 * 100 });
    expect(millisecondsUntilRefresh(distant, NOW)).toBe(MAX_REFRESH_DELAY_MS);
    expect(MAX_REFRESH_DELAY_MS).toBeLessThan(2 ** 31 - 1);
  });

  it("a normal hour-long token is due once, well inside the cap", () => {
    expect(millisecondsUntilRefresh(session({ expiresAt: NOW + 600 }), NOW)).toBe(
      (600 - 60) * 1000,
    );
  });
});

describe("what is persisted", () => {
  it("stores no roles, no profile and no organization", async () => {
    // Caching authority locally would be a second permission model. Anything
    // about what a person MAY do is read from the backend under RLS.
    const store = memoryStore();
    await writeStoredSession(store, session());
    const raw = (await store.get(SESSION_STORE_KEY)) ?? "";
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      "accessToken",
      "expiresAt",
      "refreshToken",
      "userId",
    ]);
  });
});
