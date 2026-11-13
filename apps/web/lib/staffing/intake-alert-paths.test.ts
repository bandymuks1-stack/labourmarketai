/**
 * T3 + T4 — both no-signup paths raise the SAME internal alert for a stored
 * request (owner P0 2026-11-13): the three landing request doors and the
 * /company-need form. One alert per stored row; nothing to the sender.
 *
 * Synthetic data only. Persistence, the AI draft and the mailbox are mocked; the
 * alert module itself (`intake-alert.ts`) is real, so the event it raises is
 * asserted at the delivery boundary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const persistPublicCompanyNeed = vi.fn();
const deliverPlatformEmail = vi.fn();
const sendCompanyNeedOwnerAlert = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "de" }));
vi.mock("./company-need-public-intake", () => ({
  persistPublicCompanyNeed: (...a: unknown[]) => persistPublicCompanyNeed(...a),
}));
vi.mock("./company-need-actions", () => ({
  draftVacancyFromNeed: async () => ({ ok: true, need: {}, draft: { status: "disabled", reason: "ai_disabled" } }),
}));
vi.mock("../security/ai-action-throttle", () => ({ aiActionRateLimited: async () => false }));
vi.mock("../notifications/telegram-owner-alerts", () => ({
  sendCompanyNeedOwnerAlert: (...a: unknown[]) => sendCompanyNeedOwnerAlert(...a),
}));
vi.mock("@/lib/email/platform-email-delivery-store", () => ({
  deliverPlatformEmail: (...a: unknown[]) => deliverPlatformEmail(...a),
}));

import { submitCompanyNeedAction } from "./company-need-form-actions";
import { notifyTeamOfStoredIntake } from "./intake-alert";
import { submitRequestDoorAction } from "./request-door-actions";

const INTAKE = "00000000-0000-4000-8000-0000000000d7";

function doorForm(door: string): FormData {
  const f = new FormData();
  f.set("door", door);
  f.set("name", "QA-SYNTHETIC Uzklausa");
  f.set("email", "qa.synthetic@example.test");
  f.set("country", "LT");
  f.set("profession", "QA-SYNTHETIC tinkuotojas");
  f.set("workers", "2");
  f.set("work", "QA-SYNTHETIC apdaila");
  f.set("need", "QA-SYNTHETIC projektas");
  f.set("started", String(Date.now() - 10_000));
  return f;
}

function needForm(): FormData {
  const f = new FormData();
  f.set("company_name", "QA-SYNTHETIC Statyba");
  f.set("contact_email", "qa.synthetic@example.test");
  f.set("country", "DE");
  f.set("profession", "tiler");
  f.set("number_of_workers", "2");
  f.set("description", "QA-SYNTHETIC need.");
  f.set("started", String(Date.now() - 10_000));
  return f;
}

beforeEach(() => {
  persistPublicCompanyNeed.mockReset().mockResolvedValue({ ok: true, advertising: false, intakeId: INTAKE });
  deliverPlatformEmail.mockReset().mockResolvedValue({ outcome: "sent", attempts: 1, reason: null });
  sendCompanyNeedOwnerAlert.mockReset();
});

const ALERT_EVENT = { kind: "intake_alert", subjectId: INTAKE };

describe("T3 — the landing request doors", () => {
  for (const door of ["worker-search", "b2b", "project"]) {
    it(`${door}: a stored request raises exactly one alert event for its row`, async () => {
      expect(await submitRequestDoorAction(doorForm(door))).toBe("received");
      expect(deliverPlatformEmail).toHaveBeenCalledTimes(1);
      expect(deliverPlatformEmail).toHaveBeenCalledWith(ALERT_EVENT);
    });
  }

  it("a request that was not stored raises none, and is not called received", async () => {
    persistPublicCompanyNeed.mockResolvedValue({ ok: false, code: "error" });
    expect(await submitRequestDoorAction(doorForm("b2b"))).toBe("unavailable");
    expect(deliverPlatformEmail).not.toHaveBeenCalled();
  });

  it("a failed alert never loses a stored request", async () => {
    deliverPlatformEmail.mockResolvedValue({ outcome: "retry_wait", attempts: 1, reason: "timeout" });
    expect(await submitRequestDoorAction(doorForm("project"))).toBe("received");
    deliverPlatformEmail.mockRejectedValue(new Error("boom"));
    expect(await submitRequestDoorAction(doorForm("project"))).toBe("received");
  });
});

describe("T4 — the /company-need form", () => {
  it("a stored need raises the same alert event the doors raise", async () => {
    const state = await submitCompanyNeedAction(null, needForm());
    expect(state).toMatchObject({ ok: true, persisted: true });
    expect(deliverPlatformEmail).toHaveBeenCalledTimes(1);
    expect(deliverPlatformEmail).toHaveBeenCalledWith(ALERT_EVENT);
  });

  it("works from any locale path, /de included", async () => {
    await submitCompanyNeedAction(null, needForm());
    expect(persistPublicCompanyNeed.mock.calls[0][0]).toMatchObject({ locale: "de", sourcePath: "/de/company-need" });
    expect(deliverPlatformEmail).toHaveBeenCalledWith(ALERT_EVENT);
  });

  it("a need that was not stored, or was refused as spam, raises none", async () => {
    for (const code of ["error", "rejected", "rate_limited", "unavailable"]) {
      persistPublicCompanyNeed.mockResolvedValue({ ok: false, code });
      await submitCompanyNeedAction(null, needForm());
    }
    expect(deliverPlatformEmail).not.toHaveBeenCalled();
  });

  it("the existing Agentai/Telegram alert still fires alongside it", async () => {
    await submitCompanyNeedAction(null, needForm());
    expect(sendCompanyNeedOwnerAlert).toHaveBeenCalledTimes(1);
  });
});

describe("the alert itself", () => {
  it("a stored row without an id raises nothing and says so", async () => {
    expect(await notifyTeamOfStoredIntake(null)).toBe("not_sent");
    expect(deliverPlatformEmail).not.toHaveBeenCalled();
  });

  it("a repeat of the same stored row is reported as a duplicate, not a second alert", async () => {
    deliverPlatformEmail.mockResolvedValue({ outcome: "duplicate" });
    expect(await notifyTeamOfStoredIntake(INTAKE)).toBe("duplicate");
  });

  it("does not hold the person longer than eight seconds", async () => {
    vi.useFakeTimers();
    try {
      deliverPlatformEmail.mockReturnValue(new Promise(() => {}));
      const waiting = notifyTeamOfStoredIntake(INTAKE);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await waiting).toBe("pending");
    } finally {
      vi.useRealTimers();
    }
  });
});
