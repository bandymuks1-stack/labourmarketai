import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isTransactionalEmailConfigured,
  isTransactionalEmailPathActive,
  sendTransactionalEmail,
} from "./transactional";

/**
 * Transactional adapter — offline behaviour (completion v1). The claims:
 *   1. no provider → not_configured everywhere (the pre-existing contract);
 *   2. the dev/test "log" provider activates the PATH but never counts as
 *      CONFIGURED — the invitation UI's "email sent vs copy-link" fork keys
 *      off isTransactionalEmailConfigured() and must not offer a send that
 *      goes nowhere;
 *   3. the log provider returns `logged`, a status no caller may render as
 *      a delivered email;
 *   4. in production the log provider is ignored entirely (a provider that
 *      swallows mail while preferences say "email on" would be a silent
 *      delivery kill).
 */

const MESSAGE = {
  to: "person@example.com",
  subject: "Subject",
  text: "Body",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("transactional email adapter — offline states", () => {
  it("unset provider: not configured, path inactive, send is a tagged no-op", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "");
    vi.stubEnv("INVITE_EMAIL_API_KEY", "");
    vi.stubEnv("INVITE_EMAIL_FROM", "");
    expect(isTransactionalEmailConfigured()).toBe(false);
    expect(isTransactionalEmailPathActive()).toBe(false);
    expect(await sendTransactionalEmail(MESSAGE)).toEqual({
      status: "not_configured",
    });
  });

  it("log provider (test env): path active, NOT configured, send reports logged", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    expect(isTransactionalEmailConfigured()).toBe(false);
    expect(isTransactionalEmailPathActive()).toBe(true);
    expect(await sendTransactionalEmail(MESSAGE)).toEqual({ status: "logged" });
  });

  it("log provider is IGNORED in production — inert, never a silent mail sink", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    vi.stubEnv("NODE_ENV", "production");
    expect(isTransactionalEmailConfigured()).toBe(false);
    expect(isTransactionalEmailPathActive()).toBe(false);
    expect(await sendTransactionalEmail(MESSAGE)).toEqual({
      status: "not_configured",
    });
  });

  it("a real provider name without key/from is still not configured", () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "resend");
    vi.stubEnv("INVITE_EMAIL_API_KEY", "");
    vi.stubEnv("INVITE_EMAIL_FROM", "");
    expect(isTransactionalEmailConfigured()).toBe(false);
    expect(isTransactionalEmailPathActive()).toBe(false);
  });
});
