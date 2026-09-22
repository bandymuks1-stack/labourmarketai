import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRE_PAYMENT_PLANS,
  PROVISIONAL_FREE_INCLUDED_TRANSLATIONS,
  PROVISIONAL_SUBSCRIPTION_INCLUDED_TRANSLATIONS,
} from "@/lib/billing/plans";
import { limitFor } from "@/lib/billing/entitlements";
import { translationEventId } from "./vacancy-translation-entitlement";
import { storedVacancyTitles } from "./vacancy-translation-read";
import type { StoredPublicVacancyV1 } from "./vacancy-read";

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/**
 * OWNER DECISION 2026-09-22 — VACANCY TRANSLATION POLICY.
 *
 * These pin the REVERSAL, because the previous behaviour passed its own
 * tests: the board translated automatically and every test agreed with it.
 * What follows asserts the rules the owner replaced it with, at the places
 * where breaking them would be invisible.
 */

function vacancy(over: Partial<StoredPublicVacancyV1> = {}): StoredPublicVacancyV1 {
  return {
    storeId: "s1",
    contentHash: "h1",
    sourceLanguage: "sv",
    titleRaw: "Svetsare sökes",
    descriptionRaw: "Vi söker 3 svetsare.",
    translations: {},
    ...(over as object),
  } as StoredPublicVacancyV1;
}

describe("the board never translates — it only reads what exists", () => {
  /**
   * THE CENTRAL REVERSAL. `storedVacancyTitles` is SYNCHRONOUS on purpose:
   * a function that cannot await cannot call a provider. If someone ever
   * reintroduces automatic translation on the board path, they must first
   * make this async, and this test is what asks them why.
   */
  it("the board's language path is synchronous, so it cannot reach a vendor", () => {
    const out = storedVacancyTitles([vacancy()], "lt");
    expect(out instanceof Map).toBe(true);
    expect((storedVacancyTitles as unknown as { constructor: { name: string } }).constructor.name).toBe(
      "Function",
    );
  });

  it("an ad with no stored rendering stays in the publisher's language", () => {
    expect(storedVacancyTitles([vacancy()], "lt").size).toBe(0);
  });

  it("a stored rendering is reused for free, including for a signed-out reader", () => {
    const v = vacancy({
      translations: {
        lt: {
          status: "available",
          title: "Ieškomas suvirintojas",
          description: null,
          sourceLanguage: "sv",
          sourceHash: "h1",
          provider: "p",
          model: "m",
          generatedAt: "2026-09-22T00:00:00.000Z",
        },
      },
    });
    // No viewer id is passed at all — there is nobody to charge, and that is
    // the point: a rendering already paid for benefits everyone.
    expect(storedVacancyTitles([v], "lt").get("s1")?.title).toBe("Ieškomas suvirintojas");
  });

  it("a rendering made from older publisher text is stale, never shown as current", () => {
    const v = vacancy({
      contentHash: "h2",
      translations: {
        lt: {
          status: "available",
          title: "Ieškomas suvirintojas",
          description: null,
          sourceLanguage: "sv",
          sourceHash: "h1", // the publisher has since edited the ad
          provider: "p",
          model: "m",
          generatedAt: "2026-09-22T00:00:00.000Z",
        },
      },
    });
    expect(storedVacancyTitles([v], "lt").size).toBe(0);
  });

  it("the automatic batched-title path is gone, not merely unused", () => {
    const src = read("lib/vacancy-store/vacancy-translation-read.ts");
    expect(src).not.toContain("resolveVacancyTitles");
    // The board module must not be able to reach the metered path either.
    const board = read("lib/opportunities/external-vacancies.ts");
    expect(board).not.toContain("translateVacancyOnDemand");
    expect(board).toContain("storedVacancyTitles");
  });
});

describe("the allowance is charged for a usable result and nothing else", () => {
  /**
   * RULE 2, enforced by the primary key rather than by a query. The same
   * person asking for the same unchanged ad in the same language produces
   * the SAME ledger id, so the second request collides instead of charging.
   */
  it("the same person, ad, locale and source text produce one identity", () => {
    const a = translationEventId("p1", "s1", "lt", "h1");
    const b = translationEventId("p1", "s1", "lt", "h1");
    expect(a).toBe(b);
  });

  it("a publisher edit is a genuinely new rendering and a genuinely new charge", () => {
    expect(translationEventId("p1", "s1", "lt", "h1")).not.toBe(
      translationEventId("p1", "s1", "lt", "h2"),
    );
  });

  it("different people, ads and target languages never share an identity", () => {
    const base = translationEventId("p1", "s1", "lt", "h1");
    expect(translationEventId("p2", "s1", "lt", "h1")).not.toBe(base);
    expect(translationEventId("p1", "s2", "lt", "h1")).not.toBe(base);
    expect(translationEventId("p1", "s1", "ru", "h1")).not.toBe(base);
  });

  it("the ledger id stays inside the column's bound", () => {
    const long = translationEventId("p".repeat(60), "s".repeat(60), "lt", "h".repeat(60));
    expect(long.length).toBeLessThanOrEqual(128);
  });

  /**
   * RULE 1. The consumption write must sit AFTER the acceptance check, so a
   * rendering refused by the digit/redaction checks cannot spend allowance.
   * Asserted on source order because the alternative — a vendor double and a
   * database double — would pin the mock, not the rule.
   */
  it("consumption is recorded only after the rendering is accepted", () => {
    const src = read("lib/vacancy-store/vacancy-translation-read.ts");
    const refusal = src.indexOf('if (!accepted) return { kind: "unavailable", reason: "refused"');
    const charge = src.indexOf("await recordTranslationConsumed(");
    expect(refusal).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(refusal);
  });

  it("the entitlement is checked before any text is sent anywhere", () => {
    const src = read("lib/vacancy-store/vacancy-translation-read.ts");
    expect(src.indexOf("await translationAllowance()")).toBeLessThan(
      src.indexOf("await translateOne("),
    );
  });

  it("the meter is an activity fact, never money", () => {
    const src = read("lib/vacancy-store/vacancy-translation-entitlement.ts");
    expect(src).toContain('event_type: "activity"');
    // A cost figure here would make a refused run look like spend.
    expect(src).not.toContain("actualCents");
    expect(src).not.toContain("estimatedCents");
  });
});

describe("the commercial model is configurable and honest", () => {
  it("a paid plan buys a higher ceiling than the free one", () => {
    expect(PROVISIONAL_SUBSCRIPTION_INCLUDED_TRANSLATIONS).toBeGreaterThan(
      PROVISIONAL_FREE_INCLUDED_TRANSLATIONS,
    );
  });

  it("every plan states a real numeric allowance — none is silently unlimited", () => {
    for (const plan of PRE_PAYMENT_PLANS) {
      const limit = limitFor(plan, "vacancy_translations");
      expect(typeof limit, plan.slug).toBe("number");
      expect(limit, plan.slug).toBeGreaterThan(0);
    }
  });

  /**
   * "Do not invent a paid package or price." The allowance mechanism must
   * not grow a credit/top-up path while LMC spend reversal is unresolved.
   */
  it("no credit or top-up path is wired into translation", () => {
    const src =
      read("lib/vacancy-store/vacancy-translation-entitlement.ts") +
      read("lib/vacancy-store/vacancy-translation-read.ts") +
      read("components/app/vacancy-translate-control.tsx");
    expect(src).not.toMatch(/spendLmc|creditTranslations|topUp|purchaseTranslations/);
  });
});

describe("the egress classification the owner refused to weaken", () => {
  it("translate_vacancy stays SENSITIVE_FREE_TEXT", () => {
    const src = read("lib/ai/runtime/data-sensitivity.ts");
    expect(src).toContain('translate_vacancy: "SENSITIVE_FREE_TEXT"');
  });

  it("the translation path still redacts contact data before any call", () => {
    const src = read("lib/vacancy-store/vacancy-translation-read.ts");
    expect(src).toContain("redactContactData");
    expect(src).toContain("restoreRedactions");
    // A lost or invented token refuses the rendering rather than showing it.
    expect(src).toContain("restoredTitle?.ok === true");
  });
});
