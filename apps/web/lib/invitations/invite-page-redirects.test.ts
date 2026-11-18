import { beforeEach, describe, expect, it, vi } from "vitest";

/** G-12b — a forged invite token can never add path segments / query params. */

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirectMock(u) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/profile-roles", () => ({
  readHeldProfileRoles: async () => ({ ok: false }),
}));
vi.mock("@/lib/invitations/actions", () => ({
  acceptInvitationAction: async () => ({ status: "ok", outcome: "expired" }),
  declineInvitationAction: async () => ({ status: "not-authed" }),
}));

const { acceptInviteFormAction, declineInviteFormAction } = await import(
  "./invite-page-actions"
);

const EVIL = "x/../../evil?a=b#c\r\nSet-Cookie: z";

function form(token: string) {
  const fd = new FormData();
  fd.set("token", token);
  fd.set("locale", "lt");
  return fd;
}
async function target(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    return String((e as Error).message).replace("REDIRECT:", "");
  }
  return "";
}

beforeEach(() => {
  redirectMock.mockClear();
});

describe("invite redirects encode the token", () => {
  it("result redirect keeps the token inside ONE path segment", async () => {
    const url = await target(() => acceptInviteFormAction(form(EVIL)));
    expect(url).toBe(`/lt/invite/${encodeURIComponent(EVIL)}?notice=expired`);
    expect(url).not.toMatch(/[\r\n]/);
    expect(url.split("?")).toHaveLength(2);
  });
  it("login redirect carries the invite path as one encoded next value", async () => {
    const url = await target(() => declineInviteFormAction(form(EVIL)));
    expect(url.startsWith("/lt/auth/login?next=")).toBe(true);
    expect(url).not.toMatch(/[\r\n#]/);
    expect(url.split("?")).toHaveLength(2);
  });
  it("a normal url-safe token is unchanged", async () => {
    const url = await target(() => acceptInviteFormAction(form("abc123_-")));
    expect(url).toBe("/lt/invite/abc123_-?notice=expired");
  });
});
