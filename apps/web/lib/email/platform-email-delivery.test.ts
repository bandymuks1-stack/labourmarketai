import { describe, expect, it } from "vitest";

import {
  DeliveryRecordUnavailable,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  STALE_SENDING_MS,
  deliverEvent,
  deliveryEventKey,
  reasonCode,
  retryDueDeliveries,
  type Compose,
  type DeliveryDeps,
  type DeliveryFinish,
  type DeliveryRow,
  type DeliveryStore,
  type OutboundEmail,
  type SendResult,
} from "./platform-email-delivery";

/** Synthetic ids only. */
const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const INTAKE = "00000000-0000-4000-8000-0000000000d1";

/** The record as the database keeps it: a unique event key and compare-and-set writes. */
function memoryStore() {
  const rows = new Map<string, DeliveryRow & { messageId: string | null; sentAt: string | null }>();
  let n = 0;
  const store: DeliveryStore = {
    async claimNew(e) {
      if ([...rows.values()].some((r) => r.eventKey === e.eventKey)) return null;
      const row = {
        id: `row-${++n}`,
        eventKey: e.eventKey,
        kind: e.kind,
        audience: e.audience,
        subjectId: e.subjectId,
        locale: e.locale,
        status: "sending" as const,
        attempts: 1,
        lastError: null,
        nextAttemptAt: null,
        createdAt: e.nowIso,
        updatedAt: e.nowIso,
        messageId: null,
        sentAt: null,
      };
      rows.set(row.id, row);
      return row;
    },
    async claimRetry(id, attempts, nowIso) {
      const r = rows.get(id);
      if (!r || r.status !== "retry_wait" || r.attempts !== attempts) return null;
      const next = { ...r, status: "sending" as const, attempts: attempts + 1, updatedAt: nowIso, nextAttemptAt: null };
      rows.set(id, next);
      return next;
    },
    async finish(id, attempts, f: DeliveryFinish, nowIso) {
      const r = rows.get(id);
      if (!r || r.status !== "sending" || r.attempts !== attempts) return;
      rows.set(id, { ...r, status: f.status, lastError: f.lastError, messageId: f.messageId, nextAttemptAt: f.nextAttemptAt, sentAt: f.sentAt, updatedAt: nowIso });
    },
    async listDue(nowIso) {
      return [...rows.values()].filter((r) => r.status === "retry_wait" && r.nextAttemptAt !== null && r.nextAttemptAt <= nowIso);
    },
    async listStaleSending(beforeIso) {
      return [...rows.values()].filter((r) => r.status === "sending" && r.updatedAt < beforeIso);
    },
  };
  return { store, rows };
}

function harness(results: SendResult[] | ((n: number) => SendResult), compose?: Compose) {
  const { store, rows } = memoryStore();
  const sent: OutboundEmail[] = [];
  const clock = { ms: Date.parse("2026-11-13T20:00:00Z") };
  const logs: string[] = [];
  const deps: DeliveryDeps = {
    store,
    now: () => clock.ms,
    log: (m) => logs.push(m),
    compose:
      compose ??
      (async (row) => ({
        kind: "send",
        email: { to: row.audience === "internal" ? "owner@example.test" : "company@example.test", subject: "s", text: "t", html: "<p>t</p>" },
      })),
    send: async (email) => {
      sent.push(email);
      const i = sent.length - 1;
      return typeof results === "function" ? results(i) : (results[i] ?? results[results.length - 1]);
    },
  };
  return { deps, rows, sent, clock, logs, only: () => [...rows.values()][0] };
}

const OK: SendResult = { status: "sent", messageId: "<id@example.test>" };
const DOWN: SendResult = { status: "failed", reason: "smtp_rcpt_to_451", retryable: true };

describe("T1 — a company registration is notified once and recorded", () => {
  it("one send, one record, status sent", async () => {
    const h = harness([OK]);
    const out = await deliverEvent(h.deps, { kind: "company_registration_notice", subjectId: COMPANY });
    expect(out).toEqual({ outcome: "sent", attempts: 1, reason: null });
    expect(h.sent).toHaveLength(1);
    expect(h.rows.size).toBe(1);
    expect(h.only()).toMatchObject({
      eventKey: `company_registration_notice:${COMPANY}`,
      kind: "company_registration_notice",
      audience: "internal",
      status: "sent",
      attempts: 1,
      lastError: null,
      messageId: "<id@example.test>",
    });
  });

  it("the notice and the welcome are two separate events for one company", async () => {
    const h = harness([OK]);
    await deliverEvent(h.deps, { kind: "company_registration_notice", subjectId: COMPANY });
    await deliverEvent(h.deps, { kind: "company_welcome", subjectId: COMPANY, locale: "pl" });
    expect(h.sent.map((e) => e.to)).toEqual(["owner@example.test", "company@example.test"]);
    expect([...h.rows.values()].map((r) => [r.kind, r.audience, r.locale, r.status])).toEqual([
      ["company_registration_notice", "internal", null, "sent"],
      ["company_welcome", "company", "pl", "sent"],
    ]);
  });
});

describe("T6 — one event never sends twice", () => {
  it("a second call for the same event sends nothing", async () => {
    const h = harness([OK]);
    await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE });
    expect(await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE })).toEqual({ outcome: "duplicate" });
    expect(await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE.toUpperCase() })).toEqual({ outcome: "duplicate" });
    expect(h.sent).toHaveLength(1);
    expect(h.rows.size).toBe(1);
  });

  it("two instances racing for the same event: exactly one sends", async () => {
    const h = harness([OK]);
    const both = await Promise.all([
      deliverEvent(h.deps, { kind: "company_welcome", subjectId: COMPANY }),
      deliverEvent(h.deps, { kind: "company_welcome", subjectId: COMPANY }),
    ]);
    expect(both.map((o) => o.outcome).sort()).toEqual(["duplicate", "sent"]);
    expect(h.sent).toHaveLength(1);
  });

  it("a failed event is not re-sent by a new call either — only the sweep retries it", async () => {
    const h = harness([DOWN, OK]);
    await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE });
    expect(await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE })).toEqual({ outcome: "duplicate" });
    expect(h.sent).toHaveLength(1);
  });

  it("two sweeps at once cannot both take the same retry", async () => {
    const h = harness((i) => (i === 0 ? DOWN : OK));
    await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE });
    h.clock.ms += RETRY_DELAYS_MS[0];
    const [a, b] = await Promise.all([retryDueDeliveries(h.deps), retryDueDeliveries(h.deps)]);
    expect(a.sent + b.sent).toBe(1);
    expect(h.sent).toHaveLength(2);
    expect(h.only().status).toBe("sent");
  });

  it("an already sent e-mail is never picked up by the sweep", async () => {
    const h = harness([OK]);
    await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE });
    h.clock.ms += 30 * 24 * 3_600_000;
    expect(await retryDueDeliveries(h.deps)).toMatchObject({ due: 0, sent: 0, unknownClosed: 0 });
    expect(h.sent).toHaveLength(1);
  });

  it("the event key is the kind and the subject, nothing personal", () => {
    expect(deliveryEventKey("company_welcome", COMPANY)).toBe(`company_welcome:${COMPANY}`);
    expect(deliveryEventKey("company_welcome", COMPANY)).toMatch(/^[a-z_]{3,40}:[0-9a-f-]{36}$/);
  });
});

describe("T5 — a failure is recorded, retried a bounded number of times, and stays visible", () => {
  for (const kind of ["company_registration_notice", "company_welcome", "intake_alert"] as const) {
    it(`${kind}: failed record → retries → failed for good after ${MAX_ATTEMPTS} tries`, async () => {
      const h = harness(() => DOWN);
      const first = await deliverEvent(h.deps, { kind, subjectId: COMPANY });
      expect(first).toEqual({ outcome: "retry_wait", attempts: 1, reason: "smtp_rcpt_to_451" });
      expect(h.only()).toMatchObject({ status: "retry_wait", attempts: 1, lastError: "smtp_rcpt_to_451" });
      expect(h.only().nextAttemptAt).toBe(new Date(h.clock.ms + RETRY_DELAYS_MS[0]).toISOString());

      // Not due yet → the sweep does nothing.
      expect((await retryDueDeliveries(h.deps)).due).toBe(0);

      for (let tryNo = 2; tryNo <= MAX_ATTEMPTS; tryNo++) {
        h.clock.ms += RETRY_DELAYS_MS[tryNo - 2];
        const report = await retryDueDeliveries(h.deps);
        expect(report.due).toBe(1);
        expect(h.only().attempts).toBe(tryNo);
      }
      // After the last try: terminal, with its reason, still in the record.
      expect(h.only()).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, lastError: "smtp_rcpt_to_451", nextAttemptAt: null });
      expect(h.sent).toHaveLength(MAX_ATTEMPTS);

      // No further try, ever — and the row is not removed.
      h.clock.ms += 365 * 24 * 3_600_000;
      expect(await retryDueDeliveries(h.deps)).toMatchObject({ due: 0, sent: 0, failed: 0 });
      expect(h.sent).toHaveLength(MAX_ATTEMPTS);
      expect(h.rows.size).toBe(1);
      expect(h.only().status).toBe("failed");
    });
  }

  it("a retry that succeeds ends as sent with the attempt count kept", async () => {
    const h = harness((i) => (i < 2 ? DOWN : OK));
    await deliverEvent(h.deps, { kind: "company_welcome", subjectId: COMPANY });
    h.clock.ms += RETRY_DELAYS_MS[0];
    await retryDueDeliveries(h.deps);
    h.clock.ms += RETRY_DELAYS_MS[1];
    expect(await retryDueDeliveries(h.deps)).toMatchObject({ due: 1, sent: 1 });
    expect(h.only()).toMatchObject({ status: "sent", attempts: 3, lastError: null });
  });

  it("a failure that cannot improve is terminal at once (no pointless retries)", async () => {
    const h = harness([{ status: "failed", reason: "invalid_address", retryable: false }]);
    expect(await deliverEvent(h.deps, { kind: "company_welcome", subjectId: COMPANY })).toMatchObject({ outcome: "failed", reason: "invalid_address" });
    expect(h.only()).toMatchObject({ status: "failed", attempts: 1, nextAttemptAt: null });
  });

  it("nothing to send to (the organization is gone) is a recorded failure, not silence", async () => {
    const h = harness([OK], async () => ({ kind: "cannot", reason: "organization_gone", retryable: false }));
    await deliverEvent(h.deps, { kind: "company_registration_notice", subjectId: COMPANY });
    expect(h.sent).toHaveLength(0);
    expect(h.only()).toMatchObject({ status: "failed", lastError: "organization_gone" });
  });

  it("a throwing transport is a recorded, retryable failure", async () => {
    const h = harness([OK], async () => {
      throw new Error("db down");
    });
    expect(await deliverEvent(h.deps, { kind: "intake_alert", subjectId: INTAKE })).toMatchObject({ outcome: "retry_wait", reason: "attempt_threw" });
  });

  it("an attempt whose outcome is unknown is NOT re-sent; it becomes a visible failure", async () => {
    const h = harness([OK]);
    // The process died between "send" and "record": the row is left in `sending`.
    await h.deps.store.claimNew({ eventKey: deliveryEventKey("company_welcome", COMPANY), kind: "company_welcome", audience: "company", subjectId: COMPANY, locale: null, nowIso: new Date(h.clock.ms).toISOString() });
    h.clock.ms += STALE_SENDING_MS - 1000;
    expect((await retryDueDeliveries(h.deps)).unknownClosed).toBe(0);
    h.clock.ms += 2000;
    expect((await retryDueDeliveries(h.deps)).unknownClosed).toBe(1);
    expect(h.only()).toMatchObject({ status: "failed", lastError: "outcome_unknown" });
    expect(h.sent).toHaveLength(0);
  });

  it("a synthetic QA address is recorded as suppressed, never sent, never retried", async () => {
    const h = harness([{ status: "suppressed", reason: "synthetic_address" }]);
    expect(await deliverEvent(h.deps, { kind: "company_welcome", subjectId: COMPANY })).toMatchObject({ outcome: "suppressed" });
    h.clock.ms += 24 * 3_600_000;
    expect((await retryDueDeliveries(h.deps)).due).toBe(0);
  });

  it("an error is stored as a short machine code, never a server's reply text", () => {
    expect(reasonCode("smtp_rcpt_to_550")).toBe("smtp_rcpt_to_550");
    expect(reasonCode("550 5.1.1 <person@example.test>: Recipient address rejected")).toMatch(/^[a-z0-9_]{1,60}$/);
    expect(reasonCode("")).toBe("unknown");
  });
});

describe("when the record itself is unavailable (migration not applied, database down)", () => {
  const broken: DeliveryStore = {
    claimNew: async () => {
      throw new DeliveryRecordUnavailable("not_applied");
    },
    claimRetry: async () => null,
    finish: async () => {},
    listDue: async () => {
      throw new DeliveryRecordUnavailable("not_applied");
    },
    listStaleSending: async () => {
      throw new DeliveryRecordUnavailable("not_applied");
    },
  };

  it("an internal alert is still sent once, and the gap is logged", async () => {
    const h = harness([OK]);
    const out = await deliverEvent({ ...h.deps, store: broken }, { kind: "intake_alert", subjectId: INTAKE });
    expect(out).toEqual({ outcome: "sent_unrecorded", reason: null });
    expect(h.sent).toHaveLength(1);
    expect(h.logs.join()).toContain("RECORD UNAVAILABLE");
  });

  it("an e-mail to a company is NOT sent: nothing could prove it would not repeat", async () => {
    const h = harness([OK]);
    expect(await deliverEvent({ ...h.deps, store: broken }, { kind: "company_welcome", subjectId: COMPANY })).toEqual({ outcome: "not_sent_no_record" });
    expect(h.sent).toHaveLength(0);
  });

  it("the sweep reports it instead of pretending there was nothing to do", async () => {
    const h = harness([OK]);
    await expect(retryDueDeliveries({ ...h.deps, store: broken })).rejects.toBeInstanceOf(DeliveryRecordUnavailable);
  });

  it("never throws to the caller and refuses a subject that is not an id", async () => {
    const h = harness([OK]);
    expect(await deliverEvent(h.deps, { kind: "intake_alert", subjectId: "'; drop table x; --" })).toEqual({ outcome: "failed_unrecorded", reason: "invalid_subject" });
    expect(h.sent).toHaveLength(0);
  });
});
