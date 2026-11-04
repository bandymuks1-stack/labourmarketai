import { describe, expect, it } from "vitest";

import {
  achievementInput,
  certificateInput,
  cvDateText,
  editedText,
  educationInput,
  workHistoryInput,
} from "./cv-proposal-edit";

const work = {
  title: "UAB Fixture Statyba",
  startYear: 2019,
  endYear: 2023,
  start: { year: 2019, month: 3, day: null },
  end: { year: 2023, month: 12, day: null },
  isCurrent: false,
};
const school = {
  institution: "Vilniaus kolegija",
  program: "Statyba",
  educationTypeSlug: "college",
  startYear: 2015,
  endYear: 2018,
};

describe("work history corrections", () => {
  it("an untouched row saves exactly what was proposed", () => {
    expect(workHistoryInput(work, {})).toEqual({
      title: work.title,
      startYear: 2019,
      endYear: 2023,
      start: work.start,
      end: work.end,
      isCurrent: false,
    });
  });

  it("a corrected title and dates are what is saved, at the stated precision", () => {
    expect(workHistoryInput(work, { title: "Plytelių klojėjas, UAB Alfa", start: "2018", end: "2023-11" })).toEqual({
      title: "Plytelių klojėjas, UAB Alfa",
      startYear: 2018,
      endYear: 2023,
      start: { year: 2018, month: null, day: null },
      end: { year: 2023, month: 11, day: null },
      isCurrent: false,
    });
  });

  it("an empty date is not stated, never a guess", () => {
    const out = workHistoryInput(work, { start: "", end: "" });
    expect(out).toMatchObject({ startYear: null, endYear: null, start: null, end: null });
  });

  it("an end typed in closes an entry the CV called current; none keeps it open", () => {
    const current = { ...work, end: null, endYear: null, isCurrent: true };
    expect(workHistoryInput(current, {})?.isCurrent).toBe(true);
    expect(workHistoryInput(current, { end: "2024" })?.isCurrent).toBe(false);
  });

  it("what cannot be saved is refused, not stored", () => {
    expect(workHistoryInput(work, { title: "x" })).toBeNull();
    expect(workHistoryInput(work, { start: "kovas" })).toBeNull();
    expect(workHistoryInput(work, { start: "2021-02-30" })).toBeNull();
    expect(workHistoryInput(work, { start: "2024", end: "2020" })).toBeNull();
  });
});

describe("education and training corrections", () => {
  it("an untouched row keeps the parser's type", () => {
    expect(educationInput(school, {})).toEqual(school);
  });

  it("corrections are saved; an empty program is none", () => {
    expect(educationInput(school, { institution: "VILNIUS TECH", program: "", endYear: "2019" })).toEqual({
      ...school,
      institution: "VILNIUS TECH",
      program: null,
      endYear: 2019,
    });
  });

  it("moving it between education and training changes only the type", () => {
    expect(educationInput(school, { kind: "training" })?.educationTypeSlug).toBe("course_certificate");
    const course = { ...school, educationTypeSlug: "course_certificate" };
    expect(educationInput(course, { kind: "education" })?.educationTypeSlug).toBe("other");
    // Choosing what it already is keeps the better guess.
    expect(educationInput(school, { kind: "education" })?.educationTypeSlug).toBe("college");
  });

  it("refuses a reversed period or a year that is not one", () => {
    expect(educationInput(school, { startYear: "2020", endYear: "2018" })).toBeNull();
    expect(educationInput(school, { endYear: "18" })).toBeNull();
  });
});

describe("other rows", () => {
  it("certificates, achievements and placed lines save the corrected words", () => {
    expect(certificateInput({ title: "Aukštalipio pažymėjimas", year: 2020 }, { year: "2021" })).toEqual({
      title: "Aukštalipio pažymėjimas",
      year: 2021,
    });
    expect(certificateInput({ title: "Pažymėjimas", year: null }, { year: "metai" })).toBeNull();
    expect(achievementInput({ title: "Geriausias meistras" }, { title: "Metų meistras" })).toEqual({ title: "Metų meistras" });
    expect(editedText("Vonios apdaila", { text: "Vonios kambarių apdaila" })).toBe("Vonios kambarių apdaila");
    expect(editedText("Vonios apdaila", { text: " " })).toBeNull();
  });

  it("dates read back at the precision stated", () => {
    expect(cvDateText({ year: 2019, month: 3, day: null })).toBe("2019-03");
    expect(cvDateText({ year: 2019, month: null, day: null })).toBe("2019");
    expect(cvDateText(null)).toBe("");
  });
});
