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
 *   4. No drafting-state meta-text on the public legal pages: no "pending
 *      owner/legal review" notice, no "still waiting for final wording" list,
 *      no "being prepared" / review note, no "informational only" disclaimer
 *      (owner order 2026-10-23 — the pages are the policy, not a draft of it).
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
  legal: boolean;
}> = [
  { rel: "about/page.tsx", testId: "about-page", legal: false },
  { rel: "legal/privacy/page.tsx", testId: "legal-privacy", legal: true },
  { rel: "legal/data-protection/page.tsx", testId: "legal-data-protection", legal: true },
  { rel: "legal/data-access/page.tsx", testId: "legal-data-access", legal: true },
  { rel: "legal/cookies/page.tsx", testId: "legal-cookies", legal: true },
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

describe("4 · no drafting-state meta-text is rendered on the legal pages", () => {
  const DRAFT_MARKERS = [
    /PendingLegalNotice/,
    /PendingLegalItems/,
    /LegalDisclaimer/,
    /pendingLegal/,
    /pendingItems/,
    /pendingTitle/,
    /reviewNote/,
    /preparing\.body/,
  ];
  const LEGAL_PAGES = [
    ...PACK_PAGES.filter((p) => p.legal).map((p) => p.rel),
    "legal/terms/page.tsx",
    "legal/marketplace-rules/page.tsx",
    "legal/data-deletion/page.tsx",
    "legal/legal-notice/page.tsx",
  ];
  for (const rel of LEGAL_PAGES) {
    it(`${rel} renders no pending / draft / disclaimer block`, () => {
      const src = read(`${MKT}/${rel}`);
      for (const re of DRAFT_MARKERS) expect(src, `${rel} ${re}`).not.toMatch(re);
    });
  }
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
      expect(legal.requestContact.length).toBeGreaterThan(0);
      expect(Array.isArray(legal.privacy.sections) && legal.privacy.sections.length >= 5).toBe(true);
      expect(Array.isArray(legal.dataProtection.sections) && legal.dataProtection.sections.length >= 5).toBe(true);
      expect(Array.isArray(legal.dataAccess.sections) && legal.dataAccess.sections.length >= 4).toBe(true);
      expect(Array.isArray(legal.cookies.items) && legal.cookies.items.length >= 3).toBe(true);
      expect(legal.cookies.noTracking.length).toBeGreaterThan(0);
    });
    it(`${loc}: about namespace present with the three loops`, () => {
      const about = json.about;
      expect(about.title.length).toBeGreaterThan(0);
      expect(Array.isArray(about.loops) && about.loops.length === 3).toBe(true);
      expect(Array.isArray(about.notYet.points) && about.notYet.points.length >= 3).toBe(true);
    });
  }
});
