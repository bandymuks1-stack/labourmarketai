import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getSessionIsAdmin` — the shell's dual admin signal, readable from a page
 * body. Pins the composition (session profile + active `profile_roles` →
 * `deriveIsAdmin`), the query shape (the caller's OWN active rows), the
 * no-session short-circuit, and the failure semantics: an unanswered roles
 * read throws instead of answering "not an admin".
 */

const state = vi.hoisted(() => ({
  session: {
    user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
    profile: { active_role: "company" } as { active_role: string | null } | null,
    profileRead: "ok" as const,
  },
  roles: [] as { role: string }[],
  rolesError: null as { code: string } | null,
  eqCalls: [] as [string, unknown][],
}));

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session-profile", () => ({
  getSessionProfile: vi.fn(async () => state.session),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));
vi.mock("@/lib/auth/profile-roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/profile-roles")>();
  // Keep the real semantics (retry once, then throw) but skip the real delay.
  return { ...actual, ROLE_SIGNAL_RETRY_DELAY_MS: 0 };
});

import { RoleSignalUnavailableError } from "@/lib/auth/profile-roles";
import { getSessionIsAdmin } from "./session-admin-signal";

function stubFrom(table: string) {
  expect(table).toBe("profile_roles");
  const chain = {
    select: (cols: string) => {
      expect(cols).toBe("role");
      return chain;
    },
    eq: (col: string, value: unknown) => {
      state.eqCalls.push([col, value]);
      return chain;
    },
    then: (resolve: (v: { data: { role: string }[] | null; error: unknown }) => unknown) =>
      Promise.resolve(
        state.rolesError ? { data: null, error: state.rolesError } : { data: state.roles, error: null },
      ).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fromMock.mockReset();
  fromMock.mockImplementation(stubFrom);
  state.session = {
    user: { id: "11111111-1111-4111-8111-111111111111" },
    profile: { active_role: "company" },
    profileRead: "ok",
  };
  state.roles = [];
  state.rolesError = null;
  state.eqCalls = [];
});

describe("getSessionIsAdmin — the dual signal, composed from the reads that exist", () => {
  it("reads the caller's OWN active profile_roles rows", async () => {
    state.roles = [{ role: "company" }];
    await getSessionIsAdmin();
    expect(fromMock).toHaveBeenCalledWith("profile_roles");
    expect(state.eqCalls).toEqual([
      ["profile_id", "11111111-1111-4111-8111-111111111111"],
      ["is_active", true],
    ]);
  });

  it("a manager who is also a platform admin BY ROLE ROW is an admin", async () => {
    state.session.profile = { active_role: "company" };
    state.roles = [{ role: "company" }, { role: "admin" }];
    await expect(getSessionIsAdmin()).resolves.toBe(true);
  });

  it("an admin BY active_role is an admin even with no admin role row", async () => {
    state.session.profile = { active_role: "admin" };
    state.roles = [{ role: "worker" }];
    await expect(getSessionIsAdmin()).resolves.toBe(true);
  });

  it("NEGATIVE: a company/worker with no admin signal is not an admin", async () => {
    state.session.profile = { active_role: "company" };
    state.roles = [{ role: "company" }, { role: "worker" }];
    await expect(getSessionIsAdmin()).resolves.toBe(false);
    // A failed PROFILE read (no active_role known) with no admin row: not an admin.
    state.session.profile = null;
    await expect(getSessionIsAdmin()).resolves.toBe(false);
  });

  it("no session → false without touching profile_roles", async () => {
    state.session.user = null;
    await expect(getSessionIsAdmin()).resolves.toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("an unanswered roles read THROWS — it never answers 'not an admin'", async () => {
    state.session.profile = { active_role: "company" };
    state.rolesError = { code: "57014" };
    await expect(getSessionIsAdmin()).rejects.toBeInstanceOf(RoleSignalUnavailableError);
    // Retried once (two attempts), exactly like the page gate.
    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});
