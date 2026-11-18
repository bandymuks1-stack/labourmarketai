import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Integration: the invitation action through the REAL guarded send and the
 * REAL transactional adapter (SMTP transport mocked). A join_team invitation
 * to a synthetic QA plus-address is created and its link handed back, but no
 * mail goes out, no send-ledger row is reserved and the invitation is not
 * marked delivered or failed — the production walks take the link from the
 * API. A real address on the same call is mailed exactly as before.
 */
vi.mock("server-only", () => ({}));
const { sendSmtp, rpc } = vi.hoisted(() => ({
  sendSmtp: vi.fn(async () => ({ status: "sent" as const })),
  rpc: vi.fn(async (name: string) =>
    name === "create_invitation_v1"
      ? { data: { outcome: "created", invitation_id: `inv-${rpc.mock.calls.length}` }, error: null }
      : { data: "ok", error: null },
  ),
}));
vi.mock("@/lib/email/smtp", () => ({
  sendSmtp,
  smtpConfigFromEnv: () => ({ host: "smtp.example.test", port: 465, user: "u", pass: "p", from: "f@example.test" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "sender" } } }) }, rpc }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "labourmarket.ai", "x-forwarded-proto": "https" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitDemandInterestNotification: vi.fn(),
  emitInvitationAcceptedNotification: vi.fn(),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));
vi.mock("@/lib/operations/auto-review", () => ({ recordStaffReviewNotice: vi.fn() }));

import { __setEmailSendStoreForTests } from "@/lib/email/send-ledger-store";
import { createAndSendInvitations } from "./actions";

describe("join_team invitation to a synthetic QA plus-address", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sendSmtp.mockClear();
    rpc.mockClear();
    __setEmailSendStoreForTests(null);
  });

  it("is created with its link, never mailed, never reserved, never marked", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "smtp");
    const reserve = vi.fn(async () => ({ allowed: true as const, organizationId: null }));
    __setEmailSendStoreForTests({ reserve });

    const r = await createAndSendInvitations({
      emails: "qa.worker+goal3@labourmarket.ai, person@example.test",
      invitationType: "join_team",
      locale: "lt",
      organizationId: "org-1",
    });

    expect(r.status).toBe("ok");
    const results = r.status === "ok" ? r.results : [];
    const synthetic = results.find((x) => x.email === "qa.worker+goal3@labourmarket.ai");
    const real = results.find((x) => x.email === "person@example.test");
    expect(synthetic?.outcome, "link only — not 'sent', not a failure").toBe("created");
    expect(synthetic?.inviteLink).toMatch(/^https:\/\/labourmarket\.ai\//);
    expect(real?.outcome).toBe("sent");

    expect(sendSmtp, "only the real address reached the mail server").toHaveBeenCalledTimes(1);
    expect((sendSmtp.mock.calls[0] as unknown as [unknown, { to: string }])[1].to).toBe("person@example.test");
    expect(reserve, "one ledger reservation — for the real address only").toHaveBeenCalledTimes(1);
    const marks = rpc.mock.calls.filter(([name]) => name === "mark_invitation_delivery_v1");
    expect(marks, "only the real address's delivery is recorded").toHaveLength(1);
  });
});
