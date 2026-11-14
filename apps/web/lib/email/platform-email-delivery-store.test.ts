/**
 * What each platform e-mail is composed from, to whom it goes, and how the
 * mailbox sender behaves. A fake database and a fake mail server: nothing here
 * can reach a real mailbox. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sendSmtp, smtpConfigFromEnv, reserve } = vi.hoisted(() => ({
  sendSmtp: vi.fn(),
  smtpConfigFromEnv: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock("@/lib/email/smtp", () => ({ sendSmtp, smtpConfigFromEnv }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/email/send-ledger-store", () => ({ createSupabaseEmailSendStore: () => ({ reserve }) }));

import {
  NOTIFICATION_HEADER,
  __setPlatformEmailDepsForTests,
  createComposer,
  deliverCompanyRegistrationEmails,
  mailboxSender,
  ownerNotifyAddress,
  supportReplyToAddress,
} from "./platform-email-delivery-store";
import type { DeliveryDeps, DeliveryRow, OutboundEmail } from "./platform-email-delivery";

const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const ORG = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-0000000000b1";
const INTAKE = "00000000-0000-4000-8000-0000000000d1";

type Tables = Record<string, Record<string, unknown>[]>;

/** The few query shapes the composer uses, over in-memory rows. */
function fakeDb(tables: Tables, verified: boolean | "error" = true, failing: string[] = []) {
  const rpcCalls: unknown[] = [];
  const from = (name: string) => {
    const filters: [string, unknown][] = [];
    let head = false;
    const q = {
      select(_c: string, opts?: { head?: boolean }) {
        head = !!opts?.head;
        return q;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return q;
      },
      rows() {
        return (tables[name] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      },
      async maybeSingle() {
        if (failing.includes(name)) return { data: null, error: { code: "57014" } };
        return { data: q.rows()[0] ?? null, error: null };
      },
      then(resolve: (v: unknown) => void) {
        if (failing.includes(name)) return resolve({ count: null, error: { code: "42501" } });
        resolve(head ? { count: q.rows().length, error: null } : { data: q.rows(), error: null });
      },
    };
    return q;
  };
  return {
    from,
    rpcCalls,
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push([fn, args]);
      return verified === "error" ? { data: null, error: { code: "42883" } } : { data: verified, error: null };
    },
  } as never;
}

const baseTables = (): Tables => ({
  organizations: [
    { id: ORG, legal_name: "QA-SYNTHETIC Statyba UAB", display_name: null, country: "LT", owner_profile_id: OWNER, legacy_company_id: COMPANY, organization_type: "company" },
  ],
  profiles: [{ id: OWNER, email: "qa.owner@example.test", full_name: "QA-SYNTHETIC Vardenis", locale: "pl" }],
  customer_requests: [
    { organization_id: ORG, status: "submitted" },
    { organization_id: ORG, status: "draft" },
  ],
  company_need_public_intakes: [
    { id: INTAKE, source_path: "/de/request/b2b" },
    { id: COMPANY, source_path: "/de/company-need" },
  ],
});

const row = (kind: DeliveryRow["kind"], subjectId: string, locale: string | null = null) => ({
  kind,
  subjectId,
  locale,
  audience: kind === "company_welcome" ? ("company" as const) : ("internal" as const),
  createdAt: "2026-11-13T19:40:00.000Z",
});

async function composed(c: ReturnType<typeof createComposer>, r: ReturnType<typeof row>): Promise<OutboundEmail> {
  const out = await c(r);
  if (out.kind !== "send") throw new Error(`not composed: ${out.reason}`);
  return out.email;
}

describe("T1 — the registration notice", () => {
  it("goes to the configured owner mailbox with every fact the owner listed", async () => {
    const c = createComposer(() => fakeDb(baseTables()), {});
    const email = await composed(c, row("company_registration_notice", COMPANY));
    expect(email.to).toBe("info@labourmarket.ai");
    expect(email.subject).toBe("LabourMarket.ai – užsiregistravo nauja įmonė: QA-SYNTHETIC Statyba UAB");
    expect(email.text).toContain("Šalis: Lietuva (LT)");
    expect(email.text).toContain("Registracijos data ir laikas: 2026-11-13 19:40 UTC");
    expect(email.text).toContain("Kontaktinis asmuo: QA-SYNTHETIC Vardenis");
    expect(email.text).toContain("Darbo el. paštas: qa.owner@example.test");
    expect(email.text).toContain(`https://labourmarket.ai/lt/dashboard/admin/company-verification#company-${COMPANY}`);
    // One published need (the draft is not counted).
    expect(email.text).toContain("Ar įmonė jau paskelbė poreikį: Taip (1)");
    expect(email.headers).toEqual({ [NOTIFICATION_HEADER]: "company-registration" });
  });

  it("the recipient is configuration: a changed address needs no code change", async () => {
    const c = createComposer(() => fakeDb(baseTables()), { LM_OWNER_NOTIFY_EMAIL: "registrations@example.test" });
    expect((await composed(c, row("company_registration_notice", COMPANY))).to).toBe("registrations@example.test");
    expect(ownerNotifyAddress({ LM_OWNER_NOTIFY_EMAIL: "not an address" })).toBe("info@labourmarket.ai");
    expect(ownerNotifyAddress({})).toBe("info@labourmarket.ai");
    expect(supportReplyToAddress({ LM_SUPPORT_REPLY_TO: "help@example.test" })).toBe("help@example.test");
  });

  it("an unreadable need count is 'could not tell', never 'no'", async () => {
    const c = createComposer(() => fakeDb(baseTables(), true, ["customer_requests"]), {});
    expect((await composed(c, row("company_registration_notice", COMPANY))).text).toContain("Ar įmonė jau paskelbė poreikį: nepavyko nustatyti");
  });

  it("an organization that no longer exists is a terminal, recorded reason", async () => {
    const c = createComposer(() => fakeDb({ ...baseTables(), organizations: [] }), {});
    expect(await c(row("company_registration_notice", COMPANY))).toEqual({ kind: "cannot", reason: "organization_gone", retryable: false });
  });

  it("a database error is retryable, not a lost notice", async () => {
    const c = createComposer(() => fakeDb(baseTables(), true, ["organizations"]), {});
    expect(await c(row("company_registration_notice", COMPANY))).toEqual({ kind: "cannot", reason: "organization_unreadable", retryable: true });
  });
});

describe("T2 — the welcome e-mail", () => {
  it("goes to the account's own proven address, in the language it chose, with Reply-To support", async () => {
    const c = createComposer(() => fakeDb(baseTables(), true), {});
    const email = await composed(c, row("company_welcome", COMPANY));
    expect(email.to).toBe("qa.owner@example.test");
    expect(email.subject).toBe("Witamy na LabourMarket.ai – jesteśmy gotowi pomóc"); // profiles.locale = pl
    expect(email.replyTo).toBe("info@labourmarket.ai");
    expect(email.organizationId).toBe(ORG);
    // A reply to this e-mail is a customer's e-mail: it carries no notice header.
    expect(email.headers).toBeUndefined();
  });

  it.each([
    ["lt", "Sveiki prisijungę prie LabourMarket.ai – esame pasiruošę padėti"],
    ["en", "Welcome to LabourMarket.ai – we are ready to help"],
    ["ru", "Добро пожаловать на LabourMarket.ai – мы готовы помочь"],
    ["pl", "Witamy na LabourMarket.ai – jesteśmy gotowi pomóc"],
    ["de", "Willkommen bei LabourMarket.ai – wir helfen Ihnen gern"],
    ["nl", "Welkom bij LabourMarket.ai – wij staan klaar om u te helpen"],
  ])("the language recorded with the event wins: %s", async (locale, subject) => {
    const c = createComposer(() => fakeDb(baseTables(), true), {});
    expect((await composed(c, row("company_welcome", COMPANY, locale))).subject).toBe(subject);
  });

  it("is NOT sent to an address that is not verified for that account", async () => {
    const c = createComposer(() => fakeDb(baseTables(), false), {});
    expect(await c(row("company_welcome", COMPANY))).toEqual({ kind: "cannot", reason: "email_not_confirmed", retryable: true });
  });

  it("asks the platform's one verification rule, for this account and this address", async () => {
    const db = fakeDb(baseTables(), true);
    await createComposer(() => db, {})(row("company_welcome", COMPANY));
    expect((db as unknown as { rpcCalls: unknown[] }).rpcCalls).toEqual([
      ["email_is_verified_v1", { p_profile_id: OWNER, p_email: "qa.owner@example.test" }],
    ]);
  });

  it("a rule that cannot be asked is never read as verified: the e-mail waits", async () => {
    const c = createComposer(() => fakeDb(baseTables(), "error"), {});
    expect(await c(row("company_welcome", COMPANY))).toEqual({ kind: "cannot", reason: "verification_unavailable", retryable: true });
  });

  it("never goes to the contact address typed into the company form", async () => {
    // The composer reads no company contact column at all: only the account.
    const tables = baseTables();
    tables.organizations[0].public_contact_email = "typed-by-hand@example.test";
    const c = createComposer(() => fakeDb(tables, true), {});
    expect((await composed(c, row("company_welcome", COMPANY))).to).toBe("qa.owner@example.test");
  });

  it("no account behind the organization → a terminal recorded reason", async () => {
    const tables = baseTables();
    tables.organizations[0].owner_profile_id = null;
    const c = createComposer(() => fakeDb(tables), {});
    expect(await c(row("company_welcome", COMPANY))).toEqual({ kind: "cannot", reason: "no_recipient", retryable: false });
  });
});

describe("T3/T4 — the request alert is the same e-mail for both no-signup paths", () => {
  it("a request door and the /company-need form compose the same alert to the same mailbox", async () => {
    const c = createComposer(() => fakeDb(baseTables()), {});
    const door = await composed(c, row("intake_alert", INTAKE));
    const need = await composed(c, row("intake_alert", COMPANY));
    expect(door.to).toBe("info@labourmarket.ai");
    expect(need.to).toBe(door.to);
    expect(door.subject).toBe("LabourMarket.ai – nauja užklausa: B2B bendradarbiavimo užklausa");
    expect(need.subject).toBe("LabourMarket.ai – nauja užklausa: Įmonės poreikio užklausa");
    expect(door.text).toContain(`https://labourmarket.ai/lt/dashboard/admin/company-need-intakes#${INTAKE}`);
    expect(door.headers).toEqual({ [NOTIFICATION_HEADER]: "request" });
    expect(need.headers).toEqual({ [NOTIFICATION_HEADER]: "company-need" });
    // Same layout and wording apart from the type and the row link.
    const strip = (s: string) => s.replace(/B2B bendradarbiavimo užklausa|Įmonės poreikio užklausa/g, "X").replace(/#[0-9a-f-]{36}/g, "#id");
    expect(strip(door.html)).toBe(strip(need.html));
  });

  it("never goes to the person who wrote the request and carries nothing of theirs", async () => {
    const tables = baseTables();
    Object.assign(tables.company_need_public_intakes[0], { contact_email: "sender@example.test", contact_name: "QA-SYNTHETIC Siuntejas", description: "QA-SYNTHETIC tekstas" });
    const c = createComposer(() => fakeDb(tables), {});
    const email = await composed(c, row("intake_alert", INTAKE));
    expect(email.to).toBe("info@labourmarket.ai");
    expect(JSON.stringify(email)).not.toMatch(/sender@example\.test|Siuntejas|QA-SYNTHETIC tekstas/);
  });
});

describe("a marked test request is labelled, never silenced", () => {
  const withMark = () => {
    const tables = baseTables();
    tables.company_need_public_intakes[0].company_name = "QA-SYNTHETIC need walk 1.1 (not a real company)";
    tables.company_need_public_intakes[1].company_name = "  QA-SYNTHETIC need walk 2.1 (not a real company)";
    return tables;
  };

  it("the subject says QA-SYNTHETIC for both paths; the header a mailbox rule reads is unchanged", async () => {
    const c = createComposer(() => fakeDb(withMark()), {});
    const door = await composed(c, row("intake_alert", INTAKE));
    const need = await composed(c, row("intake_alert", COMPANY));
    expect(door.subject).toBe("LabourMarket.ai – nauja užklausa: [QA-SYNTHETIC] B2B bendradarbiavimo užklausa");
    expect(need.subject).toBe("LabourMarket.ai – nauja užklausa: [QA-SYNTHETIC] Įmonės poreikio užklausa");
    expect(door.headers).toEqual({ [NOTIFICATION_HEADER]: "request" });
    expect(need.headers).toEqual({ [NOTIFICATION_HEADER]: "company-need" });
  });

  it("it is still sent to the same mailbox with the same queue link — a label, not an exemption", async () => {
    const c = createComposer(() => fakeDb(withMark()), {});
    const email = await composed(c, row("intake_alert", INTAKE));
    expect(email.to).toBe("info@labourmarket.ai");
    expect(email.text).toContain(`/lt/dashboard/admin/company-need-intakes#${INTAKE}`);
  });

  it("only the fixed mark enters the e-mail, never the rest of the name", async () => {
    const c = createComposer(() => fakeDb(withMark()), {});
    expect(JSON.stringify(await composed(c, row("intake_alert", INTAKE)))).not.toMatch(/need walk|not a real company/);
  });

  it("the mark must START the name; a real request is not labelled", async () => {
    const tables = baseTables();
    tables.company_need_public_intakes[0].company_name = "UAB Statyba (ne QA-SYNTHETIC)";
    const c = createComposer(() => fakeDb(tables), {});
    expect((await composed(c, row("intake_alert", INTAKE))).subject).toBe("LabourMarket.ai – nauja užklausa: B2B bendradarbiavimo užklausa");
  });
});

describe("the mailbox sender", () => {
  const email: OutboundEmail = { to: "qa.owner@example.test", subject: "s", text: "t", html: "<p>t</p>", replyTo: "info@labourmarket.ai", organizationId: ORG };
  beforeEach(() => {
    sendSmtp.mockReset().mockResolvedValue({ status: "sent", messageId: "<m@labourmarket.ai>" });
    smtpConfigFromEnv.mockReset().mockReturnValue({ host: "smtp.example.test", port: 465, user: "u", pass: "p", from: "LabourMarket.ai <info@labourmarket.ai>" });
    reserve.mockReset().mockResolvedValue({ allowed: true, organizationId: ORG });
  });

  it("sends HTML and text from the platform mailbox with Reply-To, and reports the server's acceptance", async () => {
    expect(await mailboxSender(email, "company")).toEqual({ status: "sent", messageId: "<m@labourmarket.ai>" });
    const [cfg, msg] = sendSmtp.mock.calls[0];
    expect(cfg.from).toBe("LabourMarket.ai <info@labourmarket.ai>");
    expect(msg).toMatchObject({ to: "qa.owner@example.test", html: "<p>t</p>", text: "t", replyTo: "info@labourmarket.ai" });
  });

  it("an e-mail to a company takes a slot in the durable send ledger; an internal notice does not", async () => {
    await mailboxSender(email, "company");
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve.mock.calls[0][0]).toMatchObject({ kind: "transactional", organizationId: ORG });
    // hash only — the address never reaches the ledger
    expect(JSON.stringify(reserve.mock.calls[0][0])).not.toContain("qa.owner@example.test");
    reserve.mockClear();
    await mailboxSender({ ...email, to: "info@labourmarket.ai" }, "internal");
    expect(reserve).not.toHaveBeenCalled();
  });

  it("over the cap → not sent, retryable", async () => {
    reserve.mockResolvedValue({ allowed: false, reason: "recipient_cap" });
    expect(await mailboxSender(email, "company")).toEqual({ status: "failed", reason: "rate_limited", retryable: true });
    expect(sendSmtp).not.toHaveBeenCalled();
  });

  it("no mailbox configured → a failure that is retried, never a pretended send", async () => {
    smtpConfigFromEnv.mockReturnValue(null);
    expect(await mailboxSender(email, "internal")).toEqual({ status: "failed", reason: "not_configured", retryable: true });
  });

  it("the server refuses → failed with its code; a malformed address is terminal", async () => {
    sendSmtp.mockResolvedValue({ status: "failed", reason: "smtp_rcpt_to_550" });
    expect(await mailboxSender(email, "internal")).toEqual({ status: "failed", reason: "smtp_rcpt_to_550", retryable: true });
    sendSmtp.mockResolvedValue({ status: "failed", reason: "invalid_address" });
    expect(await mailboxSender(email, "internal")).toEqual({ status: "failed", reason: "invalid_address", retryable: false });
  });

  it("a connection lost after the body was handed over is NOT retried (it may have arrived)", async () => {
    sendSmtp.mockResolvedValue({ status: "failed", reason: "connection_closed", detail: { provider: "smtp", step: "data_end", replyCode: null, messageTransmitted: true } });
    expect(await mailboxSender(email, "internal")).toEqual({ status: "failed", reason: "outcome_unknown", retryable: false });
    sendSmtp.mockResolvedValue({ status: "failed", reason: "connection_closed", detail: { provider: "smtp", step: "greeting", messageTransmitted: false } });
    expect(await mailboxSender(email, "internal")).toEqual({ status: "failed", reason: "connection_closed", retryable: true });
  });

  it("a synthetic QA plus-address is never sent to", async () => {
    expect(await mailboxSender({ ...email, to: "qa.walk+run1@labourmarket.ai" }, "company")).toEqual({ status: "suppressed", reason: "synthetic_address" });
    expect(sendSmtp).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe("a company registration raises both events, once each", () => {
  afterEach(() => __setPlatformEmailDepsForTests(null));

  it("the notice and the welcome; a second registration call sends nothing more", async () => {
    const keys = new Set<string>();
    const sent: string[] = [];
    const deps: DeliveryDeps = {
      store: {
        claimNew: async (e) => {
          if (keys.has(e.eventKey)) return null;
          keys.add(e.eventKey);
          return { id: e.eventKey, eventKey: e.eventKey, kind: e.kind, audience: e.audience, subjectId: e.subjectId, locale: e.locale, status: "sending", attempts: 1, lastError: null, nextAttemptAt: null, createdAt: e.nowIso, updatedAt: e.nowIso };
        },
        claimRetry: async () => null,
        finish: async () => {},
        listDue: async () => [],
        listStaleSending: async () => [],
      },
      compose: async (r) => ({ kind: "send", email: { to: r.audience, subject: r.kind, text: "", html: "" } }),
      send: async (e) => {
        sent.push(e.subject);
        return { status: "sent", messageId: null };
      },
    };
    __setPlatformEmailDepsForTests(deps);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await deliverCompanyRegistrationEmails({ companyId: COMPANY });
    await deliverCompanyRegistrationEmails({ companyId: COMPANY });
    expect(sent).toEqual(["company_registration_notice", "company_welcome"]);
    expect([...keys]).toEqual([`company_registration_notice:${COMPANY}`, `company_welcome:${COMPANY}`]);
  });
});
