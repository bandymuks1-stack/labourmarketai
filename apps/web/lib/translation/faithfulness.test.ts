import { describe, expect, it } from "vitest";

import { digitsPreserved, lockedTermsIn, lockedTermsPreserved, renderingIsFaithful } from "./faithfulness";
import { digitsPreserved as vacancyDigitsPreserved } from "@/lib/vacancy-store/vacancy-translation-read";

/**
 * The ONE faithfulness rule for machine renderings (vacancies and messages):
 * a number, a money unit or a contract word of the original must survive,
 * in any language's form; a missing one means the original stands.
 */
describe("one copy of the digit rule", () => {
  it("the vacancy reader re-exports the shared function, not a second copy", () => {
    expect(vacancyDigitsPreserved).toBe(digitsPreserved);
  });
});

describe("locked terms are concepts, not words", () => {
  it("a contract word rendered in another language is still the contract", () => {
    expect(lockedTermsPreserved("Pasirašome sutartį rytoj", "We sign the contract tomorrow")).toBe(true);
    expect(lockedTermsPreserved("Umowa jest gotowa", "Договор готов")).toBe(true);
    expect(lockedTermsPreserved("Der Vertrag liegt bei", "Līgums ir pielikumā")).toBe(true);
    expect(lockedTermsPreserved("ხელშეკრულება მზადაა", "Leping on valmis")).toBe(true);
  });

  it("a dropped contract word or money unit is unfaithful", () => {
    expect(lockedTermsPreserved("Sutartis pasirašyta", "It is signed")).toBe(false);
    expect(lockedTermsPreserved("100 EUR", "100")).toBe(false);
    expect(lockedTermsPreserved("100 zł", "100")).toBe(false);
  });

  it("currency forms answer for each other; a swapped currency does not", () => {
    expect(lockedTermsPreserved("18 EUR", "18 €")).toBe(true);
    expect(lockedTermsPreserved("18 eurų", "18 euros")).toBe(true);
    expect(lockedTermsPreserved("35 000 kr", "35 000 SEK")).toBe(true);
    expect(lockedTermsPreserved("35 000 SEK", "35 000 NOK")).toBe(false);
    expect(lockedTermsPreserved("18 EUR", "18 PLN")).toBe(false);
  });

  it("verbs and look-alikes are not locked terms", () => {
    // "sutarti" = to agree, "договорились" = we agreed, "nok" = enough,
    // "vertragen" = to tolerate, "Europe" is not the euro
    expect(lockedTermsIn("Galime sutarti dėl laiko")).toEqual([]);
    expect(lockedTermsIn("Мы договорились")).toEqual([]);
    expect(lockedTermsIn("Det er nok for i dag")).toEqual([]);
    expect(lockedTermsIn("Das kann ich nicht vertragen")).toEqual([]);
    expect(lockedTermsIn("Work across Europe")).toEqual([]);
  });

  it("a message without locked terms passes the term rule", () => {
    expect(lockedTermsPreserved("Gerai, būsiu", "Okay, I'll be there")).toBe(true);
  });
});

describe("renderingIsFaithful = digits AND locked terms", () => {
  const source = "3 suvirintojai, 18,50 EUR/val., sutartis nuo 2026-12-01";
  it("passes only when both hold", () => {
    expect(renderingIsFaithful(source, "3 welders, €18,50/h, contract from 2026-12-01")).toBe(true);
    expect(renderingIsFaithful(source, "3 welders, €18/h, contract from 2026-12-01")).toBe(false);
    expect(renderingIsFaithful(source, "3 welders, 18,50/h, contract from 2026-12-01")).toBe(false);
    expect(renderingIsFaithful(source, "3 welders, €18,50/h, from 2026-12-01")).toBe(false);
  });
});
