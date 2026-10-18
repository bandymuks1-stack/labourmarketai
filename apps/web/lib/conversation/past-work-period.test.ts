import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { readCompoundStatement } from "@/lib/conversation/compound-statement";
import { pastWorkOwnWords, readPastWorkPeriod } from "@/lib/conversation/past-work-period";
import { readProfessionStatement } from "@/lib/structuring/role-label";

/**
 * Past work stated with its years (2026-09-29). Walked on production:
 * "2019–2022 dirbau įmonėje Baumeister GmbH Vokietijoje." opened TODAY's
 * journal card with the current employer preselected; "2018–2020 dirbau
 * stogdengiu Norvegijoje." got the fallback. Both now reach the
 * self-declared work-history form (profession-statement handler).
 */
describe("past work with years", () => {
  it("routes a dated past job to the history door, a dated day to the journal", () => {
    expect(classifyIntent("2019–2022 dirbau įmonėje Baumeister GmbH Vokietijoje.").intent).toBe("profession-statement");
    expect(classifyIntent("2018–2020 dirbau stogdengiu Norvegijoje.").intent).toBe("profession-statement");
    expect(classifyIntent("2021 metais dirbau X įmonėje.").intent).toBe("profession-statement");
    expect(classifyIntent("From 2019 to 2022 I worked as a welder").intent).toBe("profession-statement");
    // NEGATIVE: a calendar date and a daily statement stay work-journal
    expect(classifyIntent("2026-09-28 dirbau 5 valandas").intent).toBe("log-work");
    expect(classifyIntent("Vakar dirbau 6 valandas.").intent).toBe("log-work");
    // the router compiles its patterns lazily on first use — slow under load
  }, 20_000);

  it("reads the period, never a date or a future year", () => {
    expect(readPastWorkPeriod("2019–2022 dirbau įmonėje X", 2026)).toEqual({ startYear: 2019, endYear: 2022, isCurrent: false });
    expect(readPastWorkPeriod("2019-2022 dirbau pastolininku", 2026)).toEqual({ startYear: 2019, endYear: 2022, isCurrent: false });
    expect(readPastWorkPeriod("2021 metais dirbau X įmonėje", 2026)).toEqual({ startYear: 2021, endYear: 2021, isCurrent: false });
    expect(readPastWorkPeriod("С 2019 по 2022 работал сварщиком", 2026)).toEqual({ startYear: 2019, endYear: 2022, isCurrent: false });
    expect(readPastWorkPeriod("2026-09-28 dirbau 5 valandas", 2026)).toBeNull();
    expect(readPastWorkPeriod("2029–2031 dirbau", 2026)).toBeNull();
    expect(readPastWorkPeriod("2022–2019 dirbau", 2026)).toBeNull();
  });

  it("keeps the person's own words, and reads the -dengys trade", () => {
    expect(pastWorkOwnWords("2019–2022 dirbau įmonėje Baumeister GmbH Vokietijoje.")).toBe("įmonėje Baumeister GmbH Vokietijoje");
    expect(readProfessionStatement("2018–2020 dirbau stogdengiu Norvegijoje.")?.label).toBe("Stogdengys");
    expect(readProfessionStatement("Esu stogdengys")?.label).toBe("Stogdengys");
    expect(readProfessionStatement("Dar dirbu ir stogdengiu.")?.label).toBe("Stogdengys");
  });
});


describe("a dated past job is not split into a list of facts", () => {
  it("the trade's own word form is not a second 'skill' fact", () => {
    const c = readCompoundStatement("Dirbu stogdengiu jau 5 metus.");
    expect(c.facts.filter((f) => f.kind === "skill").map((f) => f.statedAs.toLowerCase())).not.toContain("stogdengiu");
  });
});
