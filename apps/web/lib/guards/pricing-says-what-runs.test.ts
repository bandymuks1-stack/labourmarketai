import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PRICING PAGE MAY NOT DENY A CAPABILITY THE PRODUCT HAS.
 *
 * Owner readiness window, 2026-09-09, Priority 1. Two blocks on the same
 * public page said opposite things to a buyer:
 *
 *   `pricing.plans.free.features` → "Matching shortlist and candidate contact"
 *   `conciergeOffer.note`         → "There is no automatic job board and no
 *                                    automatic matching here yet"
 *
 * AUDITED BEFORE ANY COPY MOVED, and the denial was the false half:
 *
 *   · `/jobs` is a live public board — 48,265 vacancies, read on production
 *     2026-09-09, with honest provenance and a sign-in gate on the employer,
 *     location and apply route.
 *   · `/match-preview` is live, PUBLIC and needs no account: it computes fit
 *     from a worker's facts and a company need and explains the result.
 *   · "Need → matching → ranked shortlist" is `PROVEN` in
 *     `docs/CAPABILITY_INVENTORY.md` (browser, 2026-08-27) — a real demand
 *     ranked real candidates with an evidence-tier basis and disclosed the
 *     facts it could not read.
 *
 * So the Free-plan feature was TRUE and was not weakened. The note was
 * corrected, and it is the only thing that changed.
 *
 * WHAT THE NOTE MUST NOW DO — the five questions §Priority 1 asks a company
 * to be able to answer: what is free, what matching exists today, what is
 * automatic, what needs a human, and what is not yet available. Each is
 * pinned below as a PROPERTY of the sentence, not as a literal string, so the
 * copy can be rewritten without silently losing one of the five.
 *
 * NOT A BILLING CHANGE. No price, no plan, no entitlement, no payment
 * provider and no Stripe semantics are touched — this is the truth
 * correction §Priority 1 scoped it to.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

/** The locales that actually carry the namespace (checked, not assumed). */
const LOCALES = ["en", "lt", "ru", "nl", "de"] as const;

type Catalog = {
  conciergeOffer?: { note?: string };
  pricing?: { plans?: { free?: { features?: string[] } } };
};

const catalog = (loc: string): Catalog =>
  JSON.parse(read("messages", `${loc}.json`)) as Catalog;

describe("1. the note no longer denies matching or the board", () => {
  it.each(LOCALES)("%s: the flat denial is gone", (loc) => {
    const note = catalog(loc).conciergeOffer?.note ?? "";
    expect(note.length).toBeGreaterThan(120);
    // The exact false claims, in every language that carried them.
    for (const re of [
      /no automatic job board/i,
      /no automatic matching/i,
      /nėra automatinės/i,
      /нет автоматического/i,
      /geen automatische match/i,
      /keine automatische Vermittlung/i,
    ]) {
      expect(note, `${loc}: "${note.slice(0, 60)}…"`).not.toMatch(re);
    }
  });

  /** NEGATIVE CONTROL — the capability claim was NOT weakened to make the
   *  page agree with itself. That would have been the lazy fix: delete the
   *  Free-plan feature and the contradiction disappears, along with a true
   *  statement about the product. */
  it.each(LOCALES)("%s: the Free plan still promises matching", (loc) => {
    const features = catalog(loc).pricing?.plans?.free?.features ?? [];
    expect(features.length).toBeGreaterThan(0);
    const joined = features.join(" ").toLowerCase();
    // Each language names the capability with its own word, and they are not
    // translations of one another: Lithuanian says "atrankos sąrašas"
    // (a selection/shortlist), not "atitikimas" (a match). Asserting only the
    // English stem would have failed on true copy — it did, on the first run.
    expect(
      /match|atitik|atrank|подбор|соответств|отбор|vermittl|kandidat/.test(joined),
      `${loc}: the Free plan stopped naming matching — features: ${joined}`,
    ).toBe(true);
  });
});

describe("2. the note answers the five questions a buyer has", () => {
  /**
   * Each question is asserted by the CONCEPT it must mention, per locale,
   * rather than by a sentence. A rewrite that drops one of the five fails.
   */
  const MUST_MENTION: Readonly<
    Record<(typeof LOCALES)[number], Readonly<Record<string, RegExp>>>
  > = {
    en: {
      "what is automatic": /automatic/i,
      "the public board": /job board|public/i,
      "matching that exists": /match|shortlist/i,
      "what needs a human": /operator|by hand|human/i,
      "what is not built": /not built|not yet/i,
      "what is free": /no cost|free/i,
    },
    lt: {
      "what is automatic": /automatiš/i,
      "the public board": /skelbimai|vieš/i,
      "matching that exists": /atitik|kandidat/i,
      "what needs a human": /operatorius|rankomis/i,
      "what is not built": /nėra sukurtas|dar nėra/i,
      "what is free": /be mokesčio/i,
    },
    ru: {
      "what is automatic": /автоматическ/i,
      "the public board": /вакансий|публичн/i,
      "matching that exists": /соответств|кандидат/i,
      "what needs a human": /оператор|вручную/i,
      "what is not built": /не реализовано|пока не/i,
      "what is free": /бесплатно/i,
    },
    nl: {
      "what is automatic": /automatisch/i,
      "the public board": /vacature|openbaar/i,
      "matching that exists": /match|kandidaten/i,
      "what needs a human": /medewerker|met de hand/i,
      "what is not built": /niet gebouwd|nog niet/i,
      "what is free": /kosteloos|gratis/i,
    },
    de: {
      "what is automatic": /automatisch/i,
      "the public board": /Stellen|öffentlich/i,
      "matching that exists": /Match|Kandidaten/i,
      "what needs a human": /Mitarbeiter|von Hand/i,
      "what is not built": /nicht gebaut|noch nicht/i,
      "what is free": /kostenfrei|kostenlos/i,
    },
  };

  for (const loc of LOCALES) {
    for (const [question, re] of Object.entries(MUST_MENTION[loc])) {
      it(`${loc} answers: ${question}`, () => {
        const note = catalog(loc).conciergeOffer?.note ?? "";
        expect(re.test(note), `${loc} · ${question} · "${note}"`).toBe(true);
      });
    }
  }
});

describe("3. it stays a copy correction, not a billing change", () => {
  it("the note names no price, no plan slug and no payment provider", () => {
    for (const loc of LOCALES) {
      const note = catalog(loc).conciergeOffer?.note ?? "";
      // A figure here would duplicate the ONE place a price may live
      // (`plans.price_eur_monthly`), and the namespace guard already bans
      // the provider name across the whole concierge block.
      expect(/€|\bEUR\b|\d+\s*\/\s*(month|mėn|мес)/i.test(note), loc).toBe(false);
      expect(/stripe|price_|PAYMENTS_ENABLED/i.test(note), loc).toBe(false);
    }
  });

  it("the concierge STEPS are untouched — the human service is described as it was", () => {
    // The four steps describe the paid placement service accurately; only the
    // note was false. If a future change starts editing the steps to resolve
    // a copy conflict, that is a service-description change and needs its own
    // reasoning, not this guard's silence.
    const en = JSON.parse(read("messages", "en.json")) as {
      conciergeOffer?: { steps?: { title: string; body: string }[] };
    };
    const steps = en.conciergeOffer?.steps ?? [];
    expect(steps).toHaveLength(4);
    expect(steps[1].body).toMatch(/operator/i);
    expect(steps[2].body).toMatch(/by a person|manually/i);
    expect(steps[3].body).toMatch(/success fee/i);
  });
});
