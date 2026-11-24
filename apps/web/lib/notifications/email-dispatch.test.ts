import { afterEach, describe, expect, it, vi } from "vitest";

import { maybeDispatchNotificationEmail } from "./email-dispatch";
import type { NotificationPreferenceRow } from "./notification-preferences";

/**
 * Notification email dispatcher — fully exercised WITHOUT vendor keys via
 * the transactional adapter's dev/test "log" provider. The load-bearing
 * claims:
 *   1. CONSENT-FIRST: no explicit email opt-in row → channel_disabled, and
 *      the profiles table is never even read;
 *   2. env-inert: opt-in but no provider → not_configured (this is the state
 *      production ships in until the owner adds credentials);
 *   3. with the log provider the whole path runs and reports `logged` —
 *      never `sent` (nothing left the machine);
 *   4. a recipient with no profiles.email is a tagged silent skip — we never
 *      email an address we do not hold;
 *   5. nothing throws, whatever the client does.
 */

const RECIPIENT = "11111111-1111-4111-8111-111111111111";

const OPT_IN: readonly NotificationPreferenceRow[] = [
  { notificationType: "absence_approved", channel: "email", enabled: true },
];

const INPUT = {
  recipientProfileId: RECIPIENT,
  eventType: "absence_approved",
  entityType: "worker_absence",
} as never;

function fakeAdmin(options: {
  email?: string | null;
  error?: boolean;
}) {
  const reads: string[] = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () =>
      Promise.resolve(
        options.error
          ? { data: null, error: { code: "XX000" } }
          : { data: { email: options.email ?? null }, error: null },
      ),
  };
  return {
    reads,
    client: {
      from: (table: string) => {
        reads.push(table);
        return chain;
      },
    } as never,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("maybeDispatchNotificationEmail", () => {
  it("no explicit opt-in row → channel_disabled, and no profile read happens", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const { client, reads } = fakeAdmin({ email: "person@example.com" });
    const outcome = await maybeDispatchNotificationEmail(client, INPUT, []);
    expect(outcome).toEqual({ kind: "channel_disabled" });
    expect(reads).toEqual([]);
  });

  it("an explicit opt-out row also disables (a stored row always wins)", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const { client } = fakeAdmin({ email: "person@example.com" });
    const outcome = await maybeDispatchNotificationEmail(client, INPUT, [
      { notificationType: "absence_approved", channel: "email", enabled: false },
    ]);
    expect(outcome).toEqual({ kind: "channel_disabled" });
  });

  it("opt-in with NO provider configured → not_configured (production's shipped state)", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "");
    const { client } = fakeAdmin({ email: "person@example.com" });
    const outcome = await maybeDispatchNotificationEmail(client, INPUT, OPT_IN);
    expect(outcome).toEqual({ kind: "not_configured" });
  });

  it("opt-in + log provider → the full path runs and reports logged, never sent", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { client, reads } = fakeAdmin({ email: "person@example.com" });
    const outcome = await maybeDispatchNotificationEmail(client, INPUT, OPT_IN);
    expect(outcome).toEqual({ kind: "logged" });
    expect(reads).toEqual(["profiles"]);
    // The rendered email reaches the server log — subject + link, and NEVER
    // the recipient address.
    expect(info).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(info.mock.calls[0]);
    expect(logged).not.toContain("person@example.com");
  });

  it("recipient with no profiles.email → tagged silent skip", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const { client } = fakeAdmin({ email: null });
    const outcome = await maybeDispatchNotificationEmail(client, INPUT, OPT_IN);
    expect(outcome).toEqual({ kind: "no_recipient_email" });
  });

  it("an unreadable profiles row is the same tagged skip, never a guessed address", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const { client } = fakeAdmin({ error: true });
    const outcome = await maybeDispatchNotificationEmail(client, INPUT, OPT_IN);
    expect(outcome).toEqual({ kind: "no_recipient_email" });
  });

  it("never throws — a throwing client collapses to send_failed", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const client = {
      from: () => {
        throw new Error("boom");
      },
    } as never;
    const outcome = await maybeDispatchNotificationEmail(client, INPUT, OPT_IN);
    expect(outcome).toEqual({ kind: "send_failed", reason: "thrown" });
  });
});
