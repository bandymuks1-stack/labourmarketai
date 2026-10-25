import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * WORDS THAT SAID THE WRONG THING (walk-spec 2026-10-25).
 *
 *   · The journal timeline called a REJECTION "Grąžinta" / "Returned" — the
 *     word the entry's standing chip uses for a request for CHANGES. Two
 *     different decisions read as one; a worker could not tell a rejected
 *     entry from one sent back for a fix.
 *   · The LT manager inbox was titled "Patvirtinti įrašai" ("confirmed
 *     entries") over a list of entries still WAITING to be confirmed.
 *   · The roster utilisation line said "1 žmonės" / "1 people": the count
 *     was interpolated into a fixed plural noun.
 */

const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", ...p), "utf8");
const root = (loc: string) => JSON.parse(read("messages", `${loc}.json`));
const journal = (loc: string) => JSON.parse(read("messages", loc, "journal.json"));

describe("a rejection and a request for changes never share a word", () => {
  it.each([...activeLocales])("%s", (loc) => {
    const j = journal(loc);
    const rejected: string = j.entry.timeline.rejected;
    expect(rejected.trim().length).toBeGreaterThan(0);
    expect(rejected, `${loc}: timeline.rejected = timeline.changes_requested`).not.toBe(
      j.entry.timeline.changes_requested,
    );
    expect(rejected, `${loc}: timeline.rejected = standing.returned`).not.toBe(
      j.verification.standing.returned,
    );
    expect(rejected, `${loc}: timeline.rejected = state.returned`).not.toBe(
      j.verification.state.returned,
    );
  });

  it("LT names a rejection as one", () => {
    expect(journal("lt").entry.timeline.rejected).not.toMatch(/Grąžinta/);
  });
});

describe("the LT inbox title says entries TO confirm, as EN does", () => {
  it("not 'Patvirtinti įrašai' (= confirmed entries)", () => {
    const title: string = journal("lt").inbox.title;
    expect(title).not.toBe("Patvirtinti įrašai");
    expect(title).toMatch(/laukia|tvirtint/i);
    expect(journal("en").inbox.title).toBe("Entries to confirm");
  });
});

describe("roster utilisation counts agree with their nouns", () => {
  const ONE_PEOPLE = /\b1 (žmonės|people|mensen|Personen|osób|osoby)\b/;

  it.each([...activeLocales])("%s: one worker reads in the singular", (loc) => {
    const t = createTranslator({ locale: loc, messages: root(loc) });
    const one = t("workforcePlanning.utilisation.committedDays" as never, {
      committed: 1,
      counted: 1,
      workers: 1,
      days: 1,
    } as never);
    expect(one, `${loc}: ${one}`).not.toMatch(ONE_PEOPLE);
    expect(one).not.toMatch(/\{|\}/);
    const many = t("workforcePlanning.utilisation.committedDays" as never, {
      committed: 3,
      counted: 20,
      workers: 5,
      days: 28,
    } as never);
    expect(many).toContain("5");
    expect(many).toContain("28");
  });

  it("LT: one person is 'žmogus', 'išvis' is one word", () => {
    const t = createTranslator({ locale: "lt", messages: root("lt") });
    expect(
      t("workforcePlanning.utilisation.committedDays" as never, {
        committed: 1,
        counted: 1,
        workers: 1,
        days: 1,
      } as never),
    ).toContain("1 žmogus");
    expect(root("lt").workforcePlanning.utilisation.unknown).toContain("išvis");
    expect(root("lt").workforcePlanning.utilisation.unknown).not.toMatch(/iš vis\b/);
  });

  it("EN: one person, one day", () => {
    const t = createTranslator({ locale: "en", messages: root("en") });
    expect(
      t("workforcePlanning.utilisation.committedDays" as never, {
        committed: 1,
        counted: 1,
        workers: 1,
        days: 1,
      } as never),
    ).toBe("1 of 1 worker-day committed — 1 person over 1 day");
  });
});
