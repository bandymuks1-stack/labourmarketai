import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/invitations/actions", () => ({
  createShareableInvitationAction: vi.fn(),
  resendInvitationAction: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  createShareableInvitationAction,
  resendInvitationAction,
} from "@/lib/invitations/actions";
import { AGENCY_CLIENT_PROPOSED_ROLE } from "@/lib/invitations/model";
import {
  inviteClientAction,
  refreshClientInviteLinkAction,
} from "@/lib/agency/bridge-actions";

/**
 * The agency's client invite is DELIVERED (2026-09-24): beside the
 * connection row, ONE invitation through the invitation primitive, and the
 * link comes back to the inviter. These pins keep the delivery on the one
 * primitive, idempotent per address, and honest about what was (not) sent.
 */
const AGENCY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONNECTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INVITATION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LINK = "https://labourmarket.ai/lt/invite/tok";

const asMock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  asMock(createClient).mockResolvedValue({ rpc });
  rpc.mockResolvedValue({ data: CONNECTION, error: null });
});

describe("inviteClientAction — the connection row PLUS the invitation that delivers it", () => {
  it("creates exactly one invite_company invitation, marked agency_client, to the same address", async () => {
    asMock(createShareableInvitationAction).mockResolvedValue({
      status: "ok",
      outcome: "created",
      invitationId: INVITATION,
      inviteLink: LINK,
    });
    const state = await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId: AGENCY, email: " Client@Example.com ", locale: "en" }),
    );
    expect(rpc).toHaveBeenCalledWith("create_agency_client_connection_v1", {
      p_agency_company_id: AGENCY,
      p_invited_email: "client@example.com",
    });
    expect(createShareableInvitationAction).toHaveBeenCalledTimes(1);
    expect(createShareableInvitationAction).toHaveBeenCalledWith({
      invitationType: "invite_company",
      locale: "en",
      recipientLocale: "en",
      email: "client@example.com",
      proposedRole: AGENCY_CLIENT_PROPOSED_ROLE,
      maxUses: 1,
      expiresInDays: 14,
    });
    // The link comes back to the inviter; `created` = ready, NOT e-mailed.
    expect(state).toEqual({
      status: "ok",
      invite: {
        email: "client@example.com",
        outcome: "created",
        invitationId: INVITATION,
        inviteLink: LINK,
        reason: null,
      },
    });
  });

  it("an unknown locale falls back to the default — never a forged link path", async () => {
    asMock(createShareableInvitationAction).mockResolvedValue({
      status: "ok",
      outcome: "created",
      invitationId: INVITATION,
      inviteLink: LINK,
    });
    await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId: AGENCY, email: "client@example.com", locale: "../evil" }),
    );
    expect(asMock(createShareableInvitationAction).mock.calls[0][0]).toMatchObject({
      locale: "lt",
      recipientLocale: "lt",
    });
  });

  it("IDEMPOTENT per address: a second invite reuses the connection and mints nothing new", async () => {
    asMock(createShareableInvitationAction).mockResolvedValue({
      status: "ok",
      outcome: "duplicate_pending",
    });
    const state = await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId: AGENCY, email: "client@example.com", locale: "lt" }),
    );
    expect(createShareableInvitationAction).toHaveBeenCalledTimes(1);
    expect(resendInvitationAction).not.toHaveBeenCalled();
    expect(state).toEqual({
      status: "ok",
      invite: {
        email: "client@example.com",
        outcome: "duplicate_pending",
        invitationId: null,
        inviteLink: null,
        reason: null,
      },
    });
  });

  it("the primitive being absent is UNAVAILABLE, and the connection outcome still stands", async () => {
    asMock(createShareableInvitationAction).mockResolvedValue({ status: "needs-migration" });
    const state = await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId: AGENCY, email: "client@example.com" }),
    );
    expect(state.status).toBe("ok");
    expect(state.status === "ok" && state.invite?.outcome).toBe("unavailable");
  });

  it("a throwing primitive never turns a recorded connection into an error", async () => {
    asMock(createShareableInvitationAction).mockRejectedValue(new Error("boom"));
    const state = await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId: AGENCY, email: "client@example.com" }),
    );
    expect(state).toMatchObject({ status: "ok", invite: { outcome: "unavailable" } });
  });

  it("NEGATIVE: when the connection RPC refuses, NO invitation is created", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not_agency" } });
    const state = await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId: AGENCY, email: "client@example.com" }),
    );
    expect(state).toEqual({ status: "forbidden" });
    expect(createShareableInvitationAction).not.toHaveBeenCalled();
  });

  it("NEGATIVE: invalid input reaches neither the RPC nor the primitive", async () => {
    const state = await inviteClientAction(
      { status: "idle" },
      fd({ agencyCompanyId: "not-a-uuid", email: "nope" }),
    );
    expect(state).toEqual({ status: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
    expect(createShareableInvitationAction).not.toHaveBeenCalled();
  });
});

describe("refreshClientInviteLinkAction — a fresh link through the primitive's own rotate path", () => {
  it("rotates the existing invitation and hands the new link back", async () => {
    asMock(resendInvitationAction).mockResolvedValue({
      status: "ok",
      outcome: "created",
      inviteLink: LINK,
    });
    const state = await refreshClientInviteLinkAction(
      { status: "idle" },
      fd({ invitationId: INVITATION, email: "client@example.com", locale: "de" }),
    );
    expect(resendInvitationAction).toHaveBeenCalledWith({
      invitationId: INVITATION,
      email: "client@example.com",
      locale: "de",
      recipientLocale: "de",
      invitationType: "invite_company",
    });
    expect(createShareableInvitationAction).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      status: "ok",
      invite: { outcome: "created", inviteLink: LINK, invitationId: null },
    });
  });

  it("the RPC's refusal (not the inviter, closed row) is reported, never a link", async () => {
    asMock(resendInvitationAction).mockResolvedValue({ status: "ok", outcome: "not_found" });
    const state = await refreshClientInviteLinkAction(
      { status: "idle" },
      fd({ invitationId: INVITATION, email: "client@example.com" }),
    );
    expect(state).toMatchObject({
      status: "ok",
      invite: { outcome: "refused", reason: "not_found", inviteLink: null },
    });
  });

  it("NEGATIVE: a malformed id or address never reaches the primitive", async () => {
    const state = await refreshClientInviteLinkAction(
      { status: "idle" },
      fd({ invitationId: "x", email: "client@example.com" }),
    );
    expect(state).toEqual({ status: "invalid" });
    expect(resendInvitationAction).not.toHaveBeenCalled();
  });
});
