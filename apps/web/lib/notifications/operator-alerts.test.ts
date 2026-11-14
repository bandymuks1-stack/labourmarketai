import { describe, expect, it } from "vitest";

import {
  buildOperatorAlertMail,
  runOperatorAlertSweep,
  MAX_ITEMS_PER_MAIL,
  type DueItem,
  type Recipient,
  type Rpc,
  type Send,
} from "./operator-alerts";

const ORIGIN = "https://labourmarket.ai";

/** An in-memory stand-in for the three database functions, with the same ledger rules as
 *  migration 20261112090000 (proven on PostgreSQL by scripts/db-proof/operator-application-alerts-v1.sh). */
function fakeDb(due: DueItem[], recipients: Partial<Record<string, Recipient[]>>) {
  const ledger: { event: string; key: string; token?: string }[] = [];
  let n = 0;
  const rpc: Rpc = async (fn, args = {}) => {
    if (fn === "operator_alerts_due_v1") return { data: due, error: null };
    // recipients are keyed "entity|stage", or by stage alone when every entity shares them
    if (fn === "operator_alert_recipients_v1")
      return { data: recipients[`${String(args.p_entity)}|${String(args.p_stage)}`] ?? recipients[String(args.p_stage)] ?? [], error: null };
    const a = args as Record<string, string>;
    const key = `${a.p_entity}:${a.p_entity_id}:${a.p_stage}:${a.p_recipient ?? "-"}`;
    if (a.p_event === "skipped_no_recipient") {
      if (ledger.some((l) => l.event === "skipped" && l.key === key)) return { data: { outcome: "already_logged" }, error: null };
      ledger.push({ event: "skipped", key });
      return { data: { outcome: "logged" }, error: null };
    }
    if (a.p_event === "reserve") {
      if (ledger.some((l) => l.event === "sent" && l.key === key)) return { data: { outcome: "already_sent" }, error: null };
      const open = ledger.filter((l) => l.event === "reserved" && l.key === key)
        .some((r) => !ledger.some((o) => (o.event === "sent" || o.event === "failed") && o.token === r.token));
      if (open) return { data: { outcome: "in_flight" }, error: null };
      if (ledger.filter((l) => l.event === "failed" && l.key === key).length >= 5) return { data: { outcome: "gave_up" }, error: null };
      const token = `t${++n}`;
      ledger.push({ event: "reserved", key, token });
      return { data: { outcome: "reserved", token }, error: null };
    }
    ledger.push({ event: a.p_event, key, token: a.p_token });
    return { data: { outcome: "recorded" }, error: null };
  };
  return { rpc, ledger };
}

const intake = (id: string, stage: DueItem["stage"], age: number): DueItem => ({
  entity: "company_need_public_intakes", entity_id: id, stage, age_hours: age, country: "SE",
});
const OP: Recipient = { profile_id: "op-1", email: "operator@ops.example" };
const ADMIN: Recipient = { profile_id: "admin-1", email: "admin@ops.example" };

function recordingSend(results: Array<"sent" | "failed"> = []) {
  const sent: { to: string; subject: string; text: string }[] = [];
  const send: Send = async (msg) => {
    sent.push(msg);
    const r = results.shift() ?? "sent";
    return r === "sent" ? { status: "sent" } : { status: "failed", reason: "smtp_451" };
  };
  return { send, sent };
}

describe("idempotency per application, stage and recipient", () => {
  it("two runs send one mail", async () => {
    const db = fakeDb([intake("11111111-1111-4111-8111-111111111111", "immediate", 1)], { immediate: [OP] });
    const mail = recordingSend();
    await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    const second = await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(mail.sent).toHaveLength(1);
    expect(second.kind === "ok" && second.counts.already_sent).toBe(1);
  });

  it("a failed send is recorded as failed and retried on the next run, not marked done", async () => {
    const db = fakeDb([intake("22222222-2222-4222-8222-222222222222", "immediate", 2)], { immediate: [OP] });
    const mail = recordingSend(["failed", "sent"]);
    const first = await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(first.kind === "ok" && first.counts.failed).toBe(1);
    const second = await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(second.kind === "ok" && second.counts.sent).toBe(1);
    expect(mail.sent).toHaveLength(2);
    expect(db.ledger.map((l) => l.event)).toEqual(["reserved", "failed", "reserved", "sent"]);
  });

  it("a send that throws is a failure, never a success", async () => {
    const db = fakeDb([intake("33333333-3333-4333-8333-333333333333", "immediate", 1)], { immediate: [OP] });
    const res = await runOperatorAlertSweep(db.rpc, async () => { throw new Error("socket"); }, ORIGIN);
    expect(res.kind === "ok" && res.counts.failed).toBe(1);
    expect(db.ledger.some((l) => l.event === "sent")).toBe(false);
  });

  it("several waiting applications go to one recipient in one mail, capped", async () => {
    const many = Array.from({ length: MAX_ITEMS_PER_MAIL + 3 }, (_, i) =>
      intake(`44444444-4444-4444-8444-${String(i).padStart(12, "0")}`, "immediate", 1));
    const db = fakeDb(many, { immediate: [OP] });
    const mail = recordingSend();
    await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toContain(`(${MAX_ITEMS_PER_MAIL})`);
    await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(mail.sent).toHaveLength(2);
    expect(mail.sent[1].subject).toContain("(3)");
  });
});

describe("stages", () => {
  it("each stage goes to its own recipients: operators first, admins at 48 h", async () => {
    const db = fakeDb(
      [intake("55555555-5555-4555-8555-555555555555", "reminder_24h", 30), intake("66666666-6666-4666-8666-666666666666", "escalation_48h", 50)],
      { reminder_24h: [OP], escalation_48h: [ADMIN] },
    );
    const mail = recordingSend();
    await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(mail.sent.map((m) => [m.to, m.subject.split(":")[0]])).toEqual([
      ["operator@ops.example", "Priminimas"],
      ["admin@ops.example", "Eskalacija"],
    ]);
  });
});

describe("recipients follow each application's review authority", () => {
  it("an intake goes to admins only, a claim also to the claim operator; one mail per reviewer", async () => {
    const claim: DueItem = { entity: "organization_claims", entity_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", stage: "immediate", age_hours: 1, country: "IT" };
    const db = fakeDb(
      [intake("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "immediate", 1), claim],
      { "company_need_public_intakes|immediate": [ADMIN], "organization_claims|immediate": [OP, ADMIN] },
    );
    const mail = recordingSend();
    await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    const byTo = Object.fromEntries(mail.sent.map((m) => [m.to, m.text]));
    expect(Object.keys(byTo).sort()).toEqual(["admin@ops.example", "operator@ops.example"]);
    expect(byTo["operator@ops.example"]).not.toContain("nr. dddddddd");
    expect(byTo["operator@ops.example"]).toContain("cccccccc");
    expect(byTo["admin@ops.example"]).toContain("nr. dddddddd");
    expect(byTo["admin@ops.example"]).toContain("cccccccc");
  });

  it("an entity nobody can review is skipped while the others are still sent", async () => {
    const claim: DueItem = { entity: "organization_claims", entity_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", stage: "immediate", age_hours: 1, country: "IT" };
    const db = fakeDb([intake("ffffffff-ffff-4fff-8fff-ffffffffffff", "immediate", 1), claim], { "organization_claims|immediate": [OP] });
    const mail = recordingSend();
    const r = await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(r.kind === "ok" && r.counts.skipped_no_recipient).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });
});

describe("recipient guard", () => {
  it("no recipient: nothing is sent, the skip is logged once, and no stage is marked", async () => {
    const db = fakeDb([intake("77777777-7777-4777-8777-777777777777", "immediate", 1)], {});
    const mail = recordingSend();
    const r1 = await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(mail.sent).toHaveLength(0);
    expect(r1.kind === "ok" && r1.counts.skipped_no_recipient).toBe(1);
    expect(db.ledger.filter((l) => l.event === "skipped")).toHaveLength(1);
    expect(db.ledger.some((l) => l.event === "reserved")).toBe(false);
  });

  it("an address-less recipient row is never mailed", async () => {
    const db = fakeDb([intake("88888888-8888-4888-8888-888888888888", "immediate", 1)], {
      immediate: [{ profile_id: "op-2", email: "" }],
    });
    const mail = recordingSend();
    await runOperatorAlertSweep(db.rpc, mail.send, ORIGIN);
    expect(mail.sent).toHaveLength(0);
  });

  it("the database is not ready: nothing is sent", async () => {
    const rpc: Rpc = async () => ({ data: null, error: { code: "42883" } });
    const mail = recordingSend();
    expect(await runOperatorAlertSweep(rpc, mail.send, ORIGIN)).toEqual({ kind: "needs_migration" });
    expect(mail.sent).toHaveLength(0);
  });
});

describe("the mail body carries no personal data", () => {
  const items: DueItem[] = [
    intake("99999999-9999-4999-8999-999999999999", "immediate", 3),
    { entity: "organization_claims", entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stage: "immediate", age_hours: 2, country: "IT" },
    { entity: "companies", entity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", stage: "immediate", age_hours: 5, country: null },
  ];
  const mail = buildOperatorAlertMail("immediate", items, ORIGIN);

  it("type, age, country, a reference and the review path only", () => {
    expect(mail.text).toContain("Įmonės poreikio paraiška · laukia 3 h · šalis SE · nr. 99999999");
    expect(mail.text).toContain("/lt/dashboard/admin/company-need-intakes");
    expect(mail.text).toContain("/lt/dashboard/admin/company-verification");
    expect(mail.text).toContain("šalis nenurodyta");
  });

  it("no e-mail address, phone number or document link", () => {
    expect(mail.text).not.toMatch(/@/);
    expect(mail.text).not.toMatch(/\+?\d[\d\s-]{7,}\d/);
    expect(mail.text).not.toMatch(/storage|\.pdf|password|slaptažod/i);
  });

  it("a claim names its real review path and does not pretend a web page opens it", () => {
    expect(mail.text).toContain("Web peržiūros puslapio dar nėra");
    expect(mail.text).toContain(`${ORIGIN}/api/mcp`);
    expect(mail.text).toContain("company.claims.list");
    expect(mail.text).toContain("Prašymo nr.: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(mail.text).not.toMatch(/dashboard\/admin\/?\s*$/m);
  });

  it("states the deadlines are internal, never a promise to a customer", () => {
    expect(mail.text).toContain("vidiniai terminai, ne pažadas klientui");
  });
});
