import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetEmailSendGuardForTests,
  reserveEmailSendSlot,
} from "./email-send-guard";

const t0 = 1_700_000_000_000;
beforeEach(() => __resetEmailSendGuardForTests());

describe("email send guard", () => {
  it("caps per recipient per rolling day, then frees up", () => {
    for (let i = 0; i < 5; i++) expect(reserveEmailSendSlot("p1", t0 + i, {})).toBe(true);
    expect(reserveEmailSendSlot("p1", t0 + 10, {})).toBe(false);
    expect(reserveEmailSendSlot("p2", t0 + 10, {})).toBe(true);
    expect(reserveEmailSendSlot("p1", t0 + 25 * 3600_000, {})).toBe(true);
  });
  it("caps the whole run window and honours env overrides", () => {
    const env = { NOTIFICATION_EMAIL_MAX_PER_RUN_WINDOW: "3" };
    expect(reserveEmailSendSlot("a", t0, env)).toBe(true);
    expect(reserveEmailSendSlot("b", t0, env)).toBe(true);
    expect(reserveEmailSendSlot("c", t0, env)).toBe(true);
    expect(reserveEmailSendSlot("d", t0, env)).toBe(false);
  });
  it("garbage env falls back to defaults", () => {
    const env = { NOTIFICATION_EMAIL_MAX_PER_RECIPIENT_DAY: "x" };
    for (let i = 0; i < 5; i++) expect(reserveEmailSendSlot("z", t0, env)).toBe(true);
    expect(reserveEmailSendSlot("z", t0, env)).toBe(false);
  });
});
