import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { getCompanyForm } from "@/lib/conversation/company-forms";
import { companyCreateDemandSchema } from "@/lib/conversation/company-schemas";
import { ALL_WORK_TYPE_SLUGS, buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import { CITY_LABELS, COUNTRY_RULES, WORK_TYPE_RULES, resolveCountryAndCity } from "./structure-need";
import { foldText } from "./normalize";
import { parseStartDate, parseTimeWindow } from "./time-window";
import { structureValueStatement } from "./value-statement";

/**
 * Owner Master Execution Contract 2026-09-04 §9:
 *
 *   "I need 12 scaffolders in Rotterdam from 5 October." must progressively
 *   become canonical structured demand: COMPANY · LOCATION · DATES · QUANTITY
 *   · PROFESSION …
 *
 * Measured before this slice: the sentence classified as UNKNOWN (no
 * scaffolder work type, no stem in the router), "Roterdame" collapsed into
 * "Netherlands", and "nuo spalio 5" was not a date at all (the time window
 * knew only next/this week and next month).
 */

const TODAY = "2026-09-04";
const OWNER_SENTENCE = "Reikia 12 pastolininkų Roterdame nuo spalio 5.";

describe("the owner's sentence routes to the employer demand intake", () => {
  it.each([
    ["lt", OWNER_SENTENCE],
    ["en", "I need 12 scaffolders in Rotterdam from 5 October."],
    ["ru", "Нужны 12 монтажников строительных лесов в Роттердаме с 5 октября."],
    ["nl", "We zoeken 12 steigerbouwers in Rotterdam vanaf 5 oktober."],
    ["de", "Wir brauchen 12 Gerüstbauer in Rotterdam ab 5. Oktober."],
  ])("%s", (_locale, text) => {
    expect(classifyIntent(text).intent).toBe("need-workers");
  });

  it("the other four new trades route too, with a seek verb", () => {
    for (const text of [
      "ieškome 6 betonuotojų Kaune",
      "reikia dviejų tinkuotojų",
      "trūksta armatūrininkų",
      "we need plasterers next month",
      "нужны бетонщики",
    ]) {
      expect(classifyIntent(text).intent, text).toBe("need-workers");
    }
  });

  it("a trade WITHOUT a seek verb stays out (boundary kept)", () => {
    expect(classifyIntent("esu pastolininkas").intent).not.toBe("need-workers");
  });
});

describe("the structurer keeps every fact the sentence carries", () => {
  const v = structureValueStatement(OWNER_SENTENCE, TODAY);

  it("axis=seek, subject=workforce, workType=scaffolder, headcount=12", () => {
    expect(v.axis).toBe("seek");
    expect(v.subject).toBe("workforce");
    expect(v.workType).toBe("scaffolder");
    expect(v.headcount).toBe(12);
  });

  it("country=NL AND city=Rotterdam — the site never collapses into the market", () => {
    expect(v.country).toBe("NL");
    expect(v.city).toBe("Rotterdam");
    expect(v.reasons).toContain("city:Rotterdam");
  });

  it("window = the stated start day, no invented end", () => {
    expect(v.window).toMatchObject({ kind: "from_date", startIso: "2026-10-05" });
    expect(v.window?.endIso).toBeUndefined();
  });

  it("nothing actionable is missing any more", () => {
    expect(v.missing).not.toContain("location");
    expect(v.missing).not.toContain("window");
    expect(v.missing).not.toContain("headcount");
  });

  it("'pastolių' (the scaffold, equipment) is NOT a scaffolder need", () => {
    const eq = structureValueStatement("turime laisvų pastolių nuomai", TODAY);
    expect(eq.workType).toBeNull();
    expect(eq.subject).toBe("goods");
  });

  it("a country-only sentence keeps city null", () => {
    expect(structureValueStatement("reikia 3 suvirintojų Nyderlanduose", TODAY).city).toBeNull();
    expect(resolveCountryAndCity(foldText("Vilniuje"))).toEqual({ country: "LT", city: "Vilnius" });
  });
});

describe("absolute start dates across locales (UTC, never in the past)", () => {
  it.each([
    ["nuo spalio 5", "2026-10-05"],
    ["nuo spalio 5 d.", "2026-10-05"],
    ["nuo 5 spalio", "2026-10-05"],
    ["from 5 October", "2026-10-05"],
    ["from October 5", "2026-10-05"],
    ["starting 1 November", "2026-11-01"],
    ["с 5 октября", "2026-10-05"],
    ["vanaf 5 oktober", "2026-10-05"],
    ["ab 5. Oktober", "2026-10-05"],
    ["od 5 października", "2026-10-05"],
    ["nuo 2026-10-05", "2026-10-05"],
    ["2026-12-24", "2026-12-24"],
  ])("%s → %s", (text, iso) => {
    expect(parseStartDate(text, TODAY)).toBe(iso);
    expect(parseTimeWindow(text, TODAY)).toMatchObject({ kind: "from_date", startIso: iso });
  });

  it("a day that already passed this year means next year", () => {
    expect(parseStartDate("nuo sausio 10", TODAY)).toBe("2027-01-10");
  });

  it("an impossible day is honest null; a day count is not a date", () => {
    expect(parseStartDate("nuo balandžio 31", TODAY)).toBeNull();
    expect(parseStartDate("nuo 5 dienų", TODAY)).toBeNull();
    expect(parseTimeWindow("nuo 5 dienų turiu laiko", TODAY).kind).not.toBe("from_date");
  });

  it("the coarse phrases still work when no date is stated", () => {
    expect(parseTimeWindow("kitą mėnesį trūks keturių suvirintojų", TODAY).kind).toBe("next_month");
  });
});

describe("the inline demand form carries the derived facts to the canonical columns", () => {
  it("startDate / workType / country ride the build and pass the dispatch schema", () => {
    const spec = getCompanyForm("company.create-demand")!;
    const built = spec.build({
      description: OWNER_SENTENCE,
      role: "Pastolininkas",
      location: "Rotterdam, Nyderlandai",
      teamSize: "12",
      urgency: "flexible",
      startDate: "2026-10-05",
      workType: "scaffolder",
      country: "NL",
      asDraft: false,
    });
    const parsed = companyCreateDemandSchema.safeParse(built);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.startDate).toBe("2026-10-05");
      expect(parsed.data.workType).toBe("scaffolder");
      expect(parsed.data.country).toBe("NL");
    }
    expect(spec.fields.some((f) => f.name === "startDate")).toBe(true);
  });

  it("a blank start date is null, and a malformed one is refused", () => {
    const spec = getCompanyForm("company.create-demand")!;
    expect(spec.build({ description: "reikia darbuotojų", startDate: "" }).startDate).toBeNull();
    expect(
      companyCreateDemandSchema.safeParse(spec.build({ description: "reikia darbuotojų", startDate: "5 spalio" }))
        .success,
    ).toBe(false);
  });
});

describe("taxonomy + structurer stay consistent", () => {
  it("every new slug exists in the taxonomy with labels in LT/EN/RU", () => {
    for (const slug of ["scaffolder", "concrete_worker", "plasterer", "steel_fixer", "insulation_worker"]) {
      expect(ALL_WORK_TYPE_SLUGS).toContain(slug);
      for (const locale of ["lt", "en", "ru"]) {
        expect(buildWorkTypeLabelMap(locale)[slug], `${slug}/${locale}`).toBeTruthy();
      }
      expect(WORK_TYPE_RULES.find((r) => r.slug === slug)).toBeDefined();
    }
  });

  it("every city label key is a real COUNTRY_RULES needle", () => {
    const needles = new Set(COUNTRY_RULES.flatMap((r) => r.needles));
    for (const key of Object.keys(CITY_LABELS)) expect(needles.has(key), key).toBe(true);
  });
});
