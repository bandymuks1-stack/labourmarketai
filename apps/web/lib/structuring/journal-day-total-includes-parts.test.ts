import { describe, expect, it } from "vitest";

import { extractJournalSuggestions } from "./extract-journal-suggestions";
import { deriveIntakeWorkTime, intakeWorkTimeFields } from "@/lib/journal/intake-work-time";

/**
 * A DAY TOTAL THAT CONTAINS ITS PARTS (#3354). A 15-hour day that includes
 * 2 hours of coordination was recorded as two items, 15 + 2, and every
 * reader summed them to 17. Production had live entries of exactly this
 * shape (a labelled total, then one part in brackets); the first sentence
 * below has that shape with invented words.
 */
const minutes = (text: string): number =>
  extractJournalSuggestions(text).fragments.reduce((sum, f) => {
    if (!f.time) return sum;
    if (f.time.unitSlug === "hours") return sum + f.time.value * 60;
    if (f.time.unitSlug === "minutes") return sum + f.time.value;
    return sum;
  }, 0);

const intakeMinutes = (text: string): number => {
  const t = deriveIntakeWorkTime(text, "2026-11-06");
  return t.fragments.reduce(
    (sum, f) => sum + (f.timeUnit === "hours" ? f.timeValue * 60 : f.timeUnit === "minutes" ? f.timeValue : 0),
    0,
  );
};

const LABELLED =
  "2026-11-06. Darbo laikas: 15 valandų. Tikrinau objektus ir derinau grafikus, rašiau ataskaitas bei kalbėjausi su klientais. Vakare vyko koordinavimas su komanda (2 valandos per dieną). Viskas pagal planą; rytoj tęsiu.";

describe("a 15 h day that includes 2 h of coordination is 15 h, never 17", () => {
  it.each([
    ["labelled total, part in brackets (the production shape)", LABELLED],
    ["Lithuanian 'iš jų'", "Dirbau 15 val., iš jų 2 val. koordinavimas."],
    ["Lithuanian 'įskaitant'", "Dirbau 15 val., įskaitant 2 val. koordinavimo."],
    ["English 'including'", "Worked 15 h today, including 2 h coordination."],
    ["English 'of which'", "Worked 15 hours, of which 2 hours coordination."],
  ])("%s", (_name, text) => {
    expect(minutes(text)).toBe(15 * 60);
    expect(intakeMinutes(text)).toBe(15 * 60);
    const s = extractJournalSuggestions(text);
    expect(s.statedTotal).toMatchObject({ value: 15, unitSlug: "hours", includesParts: true, matchesFragments: true });
  });

  it("the part keeps its own 2 h, the rest of the day is 13 h in the person's own words", () => {
    const s = extractJournalSuggestions("Dirbau 15 val., iš jų 2 val. koordinavimas.");
    const times = s.fragments.filter((f) => f.time).map((f) => [f.time!.value, f.time!.unitSlug]);
    expect(times).toContainEqual([2, "hours"]);
    expect(times).toContainEqual([13, "hours"]);
    expect(s.fragments.some((f) => /15 val/.test(f.rawPhrase))).toBe(true);
  });

  it("the chat / MCP save writes no set-aside total: the items already add up to it", () => {
    const fields = intakeWorkTimeFields("Dirbau 15 val., iš jų 2 val. koordinavimas.", "2026-11-06");
    expect(fields.quantity).toBeUndefined();
    const items = JSON.parse(fields.fragments_json) as { timeValue: number; timeUnit: string }[];
    expect(items.reduce((s, f) => s + (f.timeUnit === "hours" ? f.timeValue * 60 : f.timeValue), 0)).toBe(900);
  });

  it("when the parts fill the whole day there is no empty rest", () => {
    const s = extractJournalSuggestions("Dirbau 4 val., iš jų 2 val. koordinavimas ir 2 val. ataskaitos.");
    expect(minutes("Dirbau 4 val., iš jų 2 val. koordinavimas ir 2 val. ataskaitos.")).toBe(240);
    expect(s.fragments.filter((f) => f.time).every((f) => f.time!.value > 0)).toBe(true);
  });
});

describe("nothing is read as a total without a signal", () => {
  it("two items are two items (unchanged)", () => {
    expect(minutes("Klijavau plyteles 6 val., glaisčiau sienas 2 val.")).toBe(8 * 60);
    expect(extractJournalSuggestions("Klijavau plyteles 6 val., glaisčiau sienas 2 val.").statedTotal).toBeNull();
  });

  it("a bare larger figure followed by a smaller one, with no inclusion word, stays two items", () => {
    expect(minutes("Dirbau 8 val. Po to 2 val. vairavau.")).toBe(10 * 60);
  });

  it("parts that exceed the stated total are never squeezed into it", () => {
    const s = extractJournalSuggestions("Dirbau 3 val., iš jų 2 val. koordinavimas ir 2 val. ataskaitos.");
    expect(s.statedTotal?.includesParts).not.toBe(true);
  });

  it("a total that names its own work is an item, not a container", () => {
    expect(extractJournalSuggestions("Klijavau plyteles 6 val., iš jų 2 val. vonioje.").statedTotal?.includesParts).not.toBe(
      true,
    );
  });
});

/**
 * The production entries explain their day: the total, the parts, then
 * sentences that repeat figures already stated ("those 2 h are part of the
 * 15"). Every mention was one more item: stored days of 17, 19, 32 h. The
 * sentences below have those shapes with invented words.
 */
describe("a day explained in several sentences is still one 15 h day", () => {
  it.each([
    [
      "'in total' + dash parts + 'together 15' + a clarifying sentence",
      "2026-04-03. Mano darbo diena truko: iš viso 15 valandų be pertraukų. Programavimas, testavimas ir dokumentai – 13 valandų. Komandos darbų derinimas, koordinavimas su partneriais – 2 valandos, kartu 15 valandų. Tos 2 valandos yra 15 valandų dalis, ne papildomos. Rytoj tęsiu.",
    ],
    [
      "'of them' + two clarifying sentences",
      "2026-03-25. Šiandien dirbau 15 valandų darbo dieną be pertraukų. Iš jų 13 valandų programavau LabourMarket.ai, testavau, rašiau; 2 valandos skirtos koordinavimui su komanda. Šios 2 valandos įeina į 15 valandų, o ne prideda 2 valandas prie darbo laiko. Valandos teisingos, ačiū.",
    ],
    [
      "colon header + parts + clarifying sentences",
      "2026-03-17. Šiandien mano 15 valandų darbo laikas be pertraukų: 13 valandų programavimas ir testavimas, 2 valandos skirtos koordinavimui, skambučiai su partneriais. Šios 2 valandos įeina į 15 valandų; ne 2 valandos papildomai. Valandos teisingos, ačiū.",
    ],
    [
      "labelled total + a part with a colon + the total restated",
      "2026-11-01. Šios dienos darbo laikas: 15 valandų. Programavau, testavau, darbo procesus tvarkiau, rašiau, darbo planus derinau. Šios dienos koordinavimas su komanda: 2 valandos, tai įeina į 15 valandų dienos darbą. Ačiū.",
    ],
  ])("%s", (_name, text) => {
    expect(minutes(text)).toBe(15 * 60);
    expect(intakeMinutes(text)).toBe(15 * 60);
  });

  it("a repeated figure that names its own work is a real item, never a restatement", () => {
    // The total names no work; the later block of the same size does.
    expect(minutes("Dirbau 4 val. Vakare 4 val. dažiau sienas.")).toBe(8 * 60);
    expect(minutes("Klijavau plyteles 6 val., glaisčiau sienas 2 val., dažiau lubas 2 val.")).toBe(10 * 60);
  });

  it("a colon header alone keeps the #1689 rule: unmatched parts count, the header is set aside", () => {
    const s = extractJournalSuggestions("Šiandien 9 valandas dirbau LabourMarket.ai: 5 val. programavau, 2 val. testavau.");
    expect(s.fragments.map((f) => f.time?.value)).toEqual([5, 2]);
    expect(s.statedTotal).toMatchObject({ value: 9, matchesFragments: false });
    expect(s.statedTotal?.includesParts).toBeUndefined();
  });
});

/**
 * Independent review of #3355 (2026-11-14): size and position alone must never
 * fold real hours into a total. Each sentence below was read wrongly by the
 * first version; every one keeps the hours the person wrote.
 */
describe("real hours are never folded into a total without an explicit signal", () => {
  it.each([
    ["two equal blocks that name no work", "Ryte 4 val., vakare 4 val.", 8 * 60],
    ["two equal blocks in English", "Worked 4 h in the morning and 4 h in the evening.", 8 * 60],
    ["one figure per day of the week", "Pirmadienį 8 val. Antradienį 8 val. Trečiadienį 8 val.", 24 * 60],
    ["a labelled day and labelled overtime", "Darbo laikas: 8 val. Viršvalandžiai: 2 val.", 10 * 60],
    ["the same in English", "Hours: 8 h. Overtime: 2 h.", 10 * 60],
    ["a bracketed count that is not a duration", "Dirbau 8 val. Vakare 2 val. dažiau sienas (2 sluoksniai).", 10 * 60],
    ["an inclusion word after the part's own figure", "Worked 8 hours. Then 2 hours of paperwork including invoices.", 10 * 60],
  ])("%s", (_name, text, expected) => {
    expect(minutes(text)).toBe(expected);
    expect(intakeMinutes(text)).toBe(expected);
    expect(extractJournalSuggestions(text).statedTotal?.includesParts).not.toBe(true);
  });

  it("hours and minutes of one figure stay one figure (unchanged)", () => {
    for (const text of ["Darbo laikas: 8 val. 30 min.", "Iš viso 8 val. 30 min."]) {
      expect(extractJournalSuggestions(text).statedTotal?.includesParts).not.toBe(true);
    }
  });

  it("a list after 'iš jų' keeps every item: 10 h with 2 h driving and 2 h waiting", () => {
    const text = "Dirbau 10 val., iš jų 2 val. vairavau, 2 val. laukiau.";
    expect(minutes(text)).toBe(10 * 60);
    const times = extractJournalSuggestions(text)
      .fragments.filter((f) => f.time)
      .map((f) => f.time!.value)
      .sort((a, b) => a - b);
    expect(times).toEqual([2, 2, 6]);
  });

  it("an item said to be ON TOP of the day stays on top, and the stated total is set aside visibly", () => {
    const text = "Dirbau 15 val., iš jų 2 val. koordinavimas. Vakare dar 2 val. dažiau.";
    expect(minutes(text)).toBe(17 * 60);
    expect(extractJournalSuggestions(text).statedTotal).toMatchObject({ value: 15, includesParts: true, matchesFragments: false });
  });
});

describe("more ways to say a part is inside the day", () => {
  it.each([
    ["Lithuanian 'iš kurių'", "Dirbau 15 val., iš kurių 2 val. koordinavimas."],
    ["Lithuanian without diacritics", "Dirbau 15 val., is kuriu 2 val. koordinavimas."],
    ["Russian 'включая'", "Работал 15 часов, включая 2 часа координации."],
    ["German 'inklusive'", "15 Stunden gearbeitet, inklusive 2 Stunden Koordination."],
    ["a date before the day", "Lapkričio 6 d. Dirbau 15 val., iš jų 2 val. koordinavimas."],
  ])("%s", (_name, text) => {
    const hours = extractJournalSuggestions(text).fragments.reduce(
      (sum, f) => sum + (f.time?.unitSlug === "hours" ? f.time.value * 60 : f.time?.unitSlug === "minutes" ? f.time.value : 0),
      0,
    );
    expect(hours).toBe(15 * 60);
  });

  it("the rest of the day still asks the person to name its work", () => {
    const rest = extractJournalSuggestions("Dirbau 15 val., iš jų 2 val. koordinavimas.").fragments.find(
      (f) => f.time?.value === 13,
    );
    expect(rest).toMatchObject({ activitySlug: null, activityLabel: null, isUnknown: true });
  });

  it("a total said again in other words is not one more day", () => {
    expect(minutes("Dirbau 15 val. be pertraukų. Iš viso 15 val.")).toBe(15 * 60);
  });
});

/**
 * Second review of #3355: an inclusion word belongs to the figure RIGHT before
 * it; a cue or total word counts only in front of the figure it speaks about;
 * brackets are a signal only under a labelled day; a lowercase sentence still
 * ends a list.
 */
describe("the signal belongs to the figure it stands next to", () => {
  it.each([
    ["'of which' after a different item: 2 of the 6, not of the 8", "Dirbau 8 val. Klijavau plyteles 6 val., iš jų 2 val. vonioje.", 8 * 60],
    ["a bracketed item after a different item", "Dirbau 8 val. Klijavau plyteles 6 val., glaisčiau sienas (2 val.).", 8 * 60],
    ["the same in English", "Worked 8 h. Tiling 6 h, grouting (2 h).", 8 * 60],
    ["brackets as style under an unlabelled day", "Dirbau 8 val. objekte. Vakare vairavau (2 val.).", 10 * 60],
    ["'together with' is not 'in total'", "Ryte 4 val. Vakare 4 val. kartu su kolega.", 8 * 60],
    ["'included' about something else", "Worked 4 h in the morning. In the evening 4 h with travel included.", 8 * 60],
    ["a lowercase sentence ends the 'of which' list", "dirbau 8 val., iš jų 2 val. vairavau. vakare 3 val. tvarkiau sandėlį.", 11 * 60],
  ])("%s", (_name, text, expected) => {
    expect(minutes(text)).toBe(expected);
    expect(intakeMinutes(text)).toBe(expected);
  });

  it("a figure in words after 'iš jų' is a part too", () => {
    expect(minutes("Dirbau 15 val., iš jų dvi valandos koordinavimas.")).toBe(15 * 60);
  });

  it("a bare total before 'iš jų' is never glued onto the part", () => {
    const s = extractJournalSuggestions("15 val., iš jų 2 val. koordinavimas.");
    expect(s.fragments.filter((f) => f.time).map((f) => f.time!.value).sort((a, b) => a - b)).toEqual([2, 13]);
  });
});

/**
 * Third review of #3355: when the person names the rest of the day
 * themselves, those hours ARE the rest (the #1689 sum check reads them so
 * too); a cue far back in a phrase is not a restatement; an after-work item is
 * on top of the day.
 */
describe("the rest of the day, when the person names it", () => {
  it.each([
    ["the rest in the next sentence", "Dirbau 15 val., iš jų 2 val. koordinavimas. 13 val. programavau.", 15 * 60],
    ["the same in English", "Worked 15 hours, of which 2 hours coordination. The other 13 hours programming.", 15 * 60],
    ["the rest named with its work first", "Dirbau 8 val., iš jų 2 val. vairavau. Klijavau plyteles 6 val.", 8 * 60],
    ["a cue far back in the phrase is not a restatement", "Ryte 4 val. Vakare didžiąją dalį laiko lauke 4 val.", 8 * 60],
    ["an after-work item is on top of the day", "Dirbau 8 val., iš jų 2 val. vairavau, o po darbo 3 val. tvarkiau sandėlį.", 11 * 60],
    ["after work, in English", "Worked 8 hours, of which 2 hours driving, and after work 3 hours in the warehouse.", 11 * 60],
  ])("%s", (_name, text, expected) => {
    expect(minutes(text)).toBe(expected);
    expect(intakeMinutes(text)).toBe(expected);
  });

  it("a named rest adds up: the stated total matches and no unnamed rest is left", () => {
    const s = extractJournalSuggestions("Dirbau 15 val., iš jų 2 val. koordinavimas. 13 val. programavau.");
    expect(s.statedTotal).toMatchObject({ value: 15, includesParts: true, matchesFragments: true });
    expect(s.fragments.filter((f) => f.time).map((f) => f.time!.value).sort((a, b) => a - b)).toEqual([2, 13]);
    const fields = intakeWorkTimeFields("Dirbau 15 val., iš jų 2 val. koordinavimas. 13 val. programavau.", "2026-11-06");
    expect(fields.quantity).toBeUndefined();
  });

  it("a later item that does not fill the rest is never folded in by size: the stated total is set aside visibly", () => {
    const text = "Dirbau 15 val., iš jų 2 val. koordinavimas. 10 val. programavau.";
    const s = extractJournalSuggestions(text);
    expect(s.statedTotal).toMatchObject({ value: 15, includesParts: true, matchesFragments: false });
    expect(s.fragments.some((f) => f.time?.value === 10)).toBe(true);
    expect(intakeWorkTimeFields(text, "2026-11-06").quantity).toBe(String(15 * 60));
  });

  it("the person's own sum wins: items that add up to the rest are the rest (unchanged from main)", () => {
    const text = "Dirbau 15 val., iš jų 2 val. koordinavimas. 12 val. programavau. Vakare dar 1 val. dažiau.";
    expect(minutes(text)).toBe(15 * 60);
    expect(extractJournalSuggestions(text).statedTotal).toMatchObject({ value: 15, matchesFragments: true });
  });

  it("an item said to be on top stays on top while the other items name the rest", () => {
    const text = "Dirbau 15 val., iš jų 2 val. koordinavimas. 13 val. programavau. Vakare dar 1 val. dažiau.";
    expect(minutes(text)).toBe(16 * 60);
    expect(intakeMinutes(text)).toBe(16 * 60);
    expect(extractJournalSuggestions(text).statedTotal).toMatchObject({ value: 15, includesParts: true, matchesFragments: false });
  });
});

/**
 * Fourth review of #3355: words that NAME a part ("antroji dalis", "second
 * part of the day") never say a figure is the day said again; the rest and a
 * part right after it stay two items.
 */
describe("a part of the day is not the day said again", () => {
  it.each([
    ["Lithuanian 'antroji dalis'", "Pirmoji dienos dalis – 4 val., antroji dalis – 4 val.", 8 * 60],
    ["Lithuanian 'antra dalis'", "Pirma dalis 4 val., antra dalis 4 val.", 8 * 60],
    ["English 'second part of the day'", "First part of the day 4 h, second part of the day 4 h.", 8 * 60],
  ])("%s", (_name, text, expected) => {
    expect(minutes(text)).toBe(expected);
    expect(intakeMinutes(text)).toBe(expected);
    expect(extractJournalSuggestions(text).statedTotal?.includesParts).not.toBe(true);
  });

  it("a part said with 'dalis' after the total still reads as inside it", () => {
    expect(minutes("Dirbau 15 val. 13 val. programavau, 2 val. derinau. Tos 2 valandos yra 15 valandų dalis.")).toBe(15 * 60);
  });

  it("the short labelled form keeps the rest and the bracketed part as two items: 13 h + 2 h", () => {
    const s = extractJournalSuggestions("Darbo laikas: 15 valandų. Vakare vyko koordinavimas su komanda (2 valandos per dieną).");
    const times = s.fragments.filter((f) => f.time).map((f) => f.time!.value).sort((a, b) => a - b);
    expect(times).toEqual([2, 13]);
    expect(s.fragments.find((f) => f.time?.value === 13)).toMatchObject({ activitySlug: null, activityLabel: null, isUnknown: true });
    expect(s.statedTotal).toMatchObject({ value: 15, includesParts: true, matchesFragments: true });
  });
});

/**
 * Fifth review of #3355: a total word or a cue inside another block of the
 * day never makes that block the day said again; the rest of a contained day
 * still takes a stray date before it, and parts still take their own minutes.
 */
describe("a block of the day is never the day said again", () => {
  it.each([
    ["'kartu' meaning together", "Ryte 4 val. dirbau vienas, vakare kartu 4 val.", 8 * 60],
    ["'iš viso' inside the evening block", "Ryte 4 val., vakare iš viso 4 val.", 8 * 60],
    ["the same in English", "Worked 4 h in the morning. In the evening, in total 4 h.", 8 * 60],
  ])("%s", (_name, text, expected) => {
    expect(minutes(text)).toBe(expected);
    expect(intakeMinutes(text)).toBe(expected);
    expect(extractJournalSuggestions(text).statedTotal?.includesParts).not.toBe(true);
  });

  it("two blocks named by the part of the day stay two items", () => {
    const s = extractJournalSuggestions("Dirbau 8 val. 4 val. ryte ir 4 val. vakare, didžiąją dalį – lauke.");
    expect(minutes("Dirbau 8 val. 4 val. ryte ir 4 val. vakare, didžiąją dalį – lauke.")).toBe(8 * 60);
    expect(s.fragments.filter((f) => f.time).map((f) => f.time!.value)).toEqual([4, 4]);
  });

  it("a stray date before the day folds away as before: no day count in the intake", () => {
    const s = extractJournalSuggestions("6 d. Dirbau 15 val., iš jų 2 val. koordinavimas.");
    expect(minutes("6 d. Dirbau 15 val., iš jų 2 val. koordinavimas.")).toBe(15 * 60);
    expect(s.fragments.some((f) => f.time?.unitSlug === "days")).toBe(false);
  });

  it.each([
    ["a part that continues the list", "Dirbau 8 val., iš jų 2 val. vairavau, 1 val. 30 min. klijavau."],
    ["a part right after 'iš jų'", "Dirbau 8 val., iš jų 1 val. 30 min. vairavau."],
  ])("hours and minutes of one part stay one item: %s", (_name, text) => {
    expect(minutes(text)).toBe(8 * 60);
    const s = extractJournalSuggestions(text);
    const times = s.fragments.filter((f) => f.time).map((f) => `${f.time!.value} ${f.time!.unitSlug}`);
    expect(times).toContain("90 minutes");
    expect(times).not.toContain("30 minutes");
  });
});

/**
 * Sixth review of #3355: the part of the day is read in front of the figure
 * being said again, never elsewhere in its sentence, so an explicit inclusion
 * still holds the day at 15 h. Also Codex on the first version: a repeated
 * figure with no signal stays two items.
 */
describe("an explicit inclusion holds even where the sentence names a part of the day", () => {
  it.each([
    ["'jos įeina į 15' after an evening item", "Šiandien dirbau 15 valandų. Vakare 2 valandos koordinavimo, jos įeina į 15 valandų."],
    ["'tai įeina į 15' after an evening item", "Dirbau 15 val. 13 val. programavau, vakare 2 val. koordinavau, tai įeina į 15 val."],
    ["the same in English", "Worked 15 h, 13 h coding and 2 h coordination in the evening, which is included in the 15 h."],
    ["'iš viso 15' with 'nuo ryto iki vakaro' after it", "Dirbau 15 val., iš jų 2 val. koordinavimas. Iš viso 15 val. nuo ryto iki vakaro."],
    ["German 'morgen' is tomorrow", "15 Stunden gearbeitet, davon 2 Stunden Koordination. Insgesamt 15 Stunden, morgen geht es weiter."],
  ])("%s", (_name, text) => {
    expect(minutes(text)).toBe(15 * 60);
    expect(intakeMinutes(text)).toBe(15 * 60);
  });

  it("an evening block named only before the figure is still a block: 4 + 4", () => {
    expect(minutes("Ryte 4 val. Vakare vairavau, iš viso 4 val.")).toBe(8 * 60);
  });

  it.each([
    ["Lithuanian 'po to dar'", "Dirbau 2 val. Po to dar 2 val."],
    ["Lithuanian 'po to'", "Dirbau 2 val. Po to 2 val."],
    ["English 'then another'", "Worked 2 hours. Then another 2 hours."],
  ])("a repeated figure with no signal stays two items: %s", (_name, text) => {
    expect(minutes(text)).toBe(4 * 60);
    expect(intakeMinutes(text)).toBe(4 * 60);
    expect(extractJournalSuggestions(text).statedTotal).toBeNull();
  });
});

/**
 * Seventh review of #3355: a part of the day said AFTER the figure marks a
 * block too; a span of the whole day does not.
 */
describe("a part of the day after the figure still marks a block", () => {
  it.each([
    ["'iš viso 4 val. vakare'", "Ryte 4 val., iš viso 4 val. vakare.", 8 * 60],
    ["'kartu 4 val. vakare su kolega'", "Ryte 4 val., kartu 4 val. vakare su kolega.", 8 * 60],
    ["English 'in total 4 h in the evening'", "Worked 4 h in the morning, and in total 4 h in the evening.", 8 * 60],
  ])("%s", (_name, text, expected) => {
    expect(minutes(text)).toBe(expected);
    expect(intakeMinutes(text)).toBe(expected);
  });

  it.each([
    ["English 'from morning till evening'", "Worked 15 hours, of which 2 hours coordination. In total 15 hours from morning till evening."],
    ["Russian 'с утра до вечера'", "Работал 15 часов, включая 2 часа координации. Всего 15 часов с утра до вечера."],
  ])("a span of the whole day is not a block: %s stays 15 h", (_name, text) => {
    expect(minutes(text)).toBe(15 * 60);
    expect(intakeMinutes(text)).toBe(15 * 60);
  });
});

/**
 * Eighth review of #3355: only a span from the start of the day to its end is
 * the whole day; a span that starts inside the day is a block.
 */
describe("only a span from the start of the day to its end is the whole day", () => {
  it.each([
    ["'nuo trečios iki vakaro' is a block", "Ryte 4 val. Nuo trečios iki vakaro iš viso 4 val.", 8 * 60],
    ["'from noon to evening' is a block", "Worked 4 h in the morning. From noon to evening, in total 4 h.", 8 * 60],
    ["'с трёх до вечера' is a block", "Утром 4 часа, с трёх до вечера всего 4 часа.", 8 * 60],
  ])("%s", (_name, text, expected) => {
    expect(minutes(text)).toBe(expected);
    expect(intakeMinutes(text)).toBe(expected);
  });

  it.each([
    ["'nuo ryto iki vėlaus vakaro'", "Dirbau 15 val., iš jų 2 val. koordinavimas. Iš viso 15 val. nuo ryto iki vėlaus vakaro."],
    ["'nuo ankstyvo ryto iki vakaro'", "Dirbau 15 val., iš jų 2 val. koordinavimas. Iš viso 15 val. nuo ankstyvo ryto iki vakaro."],
    ["'from early morning till late evening'", "Worked 15 hours, of which 2 hours coordination. In total 15 hours from early morning till late evening."],
  ])("a whole day with one word on each side stays 15 h: %s", (_name, text) => {
    expect(minutes(text)).toBe(15 * 60);
    expect(intakeMinutes(text)).toBe(15 * 60);
  });
});

/**
 * Final sweep of #3355: the inclusion abbreviations were listed but never
 * read (the phrase was cut at their dot); a few more inclusion words.
 */
describe("abbreviated and more inclusion words", () => {
  it.each([
    ["English 'incl.'", "Worked 15 h, incl. 2 h coordination."],
    ["German 'inkl.'", "15 Stunden gearbeitet, inkl. 2 Stunden Koordination."],
    ["Russian 'в т.ч.'", "Работал 15 ч., в т.ч. 2 ч. координации."],
    ["Lithuanian 'įskaičiuojant'", "Dirbau 15 val., įskaičiuojant 2 val. koordinavimo."],
    ["Lithuanian 'tarp jų'", "Dirbau 15 val., tarp jų 2 val. koordinavimas."],
    ["English 'includes'", "Worked 15 hours. This includes 2 hours of coordination."],
    ["German 'darunter'", "15 Stunden gearbeitet, darunter 2 Stunden Koordination."],
    ["Polish 'wliczając'", "Pracowałem 15 godzin, wliczając 2 godziny koordynacji."],
    ["Polish 'łącznie z'", "Pracowałem 15 godzin łącznie z 2 godzinami koordynacji."],
  ])("%s", (_name, text) => {
    expect(minutes(text)).toBe(15 * 60);
    expect(intakeMinutes(text)).toBe(15 * 60);
  });

  it("an abbreviation dot before a capital still ends the sentence", () => {
    // "inkl." closing a sentence: the next one is its own item.
    expect(minutes("Worked 8 h, all incl. Then 2 h of paperwork.")).toBe(10 * 60);
  });
});
