import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const resend = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp, resend } }),
}));
vi.mock("@/lib/invitations/signup-bridge", () => ({
  readInvitationSignupContext: async () => ({ kind: "addressed", email: "invited@example.test" }),
}));
vi.mock("@/lib/invitations/actions", () => ({
  acceptInvitationAction: vi.fn(),
}));

import { resendAddressedInviteConfirmationAction, signUpAddressedInviteAction } from "./signup-accept-action";

const input = { token: "t", password: "long-enough-password", locale: "lt", emailRedirectTo: "https://x/cb" };

describe("addressed invitation signup", () => {
  beforeEach(() => signUp.mockReset());

  it("an address that already has an account is 'already registered', not 'check your e-mail'", async () => {
    // Confirm email ON: Supabase answers without an error, without a session,
    // with a user that has no identities, and sends no mail.
    signUp.mockResolvedValue({ data: { session: null, user: { id: "u", identities: [] } }, error: null });
    await expect(signUpAddressedInviteAction(input)).resolves.toMatchObject({
      status: "error",
      code: "user_already_exists",
    });
  });

  it("a new address with confirmation pending still says 'check your e-mail'", async () => {
    signUp.mockResolvedValue({
      data: { session: null, user: { id: "u", identities: [{ id: "i" }] } },
      error: null,
    });
    await expect(signUpAddressedInviteAction(input)).resolves.toEqual({ status: "check_email" });
  });
});

describe("addressed invitation — resend the confirmation", () => {
  it("resends to the INVITED address resolved on the server, never the masked one", async () => {
    resend.mockResolvedValue({ error: null });
    await expect(resendAddressedInviteConfirmationAction({ token: "t", emailRedirectTo: "https://x/cb" })).resolves.toEqual({
      status: "sent",
    });
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "invited@example.test",
      options: { emailRedirectTo: "https://x/cb" },
    });
  });
});
