import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import { INSTITUTION_DOOR_NEXT, STARTING_CONTEXTS } from "@/lib/marketing/public-doors";

/**
 * AUDIENCE PAGES STATE ONLY WHAT WORKS (owner P0 2026-11-13).
 *
 * Every audience page gives the same five plain answers — who it is for, how
 * to start, what is free, which paid services can really be ordered, what is
 * not available yet — and the two new pages (education institutions, service
 * providers) tie each "you can do this today" card to a row of the function
 * register that is LIVE_VERIFIED. When a row stops being verified, or a "not
 * available yet" row becomes verified, this fails and the copy is corrected
 * in the same change — the page can never drift from the register in silence.
 */

const WEB = join(__dirname, "..", "..");
const REGISTER = readFileSync(join(WEB, "..", "..", "docs", "program", "FUNCTION_REGISTER.md"), "utf8");

/** Catalogs that carry the audience pages: the routed locales plus Swedish,
 *  which is prepared and not yet routed (its publication is a separate
 *  localisation decision). */
const CATALOGS = [...activeLocales, "sv"] as const;

type Card = { title: string; body: string };
type AudiencePage = {
  eyebrow: string;
  title: string;
  titleAccent: string;
  subcopy: string;
  cta: string;
  benefits: Card[];
  facts: { headline: string; items: Card[] };
};

function catalog(locale: string): { pages: Record<string, AudiencePage> } {
  return JSON.parse(readFileSync(join(WEB, "messages", `${locale}.json`), "utf8"));
}

/** The register's own tables start at its first domain section. Earlier
 *  parts of the file are summaries and triage lists that repeat row ids; a
 *  stale summary must never answer for the row itself. */
const REGISTER_TABLES = REGISTER.slice(REGISTER.indexOf("\n## Identity, sign-up & organizations"));

function registerStatus(row: string): string | null {
  const m = REGISTER_TABLES.match(
    new RegExp(`^\\| ${row.replace(".", "\\.")} \\| [^|]+ \\| (\\w+) \\| [^|]* \\| [^|]* \\| [^|]* \\| [^|]* \\|$`, "m"),
  );
  return m ? m[1] : null;
}

const AUDIENCES = [
  { key: "workers", dir: "for-workers" },
  { key: "companies", dir: "for-companies" },
  { key: "agencies", dir: "for-agencies" },
  { key: "education", dir: "for-education" },
  { key: "serviceProviders", dir: "for-service-providers" },
] as const;

function pageSource(dir: string): string {
  return readFileSync(join(WEB, "app", "[locale]", "(marketing)", dir, "page.tsx"), "utf8");
}

describe("every audience page gives the five plain answers", () => {
  for (const a of AUDIENCES) {
    it(`${a.dir} renders the facts block from its own copy`, () => {
      const src = pageSource(a.dir);
      expect(src).toMatch(/<AudienceFacts\s+copy=/);
      expect(src).toContain(`getTranslations("pages.${a.key}")`);
    });

    for (const locale of CATALOGS) {
      it(`${a.key} / ${locale}: five answers, none empty`, () => {
        const facts = catalog(locale).pages[a.key]?.facts;
        expect(facts, "facts block is missing").toBeTruthy();
        expect(facts.headline.trim().length).toBeGreaterThan(0);
        expect(facts.items).toHaveLength(5);
        for (const item of facts.items) {
          expect(item.title.trim().length, "title").toBeGreaterThan(0);
          expect(item.body.trim().length, item.title).toBeGreaterThan(20);
        }
      });
    }
  }
});

describe("no price, no placeholder", () => {
  const MONEY = /(\d[\d.,]*\s*(€|eur\b|euro\b|usd\b|\$|zł|pln\b|kr\b|sek\b|руб))|((€|\$)\s*\d)/i;
  for (const a of AUDIENCES) {
    for (const locale of CATALOGS) {
      it(`${a.key} / ${locale}: the facts name no price and are translated`, () => {
        const page = catalog(locale).pages[a.key];
        const texts = page.facts.items.flatMap((i) => [i.title, i.body]);
        if (a.key === "education" || a.key === "serviceProviders") {
          texts.push(page.eyebrow, page.title, page.titleAccent, page.subcopy, page.cta);
          texts.push(...page.benefits.flatMap((b) => [b.title, b.body]));
        }
        for (const text of texts) {
          expect(text, "a price belongs to the pricing page only").not.toMatch(MONEY);
          expect(text, "untranslated placeholder").not.toMatch(/^\[EN\]/);
        }
      });
    }
  }
});

/**
 * The claim map. Index = the card's position in `pages.<key>.benefits`.
 * `works` rows must be LIVE_VERIFIED; `notYet` rows are what the page names
 * under "not available yet" and must NOT be LIVE_VERIFIED.
 */
const CLAIMS = {
  education: {
    works: [
      ["11.2"], // programmes and groups
      ["11.1", "11.2"], // learners: link, invitation, join request accepted by the institution
      ["11.7"], // practice recorded by the learner and signed off by the institution
      ["11.7"], // recognition recorded against signed-off practice, read by the learner
      ["11.5", "11.6"], // outcomes, reporting and export
    ],
    notYet: ["11.8", "11.10"],
  },
  serviceProviders: {
    works: [
      ["6.1"], // service offering
      ["6.1"], // request loop
      ["6.3"], // one discovery index
      ["6.6"], // proposals and contracts
      ["6.10"], // project-cost calculator
    ],
    notYet: ["6.13", "6.14", "6.21", "6.23"],
  },
} as const;

/**
 * The three older pages: what their facts block names under "not available
 * yet", and the one function the reworded agency copy now rests on. A row
 * that becomes verified must leave the "not available yet" answer.
 */
const OLDER_PAGES = {
  workers: { works: [] as string[], notYet: ["2.30", "5.5"] }, // voice journal, message translation
  companies: { works: [] as string[], notYet: ["5.5", "5.8"] }, // message translation, push
  agencies: { works: ["4.15"], notYet: ["4.30"] }, // agency ↔ client bridge; commissions, agency-to-agency
} as const;

describe("each 'you can do this today' card is a verified function", () => {
  for (const [key, claim] of Object.entries(CLAIMS)) {
    it(`${key}: one register mapping per card, in every catalog`, () => {
      for (const locale of CATALOGS) {
        expect(catalog(locale).pages[key].benefits, locale).toHaveLength(claim.works.length);
      }
    });

    claim.works.forEach((rows, index) => {
      for (const row of rows) {
        it(`${key} card ${index + 1} → register ${row} is LIVE_VERIFIED`, () => {
          expect(registerStatus(row)).toBe("LIVE_VERIFIED");
        });
      }
    });

    for (const row of claim.notYet) {
      it(`${key}: register ${row} is named 'not available yet' and is indeed not verified`, () => {
        const status = registerStatus(row);
        expect(status, `row ${row} not found`).not.toBeNull();
        expect(status, `row ${row} now works — move it out of 'not available yet'`).not.toBe("LIVE_VERIFIED");
      });
    }
  }
});

describe("the older pages' facts rest on the register too", () => {
  it("the register tables were found (the anchor heading still exists)", () => {
    expect(REGISTER_TABLES.length).toBeGreaterThan(1000);
    expect(REGISTER_TABLES.length).toBeLessThan(REGISTER.length);
  });

  for (const [key, claim] of Object.entries(OLDER_PAGES)) {
    for (const row of claim.works) {
      it(`${key}: register ${row} is LIVE_VERIFIED`, () => {
        expect(registerStatus(row)).toBe("LIVE_VERIFIED");
      });
    }
    for (const row of claim.notYet) {
      it(`${key}: register ${row} is named 'not available yet' and is indeed not verified`, () => {
        const status = registerStatus(row);
        expect(status, `row ${row} not found`).not.toBeNull();
        expect(status, `row ${row} now works — move it out of 'not available yet'`).not.toBe("LIVE_VERIFIED");
      });
    }
  }
});

describe("the institution door explains itself", () => {
  it("its 'learn more' is the education page, and that page exists", () => {
    const door = STARTING_CONTEXTS.find((c) => c.key === "institution");
    expect(door?.learnMore).toBe("/for-education");
    expect(pageSource("for-education")).toContain("ForEducationPage");
  });

  it("the page's call to action is the SAME destination as the door", () => {
    const door = STARTING_CONTEXTS.find((c) => c.key === "institution");
    expect(door?.href).toBe(`/auth/signup?next=${encodeURIComponent(INSTITUTION_DOOR_NEXT)}`);
    expect(pageSource("for-education")).toMatch(/ctaNext=\{INSTITUTION_DOOR_NEXT\}/);
  });

  it("the service-provider page lands on the person's own service offerings", () => {
    const src = pageSource("for-service-providers");
    expect(src).toContain('const SERVICES_AFTER_SIGNUP = "/dashboard/services";');
    expect(src).toMatch(/ctaNext=\{SERVICES_AFTER_SIGNUP\}/);
    // The destination is a real route, not a promise.
    expect(() =>
      readFileSync(join(WEB, "app", "[locale]", "dashboard", "services", "page.tsx"), "utf8"),
    ).not.toThrow();
  });

  it("no context is left without an audience page", () => {
    for (const c of STARTING_CONTEXTS) expect(c.learnMore, c.key).toBeTruthy();
  });
});
