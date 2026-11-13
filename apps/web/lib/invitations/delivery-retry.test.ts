import { describe, expect, it } from "vitest";

import { classifyDeliveryFailure, MAX_DELIVERY_ATTEMPTS } from "@/lib/email/delivery-failure";
import type { TransactionalSendResult } from "@/lib/email/transactional";
import {
  deliveryAlerts,
  retryDueDeliveries,
  type DeliveryHealth,
  type RetryCandidate,
  type RetryDeps,
} from "@/lib/invitations/delivery-retry";

/**
 * A fake database that behaves like reissue_external_referral_v1 +
 * mark_external_referral_delivery_v1: an address lock (one reservation per
 * address), a 3-reissue limit, and a reservation cleared only by mark.
 */
function fakeDb(rows: Array<{ id: string; email: string; resendCount?: number; status?: string }>) {
  const state = new Map(
    rows.map((r) => [r.id, { ...r, resendCount: r.resendCount ?? 0, status: r.status ?? "delivery_failed", reserved: false }]),
  );
  const mails: string[] = [];
  const records: Array<{ id: string; result: TransactionalSendResult; attempts: number }> = [];
  const deadLetters: Array<{ id: string; reason: string }> = [];
  const reissue = async (id: string) => {
    const row = state.get(id)!;
    const addr = row.email.toLowerCase();
    if (row.status === "sent") return "already_sent";
    for (const o of state.values()) {
      if (o.email.toLowerCase() !== addr) continue;
      if (o.status === "sent") return "address_already_sent";
      if (o.reserved) return "address_reserved";
    }
    if (row.resendCount >= 3) return "resend_limit";
    row.resendCount += 1;
    row.reserved = true;
    return "ok";
  };
  const mark = async (id: string, outcome: "sent" | "delivery_failed") => {
    const row = state.get(id)!;
    row.status = outcome;
    row.reserved = false;
  };
  return { state, mails, records, deadLetters, reissue, mark };
}

function deps(db: ReturnType<typeof fakeDb>, results: TransactionalSendResult[]): RetryDeps {
  let n = 0;
  return {
    emailConfigured: () => true,
    mintToken: () => ({ token: `t${++n}`, hash: `h${n}` }),
    reissue: (id) => db.reissue(id),
    buildLink: (_l, token) => `https://labourmarket.ai/en/invite/${token}`,
    send: async (to) => {
      const r = results.shift() ?? { status: "sent" };
      db.mails.push(to);
      return r;
    },
    mark: (id, o) => db.mark(id, o),
    record: async (id, result, attempts) => {
      db.records.push({ id, result, attempts });
      return result.status === "failed" ? classifyDeliveryFailure(result.reason).failureClass : null;
    },
    deadLetter: async (id, reason) => {
      db.deadLetters.push({ id, reason });
    },
    resolveLocale: (l) => l ?? "en",
  };
}

const cand = (id: string, email: string, attempts = 1): RetryCandidate => ({ id, invitedEmail: email, locale: "en", attempts });

describe("retryDueDeliveries — temporary failures are retried", () => {
  it("a due TEMPORARY failure is mailed again and recorded as the next attempt", async () => {
    const db = fakeDb([{ id: "a", email: "worker-a@example.test" }]);
    const report = await retryDueDeliveries([cand("a", "worker-a@example.test")], deps(db, [{ status: "sent" }]));
    expect(report).toMatchObject({ outcome: "done", attempted: 1, sent: 1, deadLettered: 0, stoppedBy: null });
    expect(db.mails).toEqual(["worker-a@example.test"]);
    expect(db.records).toEqual([{ id: "a", result: { status: "sent" }, attempts: 2 }]);
    expect(db.state.get("a")).toMatchObject({ status: "sent", reserved: false });
  });

  it("a retry that fails again is recorded with its reason (the next backoff is the recorder's job)", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test" }]);
    const report = await retryDueDeliveries([cand("a", "a@example.test")], deps(db, [{ status: "failed", reason: "timeout" }]));
    expect(report.failed).toEqual({ TEMPORARY: 1, PERMANENT: 0, CONFIGURATION: 0 });
    expect(db.records[0]).toMatchObject({ attempts: 2, result: { status: "failed", reason: "timeout" } });
    expect(db.state.get("a")).toMatchObject({ status: "delivery_failed", reserved: false });
  });
});

describe("retryDueDeliveries — permanent and configuration failures stop", () => {
  it("a PERMANENT failure is counted and not retried within the run", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test" }]);
    const report = await retryDueDeliveries(
      [cand("a", "a@example.test")],
      deps(db, [{ status: "failed", reason: "smtp_rcpt_to_550" }]),
    );
    expect(report.failed.PERMANENT).toBe(1);
    expect(db.mails).toHaveLength(1);
  });

  it("a CONFIGURATION failure ends the run at once (no attempts burned on a fault no retry fixes)", async () => {
    const db = fakeDb([
      { id: "a", email: "a@example.test" },
      { id: "b", email: "b@example.test" },
    ]);
    const report = await retryDueDeliveries(
      [cand("a", "a@example.test"), cand("b", "b@example.test")],
      deps(db, [{ status: "failed", reason: "smtp_auth_535" }]),
    );
    expect(report.stoppedBy).toBe("configuration_failure");
    expect(db.mails).toEqual(["a@example.test"]);
  });

  it("two consecutive TEMPORARY failures end the run (provider outage circuit breaker)", async () => {
    const db = fakeDb([
      { id: "a", email: "a@example.test" },
      { id: "b", email: "b@example.test" },
      { id: "c", email: "c@example.test" },
    ]);
    const report = await retryDueDeliveries(
      [cand("a", "a@example.test"), cand("b", "b@example.test"), cand("c", "c@example.test")],
      deps(db, [
        { status: "failed", reason: "timeout" },
        { status: "failed", reason: "connection_closed" },
      ]),
    );
    expect(report.stoppedBy).toBe("consecutive_temporary_failures");
    expect(db.mails).toEqual(["a@example.test", "b@example.test"]);
  });
});

describe("retryDueDeliveries — repeated failures end in the dead letter", () => {
  it("the database's resend_limit dead-letters the row; nothing is mailed", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test", resendCount: 3 }]);
    const report = await retryDueDeliveries([cand("a", "a@example.test", 3)], deps(db, []));
    expect(report).toMatchObject({ attempted: 0, deadLettered: 1, refused: { resend_limit: 1 } });
    expect(db.deadLetters).toEqual([{ id: "a", reason: "resend_limit" }]);
    expect(db.mails).toEqual([]);
  });

  it("a row whose attempts are spent is dead-lettered without a reissue", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test" }]);
    const report = await retryDueDeliveries([cand("a", "a@example.test", MAX_DELIVERY_ATTEMPTS)], deps(db, []));
    expect(report.deadLettered).toBe(1);
    expect(db.state.get("a")!.resendCount).toBe(0);
    expect(db.mails).toEqual([]);
  });

  it("four failing runs in a row: 1 intake + 3 retries, then the dead letter — never a fifth mail", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test" }]);
    let attempts = 1; // the intake send failed
    for (let run = 0; run < 6; run += 1) {
      await retryDueDeliveries([cand("a", "a@example.test", attempts)], deps(db, [{ status: "failed", reason: "timeout" }]));
      attempts = Math.min(attempts + 1, MAX_DELIVERY_ATTEMPTS);
    }
    expect(db.mails).toHaveLength(MAX_DELIVERY_ATTEMPTS - 1);
    expect(db.deadLetters.length).toBeGreaterThan(0);
  });
});

describe("retryDueDeliveries — idempotency: a retry never duplicates a mail", () => {
  it("two runs at the same moment over the same row mail it once", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test" }]);
    // The second run's reissue arrives while the first still holds the reservation.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = deps(db, [{ status: "sent" }]);
    const slowSend = slow.send;
    const first = retryDueDeliveries([cand("a", "a@example.test")], {
      ...slow,
      send: async (...args) => {
        await gate;
        return slowSend(...args);
      },
    });
    await Promise.resolve();
    const second = await retryDueDeliveries([cand("a", "a@example.test")], deps(db, [{ status: "sent" }]));
    release();
    const a = await first;
    expect(second.refused).toEqual({ address_reserved: 1 });
    expect(a.sent + second.sent).toBe(1);
    expect(db.mails).toEqual(["a@example.test"]);
  });

  it("a row already sent is never mailed again by a stale candidate list", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test", status: "sent" }]);
    const report = await retryDueDeliveries([cand("a", "a@example.test")], deps(db, []));
    expect(report.refused).toEqual({ already_sent: 1 });
    expect(db.mails).toEqual([]);
  });

  it("two rows of one address in one run: only one is attempted", async () => {
    const db = fakeDb([
      { id: "a", email: "Same@example.test" },
      { id: "b", email: "same@example.test" },
    ]);
    await retryDueDeliveries([cand("a", "Same@example.test"), cand("b", "same@example.test")], deps(db, []));
    expect(db.mails).toHaveLength(1);
  });

  it("refuses before rotating any token when no provider is configured", async () => {
    const db = fakeDb([{ id: "a", email: "a@example.test" }]);
    const report = await retryDueDeliveries([cand("a", "a@example.test")], { ...deps(db, []), emailConfigured: () => false });
    expect(report.outcome).toBe("email_not_configured");
    expect(db.state.get("a")!.resendCount).toBe(0);
  });
});

describe("deliveryAlerts", () => {
  const base: DeliveryHealth = {
    attempts: 10,
    sent: 10,
    failed_temporary: 0,
    failed_permanent: 0,
    failed_configuration: 0,
    failed_last_hour: 0,
    retry_due: 0,
    retry_scheduled: 0,
    dead_letter: 0,
    failed_unclassified: 0,
    stuck_reservations: 0,
    reasons: {},
  };
  it("quiet when healthy", () => {
    expect(deliveryAlerts(base)).toEqual([]);
  });
  it("raises on repeated failures, configuration faults, dead letters, stuck reservations and low success", () => {
    expect(
      deliveryAlerts({
        ...base,
        sent: 6,
        failed_last_hour: 3,
        failed_configuration: 1,
        dead_letter: 1,
        stuck_reservations: 1,
        failed_unclassified: 1,
      }),
    ).toEqual([
      "repeated_failures",
      "configuration_failure",
      "dead_letter_present",
      "stuck_reservation",
      "unclassified_failures",
      "low_success_rate",
    ]);
  });
});
