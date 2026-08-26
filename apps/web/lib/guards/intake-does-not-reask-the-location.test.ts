import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { activeLocales } from "@/lib/i18n/config";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import { COUNTRY_RULES } from "@/lib/structuring/structure-need";

/**
 * DO NOT ASK FOR WHAT THE SENTENCE ALREADY SAID.
 *
 * The structurer reads the country out of "…Nyderlanduose" (#1288 made that
 * true in Lithuanian). The intake form then asked for the location anyway,
 * because `demandPrefill` filled description, role, headcount and urgency —
 * and simply had no way to turn `NL` into a word.
 *
 * The ISO code must never be what lands in the field. It is an internal value
 * in a box the person is about to read and edit (§23), so the NAME is resolved
 * server-side from `labourMarket.countryNames` — the same node the company
 * page already uses, not a second source.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("the prefill carries the location", () => {
  const CHAT = read(
    "components", "app", "conversation", "chat", "conversation-chat.tsx",
  );

  it("fills the location field from the recognised country", () => {
    const fn = CHAT.slice(
      CHAT.indexOf("const demandPrefill"),
      CHAT.indexOf("lastValueRef"),
    );
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).toMatch(/out\.location = countryLabel/);
  });

  it("puts the NAME in the field, never the ISO code", () => {
    const fn = CHAT.slice(
      CHAT.indexOf("const demandPrefill"),
      CHAT.indexOf("lastValueRef"),
    );
    // Through the label map — assigning `v.country` directly would drop "NL"
    // into a box the person reads.
    expect(fn).toMatch(/countryLabels\?\.\[v\.country\]/);
    expect(fn).not.toMatch(/out\.location = v\.country/);
  });

  it("an unknown country leaves the field empty rather than guessing", () => {
    const fn = CHAT.slice(
      CHAT.indexOf("const demandPrefill"),
      CHAT.indexOf("lastValueRef"),
    );
    expect(fn).toMatch(/if \(countryLabel\) out\.location = countryLabel;/);
  });
});

describe("every market the structurer can recognise has a name to show", () => {
  it("the rule table and the market list agree", () => {
    // If they ever diverge, some recognised country would have no name and the
    // prefill would silently go back to asking.
    expect(COUNTRY_RULES.map((r) => r.code).sort()).toEqual(
      [...MARKET_COUNTRIES].sort(),
    );
  });

  it.each([...activeLocales])("%s names every market", (loc) => {
    const messages = JSON.parse(read("messages", `${loc}.json`));
    const labourMarket = JSON.parse(
      read("messages", loc, "labour-market.json"),
    );
    const t = createTranslator({
      locale: loc,
      messages: { ...messages, labourMarket },
    });
    for (const code of MARKET_COUNTRIES) {
      const key = `labourMarket.countryNames.${code}`;
      const out = t(key as never);
      expect(out, `${loc} ${key}`).not.toContain(key);
      expect(out.trim().length, `${loc} ${code} empty`).toBeGreaterThan(0);
      // A name, not the code echoed back.
      expect(out.trim(), `${loc} ${code} is just the code`).not.toBe(code);
    }
  });
});
