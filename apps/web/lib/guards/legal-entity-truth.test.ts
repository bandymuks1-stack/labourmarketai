import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Legal-entity truth guard (legal-entity-ip-license-truth v1).
 *
 * Pins the mandatory corporate structure so it cannot silently regress
 * (docs/legal/corporate-identity-source-of-truth-v1.md):
 * - Labour Market AI Sp. z o.o. = IP OWNER/LICENSOR only — never seller,
 *   operator, contracting party or data controller;
 * - UAB „Nonstop Group“ = operator/seller/contracting party + PRIMARY DATA
 *   CONTROLLER — never the IP owner;
 * - "LabourMarket.ai" is a brand, never a legal entity; the © line names
 *   the IP owner, not the bare brand;
 * - DPO is NOT appointed; privacy contact is a mailbox;
 * - only OFFICIALLY VERIFIED registry numbers may appear (KRS 0001218752,
 *   REGON 543779454, NIP 7011295735, company code 302676973);
 * - no bank account (IBAN/NRB) may ever appear in app code or catalogs;
 * - the licence fee is never described as a dividend in app text.
 */

const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

// 2026-09-20: PL is an active UI locale; the Polish catalog reached full parity in the same PR, so pl is covered here like the other five.
const LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;
const catalogs = Object.fromEntries(
  LOCALES.map((l) => [l, read(`messages/${l}.json`)]),
) as Record<(typeof LOCALES)[number], string>;

const entityModule = read("lib/legal/entity-identity.ts");
const footer = read("components/layouts/site-footer.tsx");
const dashboardShell = read("app/[locale]/dashboard/layout.tsx");
const legalNotice = read("app/[locale]/(marketing)/legal/legal-notice/page.tsx");
const terms = read("app/[locale]/(marketing)/legal/terms/page.tsx");

describe("canonical entity module (single source of truth)", () => {
  it("pins the officially verified identifiers", () => {
    expect(entityModule).toContain('krs: "0001218752"');
    expect(entityModule).toContain('nip: "7011295735"');
    expect(entityModule).toContain('regon: "543779454"');
    expect(entityModule).toContain('euVat: "PL7011295735"');
    expect(entityModule).toContain('companyCode: "302676973"');
    expect(entityModule).toContain('vatCode: "LT100010790613"');
  });

  it("roles are fixed: PL = IP owner/licensor, LT = operator/seller/controller", () => {
    expect(entityModule).toContain('role: "IP owner and licensor"');
    expect(entityModule).toMatch(
      /role:\s*"platform operator, commercial seller, customer contracting party, primary data controller, IP licensee"/,
    );
    expect(entityModule).toContain("DPO_APPOINTED = false");
  });
});

describe("footer discloses operator + IP owner and owns the © correctly", () => {
  it("renders the entity disclosure and the IP-owner copyright", () => {
    expect(footer).toContain('t("operatedBy")');
    expect(footer).toContain("copyrightLine(new Date().getFullYear())");
    expect(footer).not.toMatch(/©\s*\{new Date\(\)\.getFullYear\(\)\}\s*LabourMarket\.ai/);
    expect(footer).toContain('href="/legal/legal-notice"');
  });

  it.each(LOCALES)("%s footer.operatedBy names both entities in their exact roles", (l) => {
    const f = JSON.parse(catalogs[l]).footer;
    expect(f.operatedBy).toContain("Nonstop Group");
    expect(f.operatedBy).toContain("Labour Market AI Sp. z o.o.");
    expect(f.ipNotice).toContain("Nonstop Group");
  });

  // Rexora — owner-approved attribution link (2026-07-14). The credit must be a
  // real external link to the approved URL (never plain text, never a
  // fabricated URL) in BOTH shells: public footer + dashboard. That security
  // requirement is unchanged below.
  //
  // WHAT CHANGED ON 2026-09-27 (owner decision, §10): the credit read "Sukurta
  // Rexora" / "Created by Rexora", which stated the relationship wrongly.
  // Rexora is the technology and automation collaborator and a co-advertised
  // brand; Nonstop Group is the labour-market / hiring operating partner; the
  // product is LabourMarket.ai. The line now names all three.
  //
  // Rexora STAYS — removing it was never on the table (owner requirement). What
  // the assertions gain is that only Rexora's NAME is the link: the approved URL
  // is Rexora's, so wrapping the whole sentence in the anchor would have pointed
  // the other two partners' names at Rexora's site. Hence `t.rich` + a
  // `<rexora>` tag in the message instead of `{t("rexora")}` inside an `<a>`.
  const ALL_THREE = /Nonstop Group/;
  it("footer credits all three collaborators, with Rexora as a safe external link", () => {
    expect(footer).toContain('href="https://aiprocessautomation.eu"');
    expect(footer).toContain('rel="noopener noreferrer"');
    expect(footer).toContain('t.rich("rexora"');
  });

  it("dashboard shell credits them the same way, with the same safe link", () => {
    expect(dashboardShell).toContain('href="https://aiprocessautomation.eu"');
    expect(dashboardShell).toContain('rel="noopener noreferrer"');
    expect(dashboardShell).toContain('rich("rexora"');
  });

  it("every locale names the three collaborators and links only Rexora", () => {
    // The relationship is carried by the COPY, so it is pinned in the copy —
    // in every locale, not only the one that gets read during review.
    const localeFiles = readdirSync(join(web, "messages")).filter((f) =>
      f.endsWith(".json"),
    );
    expect(localeFiles.length).toBeGreaterThanOrEqual(11);
    for (const file of localeFiles) {
      const messages = JSON.parse(read(`messages/${file}`)) as {
        footer?: { rexora?: string };
      };
      const credit = messages.footer?.rexora;
      expect(credit, `${file} footer.rexora`).toBeTruthy();
      // All three named, Rexora the only linked one.
      expect(credit, `${file} must name Nonstop Group`).toMatch(ALL_THREE);
      expect(credit, `${file} must name LabourMarket.ai`).toContain(
        "LabourMarket.ai",
      );
      expect(credit, `${file} must link Rexora`).toContain(
        "<rexora>Rexora</rexora>",
      );
      // NO BANNED-PREFIX LIST HERE, on purpose. A first attempt blacklisted the
      // old wordings ("Created by", "Sukurta", "Loodud", …) and immediately
      // produced a false positive: Estonian "Loodud koostöös" means "created IN
      // COLLABORATION", which is exactly right. The three assertions above
      // already make sole authorship impossible — a line that names
      // LabourMarket.ai and Nonstop Group is not crediting Rexora alone — so a
      // per-language verb list would only forbid correct translations.
    }
  });
});

describe("legal notice = canonical imprint", () => {
  it("renders both entities from the verified module, no hardcoded registry numbers", () => {
    expect(legalNotice).toContain("IP_OWNER");
    expect(legalNotice).toContain("PLATFORM_OPERATOR");
    // Registry numbers must come from the module, never inline literals:
    expect(legalNotice).not.toMatch(/0001218752|543779454|302676973/);
    expect(legalNotice).toContain('t("dpoLine")');
  });

  it.each(LOCALES)("%s legalNotice i18n present with DPO-not-appointed line", (l) => {
    const ln = JSON.parse(catalogs[l]).legal.legalNotice;
    expect(typeof ln.title).toBe("string");
    expect(ln.dpoLine).toContain("info@labourmarket.ai");
  });
});

describe("terms: contracting party and governing law", () => {
  it.each(LOCALES)("%s terms sections carry UAB as contracting party + Lithuanian law + no employment guarantee", (l) => {
    const secs = JSON.parse(catalogs[l]).legal.terms.sections;
    const all = JSON.stringify(secs);
    expect(all).toContain("Nonstop Group");
    expect(all).toContain("302676973");
    expect(all).toContain("Labour Market AI Sp. z o.o.");
    // Lithuanian law named in every locale's own language:
    expect(all).toMatch(/Lithuania|Lietuvos|Литов|Litouwen|Litauen|Litw|litewsk/);
  });

  it("the terms page renders the structured sections", () => {
    expect(terms).toContain("terms.sections");
  });
});

describe("privacy policy controller identity", () => {
  it.each(LOCALES)("%s privacy names UAB Nonstop Group as controller, DPO not appointed, PL company excluded", (l) => {
    const priv = JSON.parse(catalogs[l]).legal.privacy;
    const first = JSON.stringify(priv.sections[0]);
    expect(first).toContain("Nonstop Group");
    expect(first).toContain("302676973");
    expect(first).toContain("info@labourmarket.ai");
    expect(first).toContain("Labour Market AI Sp. z o.o.");
    // Controller identity must NOT be in pendingItems anymore:
    expect(JSON.stringify(priv.pendingItems).toLowerCase()).not.toContain("controller");
    expect(JSON.stringify(priv.pendingItems)).not.toContain("valdytoj");
  });
});

describe("forbidden regressions", () => {
  it("the Polish company is NEVER the seller/operator/contracting party in any catalog", () => {
    for (const l of LOCALES) {
      const c = JSON.parse(catalogs[l]);
      const s = JSON.stringify(c);
      // Every mention of the PL company must not co-occur with seller/operator
      // phrasing in the same string value.
      const values: string[] = [];
      (function walk(n: unknown) {
        if (typeof n === "string") values.push(n);
        else if (n && typeof n === "object") Object.values(n).forEach(walk);
      })(c);
      for (const v of values) {
        if (!v.includes("Sp. z o.o")) continue;
        expect(
          /operated .{0,40}by Labour Market AI Sp|sold by Labour Market AI Sp|parduoda Labour Market AI Sp|valdo Labour Market AI Sp\. z o\.o/i.test(v),
          `${l}: PL company described as operator/seller: ${v.slice(0, 120)}`,
        ).toBe(false);
      }
      expect(s).toBeTruthy();
    }
  });

  it("UAB is never called the IP owner; brand is never a legal entity", () => {
    for (const l of LOCALES) {
      const values: string[] = [];
      (function walk(n: unknown) {
        if (typeof n === "string") values.push(n);
        else if (n && typeof n === "object") Object.values(n).forEach(walk);
      })(JSON.parse(catalogs[l]));
      for (const v of values) {
        expect(
          /intellectual property .{0,60}owned by UAB|intelektinė nuosavybė priklauso UAB/i.test(v),
          `${l}: UAB described as IP owner: ${v.slice(0, 120)}`,
        ).toBe(false);
      }
    }
  });

  it("no DPO is claimed as appointed anywhere", () => {
    const NEGATIONS: Record<(typeof LOCALES)[number], RegExp> = {
      lt: /nepaskirtas/,
      en: /not appointed/i,
      ru: /не назначен/,
      nl: /geen functionaris/i,
      de: /nicht bestellt/i,
      pl: /nie został wyznaczony/i,
    };
    for (const l of LOCALES) {
      const ln = JSON.parse(catalogs[l]).legal.legalNotice;
      // The imprint's DPO line must carry the locale's negation…
      expect(ln.dpoLine, `${l} dpoLine`).toMatch(NEGATIONS[l]);
      // …and no string anywhere claims an appointment positively.
      expect(catalogs[l]).not.toMatch(/DPO (is |was )?appointed/);
      expect(catalogs[l]).not.toMatch(/DPO paskirtas/);
    }
  });

  it("no bank account (IBAN/NRB) anywhere in app source or catalogs", () => {
    const targets = [entityModule, footer, legalNotice, terms, ...Object.values(catalogs)];
    for (const src of targets) {
      expect(src).not.toMatch(/\bLT\d{18}\b/);
      expect(src).not.toMatch(/\bPL\d{26}\b/);
      expect(src).not.toMatch(/\b\d{26}\b/);
    }
  });

  it("no unverified registry number: any KRS/REGON in catalogs equals the verified values", () => {
    for (const l of LOCALES) {
      const krsMatches = catalogs[l].match(/KRS\s*:?\s*(\d{10})/g) ?? [];
      for (const m of krsMatches) expect(m).toContain("0001218752");
      const regonMatches = catalogs[l].match(/REGON\s*:?\s*(\d{9,14})/g) ?? [];
      for (const m of regonMatches) expect(m).toContain("543779454");
    }
  });

  it("the licence fee is never described as a dividend in app text", () => {
    for (const l of LOCALES) {
      const s = catalogs[l].toLowerCase();
      expect(s).not.toMatch(/licen[cs][^.]{0,60}dividend|dividend[^.]{0,60}licen[cs]/);
    }
  });
});
