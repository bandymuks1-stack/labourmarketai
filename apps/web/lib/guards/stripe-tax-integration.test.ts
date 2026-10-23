import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isHandledEventType, isRecordOnlyEventType } from "@/lib/billing/webhook-core";

/**
 * Guard: Stripe Tax integration (owner order 2026-10-23) stays TEST-first,
 * switched OFF by default, inside the existing billing architecture, and never
 * becomes a public claim before it runs in production.
 *
 *   1. the switch exists, defaults to "false", and lm-env-set.sh validates it;
 *   2. the evidence table keeps the billing posture: the billing_subscriptions
 *      read predicate, no write policy, no definer function, no anon/public
 *      grant, an erasure decision for every person column, a refusing rollback;
 *   3. the ONE webhook route captures evidence only behind the switch and
 *      handles customer.tax_id.updated without moving subscription state;
 *   4. the customer read goes through RLS (never the service role);
 *   5. public copy says nothing about Stripe Tax (only the admin billing page
 *      and the signed-in account billing section may name it).
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const MIGRATION = "supabase/migrations/20261023120000_billing_tax_evidence_v1.sql";
const ROLLBACK = "supabase/rollbacks/20261023120000_billing_tax_evidence_v1.down.sql";
const sqlNoComments = (s: string) => s.replace(/--[^\n]*/g, "");

describe("1. the switch is OFF by default and validated where it is set", () => {
  it("env: BILLING_STRIPE_TAX_ENABLED is a true/false enum defaulting to false", () => {
    expect(read("lib/env.ts")).toMatch(/BILLING_STRIPE_TAX_ENABLED: z\.enum\(\["true", "false"\]\)\.default\("false"\)/);
    expect(read("lib/env.ts")).toContain("BILLING_STRIPE_TAX_ENABLED: process.env.BILLING_STRIPE_TAX_ENABLED");
  });
  it("config: the helper is true ONLY for the exact string \"true\"", () => {
    expect(read("lib/billing/config.ts")).toContain('return env.BILLING_STRIPE_TAX_ENABLED === "true";');
  });
  it("ops: lm-env-set.sh refuses any other value", () => {
    expect(readRepo("ops/vps/lm-env-set.sh")).toContain('BILLING_STRIPE_TAX_ENABLED) enum "$NAME" "true false";;');
  });
});

describe("2. billing_tax_evidence keeps the billing-table posture", () => {
  const sql = readRepo(MIGRATION);
  const code = sqlNoComments(sql);

  it("RLS on, ONE select policy = the billing_subscriptions predicate", () => {
    expect(code).toMatch(/alter table public\.billing_tax_evidence enable row level security;/);
    expect(code).toMatch(
      /create policy billing_tax_evidence_select on public\.billing_tax_evidence\s+for select to authenticated\s+using \(owner_id = auth\.uid\(\) or public\.is_admin\(\)\);/,
    );
    expect((code.match(/create policy/g) ?? []).length).toBe(1);
    expect(code).not.toMatch(/for (insert|update|delete|all)/i);
  });

  it("grants: SELECT to authenticated, SELECT/INSERT/UPDATE to service_role, nothing to anon/public, no DELETE", () => {
    // service_role is revoked too: where default privileges grant it ALL (the
    // local Supabase stack), DELETE/TRUNCATE would otherwise survive.
    expect(code).toContain("revoke all on table public.billing_tax_evidence from public, anon, authenticated, service_role;");
    expect(code).toContain("grant select on public.billing_tax_evidence to authenticated;");
    expect(code).toContain("grant select, insert, update on public.billing_tax_evidence to service_role;");
    expect(code).not.toMatch(/grant[^;]*to\s+(anon|public)\b/i);
    expect(code).not.toMatch(/grant[^;]*delete[^;]*billing_tax_evidence/i);
    expect(code).not.toMatch(/security\s+definer/i);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("no existing table is altered", () => {
    expect(code).not.toMatch(/alter table public\.(?!billing_tax_evidence\b)\w+/i);
  });

  it("is NOT pre-marked human-gate-approved: the owner approved the direction, not this SQL", () => {
    expect(sql).not.toMatch(/^--\s*@human-gate-approved/m);
  });

  it("every person column has an erasure registry decision; the rollback refuses while rows exist", () => {
    expect(code).toMatch(/'billing_tax_evidence', 'owner_id', 'profiles', 'set null', 'sever_sentinel'/);
    expect(code).toMatch(/'billing_tax_evidence', 'reviewed_by', 'profiles', 'set null', 'set_null'/);
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    expect(readRepo(ROLLBACK)).toMatch(/ROLLBACK REFUSED: billing_tax_evidence holds/);
  });

  it("the person's own evidence is in the GDPR export register", () => {
    expect(read("lib/privacy/personal-relations.ts")).toMatch(/table: "billing_tax_evidence", key: "profile_id", column: "owner_id"/);
  });
});

describe("3. the ONE webhook route, extended — not forked", () => {
  const route = read("app/api/billing/webhook/route.ts");

  it("evidence capture runs only behind the switch and after the event's own processing", () => {
    expect(route).toMatch(/if \(billingStripeTaxEnabled\(\) && \(result === "ok" \|\| result === "stale-event"\)\) \{\s*const tax = await captureTaxEvidence\(event, provider\);/);
    expect(route.indexOf("captureTaxEvidence(event, provider)")).toBeGreaterThan(route.indexOf("applyInvoicePayment("));
  });

  it("customer.tax_id.updated is handled, records evidence only, and is not record-only", () => {
    expect(isHandledEventType("customer.tax_id.updated")).toBe(true);
    expect(isRecordOnlyEventType("customer.tax_id.updated")).toBe(false);
    expect(route).toContain('event.type === "customer.tax_id.updated"');
    expect(route).toContain("applyTaxIdUpdate(event)");
  });

  it("no second webhook route exists for tax", () => {
    expect(existsSync(join(APP, "app/api/billing/tax"))).toBe(false);
    expect(existsSync(join(APP, "app/api/billing/tax-webhook"))).toBe(false);
  });

  it("the tax read in the adapter is READ-ONLY (retrieve / listTaxIds), never a create or update", () => {
    const adapter = read("lib/billing/providers/stripe-test.ts");
    const block = adapter.slice(adapter.indexOf("async retrieveTaxEvidenceSources("));
    expect(block).toContain("checkout.sessions.retrieve(");
    expect(block).toContain("customers.listTaxIds(");
    expect(block).not.toMatch(/\.(create|update|del|createTaxId|deleteTaxId)\(/);
  });

  it("the review logic never writes an amount it computed: amounts come only from parsed Stripe objects", () => {
    const store = read("lib/billing/tax-evidence-store.ts");
    expect(store).toMatch(/amount_tax: e\.amountTax,/);
    expect(store).not.toMatch(/amount_tax:\s*(0|null)\b/);
  });
});

describe("4. the customer read is RLS-bound", () => {
  it("tax-evidence-read and the account line never use the service role", () => {
    for (const f of [
      "lib/billing/tax-evidence-read.ts",
      "components/app/account-billing-tax-line.tsx",
      "components/app/account-billing-section.tsx",
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/createAdminClient|SUPABASE_SERVICE_ROLE_KEY|@\/lib\/supabase\/admin/);
    }
    // The read happens only while the switch is on, with the user's own client.
    expect(read("components/app/account-billing-section.tsx")).toMatch(
      /billingOn && taxOrganizationId && billingStripeTaxEnabled\(\)\s*\?\s*await readLatestTaxEvidence\(await createClient\(\),/,
    );
  });
});

describe("5. no public Stripe Tax claim before production", () => {
  const LOCALES = ["lt", "en", "de", "nl", "pl", "ru"];
  // Only the superadmin billing page and the signed-in account billing section
  // (rendered only when the switch is on and Stripe recorded tax) may name it.
  const ALLOWED = new Set(["adminBilling", "accountBilling"]);
  for (const loc of LOCALES) {
    it(`${loc}: no other namespace names Stripe Tax`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
      const offenders = Object.entries(msgs)
        .filter(([ns, v]) => !ALLOWED.has(ns) && /stripe\s*tax/i.test(JSON.stringify(v)))
        .map(([ns]) => ns);
      expect(offenders).toEqual([]);
    });
  }
});
