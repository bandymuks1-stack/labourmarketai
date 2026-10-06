import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  EMAIL_SEND_GUARD_DEGRADED,
  emailSendLimitsFromEnv,
  hashRecipient,
  reserveDurableEmailSend,
  type EmailSendReservation,
  type EmailSendStore,
  type EmailSendStoreResult,
} from "./durable-send-guard";
import { createSupabaseEmailSendStore } from "./send-ledger-store";
import { __resetEmailSendGuardForTests } from "@/lib/notifications/email-send-guard";

const DAY = 24 * 3600_000;

/** In-memory model of the SQL ledger + RPC (same decision order as
 *  reserve_email_send_v1). The mutex mirrors the advisory lock: one
 *  check-and-record at a time. Two "instances" share ONE ledger instance. */
class FakeLedger implements EmailSendStore {
  rows: { org: string | null; hash: string; at: number; kind: string }[] = [];
  now = 1_700_000_000_000;
  orgOf = new Map<string, string>(); // profile -> org (membership resolution)
  failing = false;
  private chain: Promise<unknown> = Promise.resolve();

  reserve(r: EmailSendReservation): Promise<EmailSendStoreResult> {
    const run = async (): Promise<EmailSendStoreResult> => {
      if (this.failing) throw new Error("store down");
      await Promise.resolve(); // yield: concurrent callers interleave here
      const org = r.organizationId ?? (r.recipientProfileId ? this.orgOf.get(r.recipientProfileId) ?? null : null);
      const since = this.now - DAY;
      const live = this.rows.filter((x) => x.at > since);
      if (live.filter((x) => x.hash === r.recipientHash).length >= r.limits.maxPerRecipient) {
        return { allowed: false, reason: "recipient_cap" };
      }
      if (org) {
        if (live.filter((x) => x.org === org).length >= r.limits.maxPerOrg) {
          return { allowed: false, reason: "organization_cap" };
        }
      } else if (live.filter((x) => x.org === null).length >= r.limits.maxGlobalNoOrg) {
        return { allowed: false, reason: "global_cap" };
      }
      this.rows.push({ org, hash: r.recipientHash, at: this.now, kind: r.kind });
      return { allowed: true, organizationId: org };
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
}

let ledger: FakeLedger;
beforeEach(() => {
  ledger = new FakeLedger();
  __resetEmailSendGuardForTests();
  vi.restoreAllMocks();
});

const send = (store: EmailSendStore, email: string, org: string | null, env = {}) =>
  reserveDurableEmailSend(store, { recipientEmail: email, organizationId: org, kind: "notification" }, env);

describe("durable email send guard", () => {
  it("caps 5 per recipient per rolling 24h, then frees up", async () => {
    for (let i = 0; i < 5; i++) expect((await send(ledger, "a@x.io", "o1")).allowed).toBe(true);
    expect(await send(ledger, "a@x.io", "o1")).toEqual({ allowed: false, reason: "recipient_cap" });
    expect((await send(ledger, "b@x.io", "o1")).allowed).toBe(true);
    ledger.now += DAY + 1;
    expect((await send(ledger, "a@x.io", "o1")).allowed).toBe(true);
  });

  it("caps 500 per organization (env-tunable) and isolates organizations", async () => {
    const env = { NOTIFICATION_EMAIL_MAX_PER_ORG_DAY: "3" };
    for (let i = 0; i < 3; i++) expect((await send(ledger, `u${i}@x.io`, "o1", env)).allowed).toBe(true);
    expect(await send(ledger, "u9@x.io", "o1", env)).toEqual({ allowed: false, reason: "organization_cap" });
    expect((await send(ledger, "u9@x.io", "o2", env)).allowed).toBe(true);
    expect(emailSendLimitsFromEnv({}).maxPerOrg).toBe(500);
    expect(emailSendLimitsFromEnv({}).maxPerRecipient).toBe(5);
  });

  it("org window is rolling: capacity returns after 24h", async () => {
    const env = { NOTIFICATION_EMAIL_MAX_PER_ORG_DAY: "2" };
    await send(ledger, "a@x.io", "o1", env);
    ledger.now += DAY / 2;
    await send(ledger, "b@x.io", "o1", env);
    expect((await send(ledger, "c@x.io", "o1", env)).allowed).toBe(false);
    ledger.now += DAY / 2 + 10; // first row aged out, second still live
    expect((await send(ledger, "c@x.io", "o1", env)).allowed).toBe(true);
    expect((await send(ledger, "d@x.io", "o1", env)).allowed).toBe(false);
  });

  it("two guard 'instances' (restart / second container) share one store and one count", async () => {
    const env = { NOTIFICATION_EMAIL_MAX_PER_ORG_DAY: "4" };
    // instance A and instance B are just separate callers of the same store;
    // nothing is kept in process memory between calls (restart = new caller).
    await send(ledger, "a@x.io", "o1", env);
    await send(ledger, "b@x.io", "o1", env);
    await send(ledger, "c@x.io", "o1", env);
    await send(ledger, "d@x.io", "o1", env);
    expect((await send(ledger, "e@x.io", "o1", env)).allowed).toBe(false);
  });

  it("concurrent reservations cannot oversubscribe a cap (atomic reserve contract)", async () => {
    const env = { NOTIFICATION_EMAIL_MAX_PER_ORG_DAY: "7" };
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => send(ledger, `u${i}@x.io`, "o1", env)),
    );
    expect(results.filter((r) => r.allowed).length).toBe(7);
    expect(ledger.rows.length).toBe(7);
    const same = await Promise.all(Array.from({ length: 20 }, () => send(ledger, "same@x.io", "o9")));
    expect(same.filter((r) => r.allowed).length).toBe(5);
  });

  it("no organization: recipient cap + global ceiling apply", async () => {
    const env = { NOTIFICATION_EMAIL_MAX_GLOBAL_DAY: "2" };
    expect((await send(ledger, "a@x.io", null, env)).allowed).toBe(true);
    expect((await send(ledger, "b@x.io", null, env)).allowed).toBe(true);
    expect(await send(ledger, "c@x.io", null, env)).toEqual({ allowed: false, reason: "global_cap" });
  });

  it("resolves the organization from the recipient profile when not given", async () => {
    ledger.orgOf.set("p1", "o1");
    const r = await reserveDurableEmailSend(
      ledger,
      { recipientEmail: "a@x.io", recipientProfileId: "p1", kind: "notification" },
      { NOTIFICATION_EMAIL_MAX_PER_ORG_DAY: "1" },
    );
    expect(r.allowed).toBe(true);
    expect(ledger.rows[0].org).toBe("o1");
    expect((await send(ledger, "b@x.io", "o1", { NOTIFICATION_EMAIL_MAX_PER_ORG_DAY: "1" })).allowed).toBe(false);
  });

  it("never persists the raw address: only a 64-hex hash reaches the store", async () => {
    const email = "Secret.Person@Example.com";
    await send(ledger, email, "o1");
    const dump = JSON.stringify(ledger.rows);
    expect(dump).not.toMatch(/secret/i);
    expect(dump.toLowerCase().includes("example.com")).toBe(false);
    expect(ledger.rows[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecipient(email)).toBe(hashRecipient("secret.person@example.com"));
    expect(hashRecipient(email, { EMAIL_SEND_LEDGER_SALT: "s" })).not.toBe(hashRecipient(email));
  });

  it("unreadable store: fails OPEN with a loud warning (no address) behind the per-instance backstop", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    ledger.failing = true;
    const first = await send(ledger, "a@x.io", "o1");
    expect(first).toEqual({ allowed: true, degraded: true });
    expect(warn).toHaveBeenCalled();
    const [marker, meta] = warn.mock.calls[0];
    expect(marker).toBe(EMAIL_SEND_GUARD_DEGRADED);
    expect(JSON.stringify(meta)).not.toContain("a@x.io");
    // Backstop: the recipient cap still bites while degraded.
    for (let i = 0; i < 4; i++) await send(ledger, "a@x.io", "o1");
    expect(await send(ledger, "a@x.io", "o1")).toEqual({ allowed: false, reason: "degraded_backstop" });
  });
});

describe("supabase-backed store (RPC contract)", () => {
  const mk = (resp: { data: unknown; error: { code?: string } | null }) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const store = createSupabaseEmailSendStore(() => ({
      rpc: (fn, args) => {
        calls.push({ fn, args });
        return Promise.resolve(resp);
      },
    }));
    return { store, calls };
  };
  const res: EmailSendReservation = {
    organizationId: "o1",
    recipientProfileId: null,
    recipientHash: "a".repeat(64),
    kind: "invitation",
    limits: { maxPerOrg: 500, maxPerRecipient: 5, maxGlobalNoOrg: 2000 },
  };

  it("sends only the hash and limits to reserve_email_send_v1", async () => {
    const { store, calls } = mk({ data: { allowed: true, organization_id: "o1" }, error: null });
    expect(await store.reserve(res)).toEqual({ allowed: true, organizationId: "o1" });
    expect(calls[0].fn).toBe("reserve_email_send_v1");
    expect(Object.keys(calls[0].args).sort()).toEqual([
      "p_kind", "p_max_global", "p_max_per_org", "p_max_per_recipient",
      "p_organization_id", "p_recipient_hash", "p_recipient_profile_id",
    ]);
  });
  it("maps cap refusals and throws on error / malformed / absent RPC", async () => {
    expect(await mk({ data: { allowed: false, reason: "organization_cap" }, error: null }).store.reserve(res))
      .toEqual({ allowed: false, reason: "organization_cap" });
    await expect(mk({ data: null, error: { code: "PGRST202" } }).store.reserve(res)).rejects.toThrow();
    await expect(mk({ data: "x", error: null }).store.reserve(res)).rejects.toThrow();
    await expect(mk({ data: { allowed: false, reason: "invalid_limits" }, error: null }).store.reserve(res)).rejects.toThrow();
  });
});
