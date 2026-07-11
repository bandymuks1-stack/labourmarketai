import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Compliance / explanation pack guard (CR train WAGON 2, audit areas 1–4).
 *
 * Pins the whole pack so it cannot silently regress:
 *   1. Every pack page exists on disk (route-resolves under app/[locale]).
 *   2. The public sitemap lists the new public routes.
 *   3. Footer + account links reach the pack (findability chain).
 *   4. Pending-legal-wording markers stay VISIBLE wherever the binding text
 *      is still owner/lawyer-gated (train stop-rule 5) — and terms stays the
 *      honest "being prepared" stub.
 *   5. The informational-only / not-legal-advice disclaimer is rendered on
 *      every legal explanation page.
 *   6. NO fake finalization wording can enter the legal/about copy (lt/en/ru):
 *      no lawyer-approved, no "fully compliant", no guarantees.
 *   7. i18n parity of the pack copy across the active locales (structure is
 *      also covered by i18n-lt-en-parity; this pins the pack keys directly).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const MKT = "app/[locale]/(marketing)";
const LOCALES = ["lt", "en", "ru"] as const;

/** Pack pages: route dir (relative to the marketing tree) → required marks. */
const PACK_PAGES: ReadonlyArray<{
  rel: string;
  testId: string;
  pendingNotice: boolean;
  disclaimer: boolean;
}> = [
  { rel: "about/page.tsx", testId: "about-page", pendingNotice: false, disclaimer: false },
  { rel: "legal/privacy/page.tsx", testId: "legal-privacy", pendingNotice: true, disclaimer: true },
  { rel: "legal/data-protection/page.tsx", testId: "legal-data-protection", pendingNotice: true, disclaimer: true },
  { rel: "legal/data-access/page.tsx", testId: "legal-data-access", pendingNotice: true, disclaimer: true },
  { rel: "legal/cookies/page.tsx", testId: "legal-cookies", pendingNotice: true, disclaimer: true },
];

describe("1 · every pack page exists and is marked", () => {
  for (const page of PACK_PAGES) {
    it(`${page.rel} exists with data-testid="${page.testId}"`, () => {
      const abs = join(ROOT, MKT, page.rel);
      expect(existsSync(abs), `${page.rel} missing`).toBe(true);
      expect(read(`${MKT}/${page.rel}`)).toMatch(
        new RegExp(`data-testid="${page.testId}"`),
      );
    });
  }
  it("terms + marketplace-rules still exist (consistency pass, no deletion)", () => {
    expect(existsSync(join(ROOT, MKT, "legal/terms/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, MKT, "legal/marketplace-rules/page.tsx"))).toBe(true);
  });
});

describe("2 · sitemap lists the new public routes", () => {
  const sitemap = read("app/sitemap.ts");
  for (const path of ["/about", "/legal/data-protection", "/legal/data-access"]) {
    it(`sitemap contains "${path}"`, () => {
      expect(sitemap).toContain(`"${path}"`);
    });
  }
});

describe("3 · findability chain: footer + account link the pack", () => {
  const footer = read("components/layouts/site-footer.tsx");
  const account = read("app/[locale]/dashboard/account/page.tsx");
  for (const href of ["/about", "/legal/data-protection", "/legal/data-access"]) {
    it(`footer links ${href}`, () => {
      expect(footer).toContain(`href="${href}"`);
    });
  }
  it("account settings carry the privacy & data links section", () => {
    expect(account).toMatch(/data-testid="account-privacy-data"/);
    for (const href of ["/about", "/legal/privacy", "/legal/data-access", "/legal/data-protection"]) {
      expect(account, `account misses link to ${href}`).toContain(`href="${href}"`);
    }
  });
});

describe("4 · pending-legal-wording markers stay visible where owner/lawyer-gated", () => {
  for (const page of PACK_PAGES.filter((p) => p.pendingNotice)) {
    it(`${page.rel} renders PendingLegalNotice`, () => {
      expect(read(`${MKT}/${page.rel}`)).toMatch(/PendingLegalNotice/);
    });
  }
  it("privacy + data-protection list their exact pending items", () => {
    expect(read(`${MKT}/legal/privacy/page.tsx`)).toMatch(/PendingLegalItems/);
    expect(read(`${MKT}/legal/data-protection/page.tsx`)).toMatch(/PendingLegalItems/);
  });
  it("marketplace-rules carries the review note; terms stays the preparing stub", () => {
    expect(read(`${MKT}/legal/marketplace-rules/page.tsx`)).toMatch(/reviewNote/);
    expect(read(`${MKT}/legal/terms/page.tsx`)).toMatch(/preparing\.body/);
  });
});

describe("5 · informational-only disclaimer is rendered on the legal pages", () => {
  for (const page of PACK_PAGES.filter((p) => p.disclaimer)) {
    it(`${page.rel} renders LegalDisclaimer`, () => {
      expect(read(`${MKT}/${page.rel}`)).toMatch(/LegalDisclaimer/);
    });
  }
  it("marketplace-rules renders LegalDisclaimer too (consistency pass)", () => {
    expect(read(`${MKT}/legal/marketplace-rules/page.tsx`)).toMatch(/LegalDisclaimer/);
  });
});

// ---------------------------------------------------------------------------
// 6 · no fake finalization wording in the pack copy (lt/en/ru).
// ---------------------------------------------------------------------------
const FAKE_FINAL: Array<{ re: RegExp; why: string }> = [
  { re: /lawyer[-\s]?approved/i, why: "claims lawyer approval (owner/legal gate is open)" },
  { re: /attorney[-\s]?approved/i, why: "claims attorney approval" },
  { re: /fully\s+compliant/i, why: "absolute compliance claim" },
  { re: /gdpr[-\s]?compliant/i, why: "absolute GDPR-compliance claim" },
  { re: /\bguarantee[ds]?\b/i, why: "guarantee claim in legal copy" },
  { re: /teisinink\w*\s+patvirtint/i, why: "LT: claims lawyer approval" },
  { re: /garantuo\w*/i, why: "LT: guarantee claim" },
  { re: /visiškai\s+atitinka/i, why: "LT: absolute compliance claim" },
  { re: /одобрено\s+юрист/i, why: "RU: claims lawyer approval" },
  { re: /юрист\w*\s+(утвержд|одобр)/i, why: "RU: claims lawyer approval" },
  { re: /гарантир\w*/i, why: "RU: guarantee claim" },
  { re: /полностью\s+соответств/i, why: "RU: absolute compliance claim" },
];

function stringValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => stringValues(v, out));
  else if (node && typeof node === "object")
    for (const v of Object.values(node as Record<string, unknown>)) stringValues(v, out);
  return out;
}

describe("6 · no fake finalization tokens in legal/about copy (lt/en/ru)", () => {
  for (const loc of LOCALES) {
    const json = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
    const values = [...stringValues(json.legal), ...stringValues(json.about)];
    for (const { re, why } of FAKE_FINAL) {
      it(`${loc}: ${why} (${re})`, () => {
        const hits = values.filter((v) => re.test(v));
        expect(hits, hits.join(" | ")).toEqual([]);
      });
    }
  }
});

describe("7 · pack i18n keys exist and are non-empty in every active locale", () => {
  for (const loc of LOCALES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = JSON.parse(read(`messages/${loc}.json`)) as any;
    it(`${loc}: legal pack keys present`, () => {
      const legal = json.legal;
      expect(legal.pendingLegal.badge.length).toBeGreaterThan(0);
      expect(legal.pendingLegal.body.length).toBeGreaterThan(0);
      expect(legal.disclaimer.length).toBeGreaterThan(0);
      expect(legal.requestContact.length).toBeGreaterThan(0);
      expect(Array.isArray(legal.privacy.sections) && legal.privacy.sections.length >= 5).toBe(true);
      // Floor lowered 3 -> 2 (2026-07-11 legal-entity truth): the data-controller
      // identity item was RESOLVED (UAB „Nonstop Group“ named in the policy),
      // so it honestly left the pending list. Retention + binding version remain.
      expect(Array.isArray(legal.privacy.pendingItems) && legal.privacy.pendingItems.length >= 2).toBe(true);
      expect(Array.isArray(legal.dataProtection.sections) && legal.dataProtection.sections.length >= 5).toBe(true);
      expect(Array.isArray(legal.dataAccess.sections) && legal.dataAccess.sections.length >= 4).toBe(true);
      expect(Array.isArray(legal.cookies.items) && legal.cookies.items.length >= 3).toBe(true);
      expect(legal.cookies.noTracking.length).toBeGreaterThan(0);
      expect(legal.marketplaceRules.reviewNote.length).toBeGreaterThan(0);
    });
    it(`${loc}: about namespace present with the three loops`, () => {
      const about = json.about;
      expect(about.title.length).toBeGreaterThan(0);
      expect(Array.isArray(about.loops) && about.loops.length === 3).toBe(true);
      expect(Array.isArray(about.notYet.points) && about.notYet.points.length >= 3).toBe(true);
    });
  }
});
