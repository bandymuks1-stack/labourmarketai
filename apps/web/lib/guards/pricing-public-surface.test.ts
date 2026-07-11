import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Public pricing surface guard (launch repair Scope C).
 *
 * The public /pricing page is a commercial page for a customer, not a billing
 * console. It must never expose: Stripe test checkout, technical
 * PAYMENTS_ENABLED / billing-state banners, price IDs or plan slugs as UI.
 * The Stripe TEST checkout lives ONLY on the superadmin-gated
 * /dashboard/admin/billing page. The public page carries the honest
 * concierge-first early-access offer with its CTA to /company-need instead.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

const PRICING_PAGE = "app/[locale]/(marketing)/pricing/page.tsx";
const ADMIN_BILLING_PAGE = "app/[locale]/dashboard/admin/billing/page.tsx";

describe("public pricing page shows no technical billing surface", () => {
  const src = read(PRICING_PAGE);

  it("does not render the Stripe test checkout", () => {
    expect(src).not.toMatch(/BillingTestCheckout/);
  });

  it("does not render the technical billing-state banner", () => {
    expect(src).not.toMatch(/BillingStatusBanner/);
  });

  it("renders the concierge early-access banner and offer section", () => {
    expect(src).toMatch(/ConciergeAccessBanner/);
    expect(src).toMatch(/ConciergeOfferSection/);
  });
});

describe("the test checkout is reachable only behind the superadmin gate", () => {
  it("admin billing page hosts BillingTestCheckout and requires superadmin", () => {
    const src = read(ADMIN_BILLING_PAGE);
    expect(src).toMatch(/BillingTestCheckout/);
    expect(src).toMatch(/requireSuperadmin/);
  });

  it("no marketing page imports BillingTestCheckout", () => {
    // The (marketing) route group is the public surface; the component may
    // only be imported from the admin tree.
    const marketingDir = join(WEB_ROOT, "app", "[locale]", "(marketing)");
    const collect = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collect(full));
        else if (entry.endsWith(".tsx")) out.push(full);
      }
      return out;
    };
    const offenders = collect(marketingDir).filter((f) =>
      readFileSync(f, "utf8").includes("BillingTestCheckout"),
    );
    expect(offenders).toEqual([]);
  });
});

describe("concierge offer copy exists and stays honest", () => {
  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale} conciergeOffer namespace is complete`, () => {
      const catalog = JSON.parse(read(`messages/${locale}.json`)) as {
        conciergeOffer?: {
          banner?: { badge?: string; body?: string; cta?: string };
          title?: string;
          steps?: { title: string; body: string }[];
          note?: string;
          ctaLabel?: string;
        };
      };
      const c = catalog.conciergeOffer;
      expect(c?.banner?.badge).toBeTruthy();
      expect(c?.banner?.body).toBeTruthy();
      expect(c?.banner?.cta).toBeTruthy();
      expect(c?.steps?.length).toBe(4);
      expect(c?.note).toBeTruthy();
      const all = JSON.stringify(c);
      // §18 Realumo principas — no trial/demo wrapper vocabulary; and no
      // technical billing states in customer copy.
      for (const re of [
        /bandomoji prieiga/i,
        /pilotinis režimas/i,
        /Tier-2/i,
        /PAYMENTS_ENABLED/,
        /stripe/i,
        /price_/,
      ]) {
        expect(all).not.toMatch(re);
      }
    });
  }
});
