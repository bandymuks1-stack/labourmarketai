import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ROLE_SIGNAL_RETRY_DELAY_MS,
  RoleSignalUnavailableError,
  readActiveProfileRoles,
} from "./profile-roles";

/**
 * REGRESSION PIN — the intermittent `/dashboard/company` HTTP 500 seen on a
 * freshly started LOCAL production build (2026-10-09).
 *
 * The server log carried `PostgrestError: JWT issued at future` (PGRST303) —
 * PostgREST refusing a token whose `iat` is later than its own clock — within
 * a second of "Ready", then `RoleSignalUnavailableError` and a 500. The cause
 * is a CLOCK-SKEW class (a just-minted session against a PostgREST whose clock
 * is slightly behind), not a cold pool, a statement timeout or RLS recursion.
 *
 * What is pinned here is the BEHAVIOUR WE KEEP, so the class cannot silently
 * turn into the opposite bug:
 *   - one transient PGRST303 is retried and the real roles are returned;
 *   - two consecutive failures stay FAIL-CLOSED: the error carries the
 *     original PGRST303 cause and is NEVER read as "you hold no role"
 *     (the 2026-08-28 honesty defect).
 *
 * It does NOT claim the 500 is fixed: whether to retry PGRST303 for longer
 * than ROLE_SIGNAL_RETRY_DELAY_MS is an open decision, recorded in
 * docs/PREMIUM_COMPLETION_REGISTER.md.
 */
const jwtFuture = { name: "PostgrestError", message: "JWT issued at future", code: "PGRST303" };

describe("role signal under PGRST303 (JWT issued at future)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("recovers when the second attempt answers", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: jwtFuture })
      .mockResolvedValueOnce({ data: [{ role: "company" }], error: null });
    const p = readActiveProfileRoles(read);
    await vi.advanceTimersByTimeAsync(ROLE_SIGNAL_RETRY_DELAY_MS + 1);
    await expect(p).resolves.toEqual([{ role: "company" }]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stays fail-closed after two failures and keeps the PGRST303 cause", async () => {
    const read = vi.fn().mockResolvedValue({ data: null, error: jwtFuture });
    const p = readActiveProfileRoles(read);
    const settled = p.then(
      () => null,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(ROLE_SIGNAL_RETRY_DELAY_MS + 1);
    const err = await settled;
    expect(err).toBeInstanceOf(RoleSignalUnavailableError);
    expect((err as RoleSignalUnavailableError).signal).toBe("profile_roles");
    expect(((err as RoleSignalUnavailableError).cause as { code?: string }).code).toBe("PGRST303");
    expect(read).toHaveBeenCalledTimes(2);
  });
});
