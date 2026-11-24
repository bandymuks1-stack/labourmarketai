import { describe, expect, it } from "vitest";

import { readRenameTarget } from "./organization-rename-phrase";

/**
 * The new name, read out of the rename sentence (owner program 2026-09-23).
 * It PREFILLS the confirm form — so it must keep the casing the person typed,
 * find the name wherever each language puts it, and answer `null` rather than
 * guess when the sentence carries no name.
 */
describe("readRenameTarget — the name the sentence already carries", () => {
  const CASES: ReadonlyArray<readonly [string, string]> = [
    // The owner's two production sentences, verbatim.
    ["Pas mane yra agentūra be pavadinimo. Pervadink ją Nonstop Group UAB.", "Nonstop Group UAB"],
    ["Pervadink šią agentūrą į Nonstop Group UAB.", "Nonstop Group UAB"],
    // lt — typed without the diacritic, `i` is still the target marker.
    ["pervadink agentura i Nonstop Group UAB", "Nonstop Group UAB"],
    ["pakeisk pavadinimą į Nonstop Group UAB", "Nonstop Group UAB"],
    ["Agentūros pavadinimas: Nonstop Group UAB", "Nonstop Group UAB"],
    ["Pervadink į „Baltijos statyba“", "Baltijos statyba"],
    // en
    ["rename my company to Nonstop Group UAB", "Nonstop Group UAB"],
    ["Change the agency name to Nonstop Group, please", "Nonstop Group"],
    ["change the name of our organisation to Nonstop", "Nonstop"],
    ['Rename us to "Northern Build Ltd"', "Northern Build Ltd"],
    // ru
    ["Переименуй агентство в Nonstop Group UAB", "Nonstop Group UAB"],
    ["Смени название компании на «Северная стройка»", "Северная стройка"],
    ["Измени название на Nonstop Group", "Nonstop Group"],
    // nl
    ["Hernoem mijn bedrijf naar Nonstop Group", "Nonstop Group"],
    ["Verander de naam van het bureau in Nonstop Group", "Nonstop Group"],
    // de — the separable verb's trailing `um` is not part of the name.
    ["Benenne meine Firma in Nonstop Group um", "Nonstop Group"],
    ["Ändere den Firmennamen zu Nonstop Group", "Nonstop Group"],
    // pl
    // A legal form written with dots keeps its final dot.
    ["Zmień nazwę firmy na Nonstop Group Sp. z o.o.", "Nonstop Group Sp. z o.o."],
    ["Przemianuj agencję na Nonstop Group", "Nonstop Group"],
  ];

  for (const [sentence, expected] of CASES) {
    it(`"${sentence}" → "${expected}"`, () => {
      expect(readRenameTarget(sentence)).toBe(expected);
    });
  }

  it("keeps the ORIGINAL casing — never the folded, lower-cased form the router matches on", () => {
    expect(readRenameTarget("rename my company to nonstop group uab")).toBe("nonstop group uab");
    expect(readRenameTarget("Pervadink į NONSTOP Group")).toBe("NONSTOP Group");
  });

  it("answers null when the sentence carries no name — the form opens empty, nothing is guessed", () => {
    for (const s of [
      "pakeisk įmonės pavadinimą",
      "Noriu pakeisti agentūros pavadinimą",
      "change organization name",
      "Firma umbenennen",
      "rename my company to",
      "",
      "   ",
    ]) {
      expect(readRenameTarget(s), s).toBeNull();
    }
  });

  it("a leading word that only LOOKS like a verb never anchors the name", () => {
    // "Pas" (lt: at/with) is also the Dutch verb in "pas aan"; the rename verb
    // later in the sentence wins, so the name is not "Pervadink ją …".
    expect(readRenameTarget("Pas mane yra agentūra be pavadinimo. Pervadink ją Nonstop Group UAB.")).not.toMatch(
      /Pervadink/,
    );
  });

  it("the English pronoun `I` is not the Lithuanian marker `i`", () => {
    // After the verb, "I" (upper case) is skipped; "to" introduces the name.
    expect(readRenameTarget("Change the name I use to Nordbau")).toBe("Nordbau");
    // …while a lower-case `i` IS the Lithuanian `į` typed without its mark.
    expect(readRenameTarget("pakeisk pavadinima i Nordbau")).toBe("Nordbau");
  });

  it("respects the canonical bounds (2–200 characters)", () => {
    expect(readRenameTarget("rename my company to X")).toBeNull();
    expect(readRenameTarget(`rename my company to ${"A".repeat(201)}`)).toBeNull();
    expect(readRenameTarget(`rename my company to ${"A".repeat(200)}`)).toBe("A".repeat(200));
  });
});
