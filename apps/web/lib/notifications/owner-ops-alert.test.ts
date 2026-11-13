import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { env, send, configured, fetchMock } = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  send: vi.fn(async () => ({ status: "sent" })),
  configured: { value: true },
  fetchMock: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/email/send-ledger-store", () => ({ guardedSendTransactionalEmail: send }));
vi.mock("@/lib/email/transactional", () => ({ isTransactionalEmailConfigured: () => configured.value }));

import { buildOwnerAlertText, ownerAlertChannels, sendOwnerDeliveryAlert } from "@/lib/notifications/owner-ops-alert";
import type { DeliveryHealth } from "@/lib/invitations/delivery-retry";

const health: DeliveryHealth = {
  window_hours: 24,
  attempts: 12,
  sent: 8,
  failed_temporary: 2,
  failed_permanent: 1,
  failed_configuration: 0,
  failed_unknown_outcome: 1,
  failed_last_hour: 3,
  retry_due: 1,
  retry_scheduled: 1,
  dead_letter: 0,
  unknown_outcome_open: 2,
  bounced: 1,
  stuck_reservations: 0,
  reasons: { timeout: 2, smtp_rcpt_to_550: 1, "Bad <x@y.z>": 9 },
};

describe("owner delivery alert", () => {
  beforeEach(() => {
    for (const k of Object.keys(env)) delete env[k];
    delete process.env.LM_OWNER_ALERT_EMAIL;
    send.mockClear();
    fetchMock.mockClear();
    configured.value = true;
    vi.stubGlobal("fetch", fetchMock);
  });

  it("text: Lithuanian, codes and counters only — no ids, no addresses, malformed reason keys dropped", () => {
    const t = buildOwnerAlertText(["repeated_failures", "unknown_outcome_open"], health);
    expect(t).toContain("kartojasi siuntimo klaidos");
    expect(t).toContain("neaiškiu SMTP rezultatu");
    expect(t).toContain("timeout×2");
    expect(t).not.toMatch(/@/);
    expect(t).toContain("kampanijos neliečiamos");
  });

  it("nothing configured → nothing sent, honestly reported", async () => {
    const r = await sendOwnerDeliveryAlert(["bounced"], health);
    expect(r).toEqual({ delivered: [], configured: { telegram: false, email: false } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("both channels configured → both tried independently; one failing does not stop the other", async () => {
    Object.assign(env, {
      OWNER_TELEGRAM_ALERTS_ENABLED: "true",
      OWNER_TELEGRAM_BOT_TOKEN: "t0k",
      OWNER_TELEGRAM_CHAT_ID: "42",
    });
    process.env.LM_OWNER_ALERT_EMAIL = "owner@example.test";
    fetchMock.mockResolvedValueOnce({ ok: false });
    const r = await sendOwnerDeliveryAlert(["configuration_failure"], health);
    expect(r.delivered).toEqual(["email"]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@example.test", subject: expect.stringContaining("perspėjimas") }),
      { kind: "notification" },
    );
  });

  it("no alerts → no message", async () => {
    process.env.LM_OWNER_ALERT_EMAIL = "owner@example.test";
    expect((await sendOwnerDeliveryAlert([], health)).delivered).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("an e-mail channel needs a well-formed owner address AND a configured provider", () => {
    process.env.LM_OWNER_ALERT_EMAIL = "not-an-address";
    expect(ownerAlertChannels().email).toBe(false);
    process.env.LM_OWNER_ALERT_EMAIL = "owner@example.test";
    configured.value = false;
    expect(ownerAlertChannels().email).toBe(false);
  });
});
