/**
 * The invoice block (registry 7.20) rendered with the REAL catalogs in every
 * active locale: each honest state says its own sentence, the figures and the
 * Stripe links show, and the copy holds the product-copy rules.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { AccountBillingInvoices, type AccountBillingInvoicesLabels } from "@/components/app/account-billing-invoices";
import type { OrgInvoicesResult, OrgInvoiceView } from "@/lib/billing/org-invoices-core";

const WEB = join(__dirname, "..", "..");
type Copy = Record<string, unknown>;
const copyOf = (loc: string): Copy =>
  (JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")).accountBilling as Copy).invoices as Copy;

function labelsFor(loc: string): AccountBillingInvoicesLabels {
  const c = copyOf(loc);
  return { ...(c as unknown as AccountBillingInvoicesLabels), status: c.status as AccountBillingInvoicesLabels["status"] };
}

const PASS: OrgInvoiceView = {
  id: "in_1",
  number: "LM-0001",
  created: 1_761_200_000,
  periodStart: null,
  periodEnd: null,
  amountExcludingTax: 100,
  tax: 0,
  total: 100,
  currency: "eur",
  status: "paid",
  hostedInvoiceUrl: "https://invoice.stripe.com/i/acct/x",
  invoicePdfUrl: "https://pay.stripe.com/invoice/acct/x/pdf",
};

const render = (result: OrgInvoicesResult | null, loc = "en") => {
  const el = AccountBillingInvoices({ result, locale: loc, labels: labelsFor(loc) });
  return el ? renderToStaticMarkup(el) : "";
};

describe("catalog parity", () => {
  it("every active locale carries every invoice key, non-empty, with no [EN] shell", () => {
    const keys = (o: Copy, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v as Copy, `${p}${k}.`) : [`${p}${k}`]));
    const en = keys(copyOf("en")).sort();
    for (const loc of activeLocales) {
      const c = copyOf(loc);
      expect(keys(c).sort(), loc).toEqual(en);
      for (const k of en) {
        const v = k.split(".").reduce<unknown>((o, s) => (o as Copy)[s], c);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}.${k}`).toBe(true);
        expect(String(v), `${loc}.${k}`).not.toMatch(/\[EN\]/);
      }
    }
  });
  it("product-copy rules: no 'demo', no verification claim, LT speaks 'jūs' (never 'tu')", () => {
    for (const loc of activeLocales) {
      const text = JSON.stringify(copyOf(loc)).toLowerCase();
      expect(text, loc).not.toMatch(/demo/);
      expect(text, loc).not.toMatch(/verified|patvirtint|verifi/);
    }
    const lt = JSON.stringify(copyOf("lt"));
    expect(lt).not.toMatch(/\b(tu|tavo|tau|bandyk)\b/i);
    expect(lt).toContain("bandykite");
  });
});

describe("states, in every active locale", () => {
  it("not authorized → nothing at all", () => {
    for (const loc of activeLocales) expect(render({ state: "not_authorized" }, loc), loc).toBe("");
    expect(render(null)).toBe("");
  });
  it("billing off / no customer / unknown / empty each say their own sentence", () => {
    for (const loc of activeLocales) {
      const c = copyOf(loc);
      expect(render({ state: "billing_off" }, loc), loc).toContain(String(c.billingOff));
      expect(render({ state: "no_customer" }, loc), loc).toContain(String(c.noCustomer));
      const unknown = render({ state: "unknown" }, loc);
      expect(unknown, loc).toContain(String(c.unknown));
      // UNKNOWN never reads as "no invoices".
      expect(unknown, loc).not.toContain(String(c.empty));
      expect(render({ state: "list", invoices: [], incomplete: false }, loc), loc).toContain(String(c.empty));
    }
  });
  it("the paid 1 € invoice shows number, date, one-time, excl. VAT, VAT, total, status and both Stripe links", () => {
    for (const loc of activeLocales) {
      const c = copyOf(loc);
      const html = render({ state: "list", invoices: [PASS], incomplete: false }, loc);
      expect(html, loc).toContain("LM-0001");
      expect(html, loc).toContain(String(c.oneTime));
      expect(html, loc).toContain(String((c.status as Copy).paid));
      expect(html, loc).toContain(String(c.excludingVat));
      expect(html, loc).toContain(String(c.vat));
      expect(html, loc).toContain('href="https://invoice.stripe.com/i/acct/x"');
      expect(html, loc).toContain('href="https://pay.stripe.com/invoice/acct/x/pdf"');
      expect(html, loc).toContain('rel="noopener noreferrer"');
      expect(html, loc).not.toContain(String(c.incomplete));
    }
    const en = render({ state: "list", invoices: [PASS], incomplete: false });
    expect(en).toContain("€1.00");
    expect(en).toContain("€0.00");
    expect(en).toContain("October 23, 2025");
  });
  it("an unreported VAT reads 'not reported', never 0; a partial list says it may be incomplete", () => {
    const html = render({ state: "list", invoices: [{ ...PASS, tax: null, amountExcludingTax: null }], incomplete: true });
    expect(html).toContain("not reported");
    expect(html).not.toContain("€0.00");
    expect(html).toContain(String(copyOf("en").incomplete));
  });
  it("a service period is stated when Stripe reports one; no link when Stripe gave none", () => {
    const html = render({
      state: "list",
      invoices: [{ ...PASS, status: "open", periodStart: 1_761_000_000, periodEnd: 1_763_600_000, hostedInvoiceUrl: null, invoicePdfUrl: null }],
      incomplete: false,
    });
    expect(html).toContain("October 20, 2025 – November 20, 2025");
    expect(html).toContain('data-invoice-status="open"');
    expect(html).not.toContain("href=");
  });
});
