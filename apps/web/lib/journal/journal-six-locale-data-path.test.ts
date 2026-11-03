import { describe, expect, it } from "vitest";

import { extractWorkLog, journalDraftReadiness } from "@/lib/conversation/worklog-extract";
import { deriveIntakeWorkTime, intakeWorkTimeFields } from "@/lib/journal/intake-work-time";
import { projectNamedInText } from "@/lib/journal/project-attribution";
import { deriveReviewResult } from "@/lib/journal/review-status";
import { computeSkillSource } from "@/lib/journal/skill-source";
import { classifyEntrySkillSource } from "@/lib/journal/entry-skill-source";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";

/**
 * ONE WORK DAY, SIX LANGUAGES — the whole data path (local UX review
 * 2026-10-24, row 8.2; owner correction 2026-10-24 B).
 *
 * The same day typed in every active locale must be read the same way at each
 * step the journal feeds: activity → site/project → hours → skill → what the
 * Living CV, matching and capacity read. Before the fix:
 *   - EN "on site for 6 hours" filled Site = "for";
 *   - DE "… auf der Baustelle gemauert" filled Baustelle = "gemauert";
 *   - EN "laid a block wall" and RU "клал стену из блоков" carried their six
 *     hours as "kind of work not recognised";
 *   - PL "przez 6 godzin" had no per-fragment time (the hour unit was unknown
 *     to the fragment reader), so its activity rode on no hours.
 * And whatever the parser reads, it stays a PARSE: nothing it produces can
 * become confirmed professional experience without a second person.
 */
const TODAY = "2026-10-24";

const DAY: Record<string, string> = {
  lt: "šiandien 6 valandas mūrijau blokelių sieną objekte",
  en: "today I laid a block wall on site for 6 hours",
  ru: "сегодня 6 часов клал стену из блоков на объекте",
  nl: "vandaag 6 uur een blokkenmuur gemetseld op de bouwplaats",
  de: "heute 6 Stunden eine Blockmauer auf der Baustelle gemauert",
  pl: "dzisiaj przez 6 godzin murowałem ścianę z bloczków na budowie",
};

/** The masonry family: bricklaying or its block-laying specialisation. */
const MASONRY = new Set(["bricklaying", "blockwork", "mason", "stone-masonry"]);

describe.each(Object.entries(DAY))("%s — one work day, read the same way end to end", (locale, text) => {
  const parse = extractWorkLog(text, TODAY);
  const time = deriveIntakeWorkTime(text, TODAY);

  it("date and hours: today, 6 h", () => {
    expect(parse.date).toBe(TODAY);
    expect(parse.workedMinutes).toBe(360);
  });

  it("site: a generic place word ('on site', 'auf der Baustelle', 'na budowie') names NO site — never the next word", () => {
    expect(parse.site).toBeNull();
  });

  it("activity: the kind of work is recognised as masonry", () => {
    const slugs = recognizeSkills(text, 4).map((s) => s.slug);
    expect(slugs.some((s) => MASONRY.has(s))).toBe(true);
  });

  it("hours ride on the recognised activity — never '6 h · kind of work not recognised'", () => {
    expect(time.fragments.length).toBe(1);
    const f = time.fragments[0]!;
    expect([f.timeValue, f.timeUnit]).toEqual([6, "hours"]);
    const kind = f.activitySlug ?? f.activityLabel;
    expect(kind).not.toBeNull();
  });

  it("the save carries machine provenance and declares no skill", () => {
    const fields = intakeWorkTimeFields(text, TODAY);
    const frags = JSON.parse(fields.fragments_json ?? "[]") as Array<{ source: string; selected: boolean }>;
    expect(frags.length).toBe(1);
    for (const f of frags) {
      expect(f.source).toBe("ai_extracted");
      expect(f.selected).toBe(false);
    }
    expect(JSON.stringify(fields)).not.toMatch(/confirmed|verified|worker_input/);
  });

  it("the composer's legacy site suggestion is never a lower-case verb or function word", () => {
    const s = extractJournalSuggestions(text).siteName;
    if (s !== null) expect(s).toMatch(/^\p{Lu}/u);
  });

  it("it is work content: the flow does not ask what was done", () => {
    expect(journalDraftReadiness(text)).toBe("ok");
  });
});

describe("a real site still reads in every language (the fix narrows, never removes)", () => {
  it.each([
    ["lt", "šiandien objekte Roterdame mūrijau 6 val.", "Roterdame"],
    ["en", "laid blocks on site Kaunas for 6 hours", "Kaunas"],
    ["en", "website builder work for 3 hours", null],
    ["ru", "клал блоки на объекте в Kaunas 6 часов", "Kaunas"],
    ["nl", "6 uur gemetseld op de bouwplaats Almere", "Almere"],
    ["de", "6 Stunden auf der Baustelle in Berlin gemauert", "Berlin"],
    ["de", "6 Stunden auf der Baustelle Berlin-Mitte gemauert", "Berlin-Mitte"],
    ["pl", "6 godzin murowałem na budowie w Gdańsku", "Gdańsku"],
    ["lt", "objekte mūrijau 6 valandas", null],
  ])("%s %s → %s", (_l, text, site) => {
    expect(extractWorkLog(text, TODAY).site).toBe(site);
  });
});

describe("project attribution: a generic place word never preselects a project", () => {
  const projects = [
    { id: "p-baustelle", label: "Baustelle Mitte" },
    { id: "p-bouw", label: "Bouwplaats Noord" },
    { id: "p-obj", label: "Объект Север" },
    { id: "p-budowa", label: "Budowa Gdańsk" },
    { id: "p-site", label: "Site Alpha" },
  ];
  it.each(Object.entries(DAY))("%s: the sentence names no project", (_l, text) => {
    expect(projectNamedInText(projects, text)).toBeNull();
  });
  it("a distinctive name still preselects exactly one project", () => {
    expect(projectNamedInText(projects, "heute 6 Stunden in Mitte gemauert")).toBe("p-baustelle");
  });
});

describe("a misread can never become confirmed experience on its own", () => {
  it("a freshly saved entry with no second-party decision is 'submitted', never approved", () => {
    expect(deriveReviewResult([])).toBe("submitted");
    expect(deriveReviewResult(null)).toBe("submitted");
  });
  it("a skill the journal recognised stays journal evidence — only a real confirmation makes it confirmed", () => {
    expect(computeSkillSource({ verified: false, journalSupported: true })).toBe("work_journal");
    expect(computeSkillSource({ verified: true, journalSupported: true })).toBe("manager_confirmed");
  });
  it("a recognised entry chip reads 'recognised from text', not 'confirmed by a person'", () => {
    const src = classifyEntrySkillSource({
      linked: true,
      verified: false,
      recognizedFromText: true,
      recognizable: true,
      storedProvenance: "recognized",
    });
    expect(src).toBe("recognized_from_text");
  });
});
