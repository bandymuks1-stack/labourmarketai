import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales, toActiveLocale } from "@/lib/i18n/config";

/**
 * Universal marketplace (owner area 11): a COMPANY sells, rents out or looks
 * for goods and work resources as ITSELF, not only through a person.
 *
 * `create_marketplace_listing_v2` always accepted `p_organization_id` (checked
 * by `manages_organization`), but the listings form never sent it, so every
 * listing read as a private person's and a company had no way to publish.
 * The form now offers the organization the person GOVERNS in the active
 * workspace (owner or manager — never an employee's employer) as the
 * publisher of a NEW listing; an edit never moves a listing between owners.
 *
 * The two marketplace contact actions also clamp the form-supplied locale
 * before it is interpolated into a redirect (`/evil.com` → `//evil.com/…`).
 */

const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const PAGE = "app/[locale]/dashboard/listings/page.tsx";
const SECTION = "components/app/marketplace-listings-section.tsx";

describe("a company publishes a listing as itself", () => {
  it("the page offers only the GOVERNED active organization as publisher", () => {
    const src = read(PAGE);
    expect(src).toMatch(/getActiveOrganizationContext\(\)/);
    expect(src).toMatch(/governedActiveOrganizationId\(orgCtx\)/);
    expect(src).toMatch(/publisher=\{publisher\}/);
  });

  it("the form sends the organization on create only, and the person can choose themself", () => {
    const src = read(SECTION);
    expect(src).toMatch(
      /organizationId:\s*mode\.kind === "create" && publisher && draft\.asOrganization \? publisher\.id : null/,
    );
    expect(src).toMatch(/data-testid="listing-form-publisher"/);
    expect(src).toMatch(/value="self"/);
    expect(src).toMatch(/\{mode\.kind === "create" && publisher && \(/);
  });

  it("the server write still goes through the organization-checked RPC", () => {
    const src = read("lib/marketplace/listings.ts");
    expect(src).toMatch(/p_organization_id: input\.organizationId \?\? null/);
    expect(src).toMatch(/rpc\("create_marketplace_listing_v2"/);
  });

  it("every active locale names the publisher choice", () => {
    for (const l of activeLocales) {
      const m = JSON.parse(read(`messages/${l}.json`)).marketplaceListings;
      for (const k of ["formPublisherLabel", "publisherSelf", "publishedAs", "publishedAsOrganization"]) {
        expect(m[k], `${l}.marketplaceListings.${k}`).toBeTruthy();
      }
      expect(m.publishedAs).toContain("{name}");
    }
  });
});

describe("marketplace contact redirects never carry a raw form locale", () => {
  for (const file of ["lib/marketplace/listings.ts", "lib/marketplace/service-request-conversation.ts"]) {
    it(file, () => {
      const src = read(file);
      expect(src).not.toMatch(/const locale = String\(formData\.get\("locale"\)/);
      expect(src).toMatch(/const locale = toActiveLocale\(/);
    });
  }

  it("the clamp turns a hostile value into the default locale", () => {
    expect(toActiveLocale("/evil.com")).toBe("lt");
    expect(toActiveLocale("de")).toBe("de");
  });
});
