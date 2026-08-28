import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A FAILED role read is not an answer (honesty defect, observed live
 * 2026-08-28).
 *
 * The first authenticated request to `/lt/dashboard/opportunities` after a
 * cold `next start` redirected the `dev.worker@local.test` fixture — whose
 * `profile_roles` row is `worker / is_active=true` — to
 * `/lt/dashboard?notice=needs_worker_role`. Every later request to the same
 * route rendered fine. The cause was `const { data: rolesRows } = await
 * supabase.from("profile_roles")...`: the PostgREST error was destructured
 * away, `data` was `null` on the transient failure, and the empty role set
 * was then read as the FACT "you do not hold this role".
 *
 * These tests pin the distinction the code must keep: "the read said you do
 * not hold this role" (a claim it may make) vs "the read did not answer" (a
 * claim it may not).
 */

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const redirectMock = vi.fn((url: string): never => {
  throw new RedirectSignal(url);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

let currentClient: SupabaseStub;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentClient,
}));

// `lib/auth/actions` is a "use server" module and is imported here for the
// `Role` type only; the stub keeps the runtime graph out of the test.
vi.mock("@/lib/auth/actions", () => ({}));

const { requireRoleOrRedirect } = await import("./require-role");
const { isSuperadmin, requireSuperadmin } = await import("./superadmin");
const { RoleSignalUnavailableError } = await import("./profile-roles");
const { readHeldRoles } = await import("./held-roles");

const USER = { id: "11111111-1111-4111-8111-111111111111" };
const READ_FAILED = {
  data: null,
  error: { code: "57P01", message: "server closed the connection unexpectedly" },
};

type Answer = { data: unknown; error: unknown };
type Chain = {
  select: () => Chain;
  eq: () => Chain;
  limit: () => Chain;
  maybeSingle: () => Promise<Answer>;
  then: <R>(onFulfilled: (a: Answer) => R) => Promise<R>;
};
type SupabaseStub = {
  auth: { getUser: () => Promise<{ data: { user: typeof USER | null } }> };
  from: (table: string) => Chain;
};

/**
 * Minimal PostgREST-shaped client. Each table gets a QUEUE of answers, so a
 * test can say "the first read fails, the retry succeeds"; the last answer
 * repeats once the queue runs out.
 */
function stub(
  queues: Record<string, Answer[]>,
  user: typeof USER | null = USER,
): SupabaseStub & { reads: (table: string) => number } {
  const counts: Record<string, number> = {};
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    reads: (table: string) => counts[table] ?? 0,
    from(table: string): Chain {
      const queue = queues[table] ?? [{ data: [], error: null }];
      const i = counts[table] ?? 0;
      counts[table] = i + 1;
      const answer = queue[Math.min(i, queue.length - 1)];
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => answer,
        then: (onFulfilled) => Promise.resolve(answer).then(onFulfilled),
      };
      return chain;
    },
  };
}

/** The URL a `redirect()` call sent the user to, or null if none was made. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    if (e instanceof RedirectSignal) return e.url;
    throw e;
  }
}

beforeEach(() => {
  redirectMock.mockClear();
});

describe("requireRoleOrRedirect: a failed read is not 'you lack the role'", () => {
  it("does NOT tell the user they need the role when the read never answers", async () => {
    const client = stub({ profile_roles: [READ_FAILED] });
    currentClient = client;

    await expect(
      requireRoleOrRedirect("lt", "worker"),
    ).rejects.toBeInstanceOf(RoleSignalUnavailableError);

    // THE regression: no `?notice=needs_worker_role` — no redirect at all.
    expect(redirectMock).not.toHaveBeenCalled();
    const urls = redirectMock.mock.calls.map(([u]) => u).join(" ");
    expect(urls).not.toContain("needs_worker_role");
    // It really did try twice before giving up.
    expect(client.reads("profile_roles")).toBe(2);
  });

  it("retries once: a transient first failure still lets the holder in", async () => {
    currentClient = stub({
      profile_roles: [READ_FAILED, { data: [{ role: "worker" }], error: null }],
    });

    await expect(requireRoleOrRedirect("lt", "worker")).resolves.toBe(USER.id);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("still says 'you need the role' when the read ANSWERED with no rows", async () => {
    currentClient = stub({ profile_roles: [{ data: [], error: null }] });

    expect(
      await redirectedTo(() => requireRoleOrRedirect("lt", "worker")),
    ).toBe("/lt/dashboard?notice=needs_worker_role");
  });

  it("admits a user who holds the role", async () => {
    currentClient = stub({
      profile_roles: [{ data: [{ role: "worker" }, { role: "company" }], error: null }],
    });

    await expect(requireRoleOrRedirect("lt", "company")).resolves.toBe(USER.id);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("unauthenticated users still go to login (unchanged)", async () => {
    currentClient = stub({}, null);

    expect(await redirectedTo(() => requireRoleOrRedirect("lt", "worker"))).toBe(
      "/lt/auth/login",
    );
  });
});

describe("superadmin: an unanswered read is not 'you are not an admin'", () => {
  it("requireSuperadmin surfaces the failure instead of bouncing the admin", async () => {
    currentClient = stub({ profiles: [READ_FAILED] });

    await expect(requireSuperadmin("lt")).rejects.toBeInstanceOf(
      RoleSignalUnavailableError,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("requireSuperadmin still redirects a genuine non-admin", async () => {
    currentClient = stub({
      profiles: [{ data: { active_role: "worker" }, error: null }],
      profile_roles: [{ data: null, error: null }],
    });

    expect(await redirectedTo(() => requireSuperadmin("lt"))).toBe(
      "/lt/dashboard",
    );
  });

  it("isSuperadmin fails CLOSED on an unanswered read (never grants)", async () => {
    currentClient = stub({
      profiles: [{ data: { active_role: "admin" }, error: null }],
      profile_roles: [READ_FAILED],
    });

    await expect(isSuperadmin()).resolves.toBe(false);
  });

  it("isSuperadmin grants on either signal when the reads answer", async () => {
    currentClient = stub({
      profiles: [{ data: { active_role: "worker" }, error: null }],
      profile_roles: [{ data: { role: "admin" }, error: null }],
    });

    await expect(isSuperadmin()).resolves.toBe(true);
  });
});

describe("the authenticated shell reads roles the same honest way", () => {
  const layout = readFileSync(
    join(__dirname, "..", "..", "app", "[locale]", "dashboard", "layout.tsx"),
    "utf8",
  );

  it("routes its profile_roles read through the shared reader", () => {
    expect(layout).toMatch(/readActiveProfileRoles\(/);
  });

  it("never destructures the roles read down to `data` alone", () => {
    // The old shape — `{ data: ... }` handed on as the whole answer — is what
    // let a failed read reach the shell as "this user holds no roles".
    expect(layout).not.toMatch(/rolesRes\.data/);
    expect(layout).not.toMatch(/\{\s*data:\s*null\s*\}/);
  });
});

describe("readHeldRoles: 'no roles' and 'no answer' are different values", () => {
  it("an unanswered read is `known: false` with an EMPTY set (grants nothing)", async () => {
    const client = stub({ profile_roles: [READ_FAILED] });

    const held = await readHeldRoles(
      client as unknown as Parameters<typeof readHeldRoles>[0],
      USER.id,
    );

    expect(held.known).toBe(false);
    expect(held.roles.size).toBe(0);
    expect(client.reads("profile_roles")).toBe(2);
  });

  it("an answered-empty read is `known: true` — a real 'holds nothing'", async () => {
    const client = stub({ profile_roles: [{ data: [], error: null }] });

    const held = await readHeldRoles(
      client as unknown as Parameters<typeof readHeldRoles>[0],
      USER.id,
    );

    expect(held.known).toBe(true);
    expect(held.roles.size).toBe(0);
  });

  it("answered rows come back as held roles", async () => {
    const client = stub({
      profile_roles: [{ data: [{ role: "worker" }], error: null }],
    });

    const held = await readHeldRoles(
      client as unknown as Parameters<typeof readHeldRoles>[0],
      USER.id,
    );

    expect(held.known).toBe(true);
    expect([...held.roles]).toEqual(["worker"]);
  });
});

describe("no downstream reader turns an unreadable role table into a grant", () => {
  const src = (rel: string) =>
    readFileSync(join(__dirname, "..", "..", rel), "utf8");

  it("the conversation dispatcher no longer defaults to `worker` on a FAILED read", () => {
    const dispatch = src("lib/conversation/dispatch.ts");
    // The fail-open shape: a catch that hands back a worker role.
    expect(dispatch).not.toMatch(
      /catch[\s\S]{0,60}return new Set<Role>\(\["worker"\]\)/,
    );
    // The answered-empty default (a brand-new account can still act) stays.
    expect(dispatch).toMatch(/set\.size > 0 \? set : new Set<Role>\(\["worker"\]\)/);
    expect(dispatch).toMatch(/readActiveProfileRoles\(/);
  });

  it("the AI context takes knownness from the READER, not from set size", () => {
    const ctx = src("lib/ai-workspace/ai-context.ts");
    expect(ctx).toMatch(/permissionsKnown:\s*roles\.known/);
    expect(ctx).not.toMatch(/permissionsKnown:\s*roles\.size\s*>\s*0/);
  });

  it("the two pages that RENDER the user's roles read them honestly", () => {
    for (const rel of [
      "app/[locale]/dashboard/account/page.tsx",
      "app/[locale]/dashboard/profile/page.tsx",
    ]) {
      expect(src(rel), rel).toMatch(/readActiveProfileRoles\(/);
    }
  });
});
