import { describe, expect, it } from "vitest";
import { extractCvText, MAX_CV_BYTES } from "./extract";
import { makeDocx, makePdf, makeUnicodePdf } from "./__fixtures__/cv-fixtures";
import { parseCvSections } from "./structured-parse";

/**
 * Real CV extraction tests — exercise the actual unpdf (PDF) and mammoth (DOCX)
 * parsers against synthesized-in-memory fixtures (no committed binaries). This
 * is the "PDF/DOCX must not be fake-supported" guarantee: a format only passes
 * if its real parser returns the embedded text.
 */

const SAMPLE = "Plyteliu klojimas ir suvirinimas. MIG suvirinimas. Vilnius.";

/** Narrow a Uint8Array's backing store to a concrete ArrayBuffer. */
const toAB = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("PDF extraction (unpdf)", () => {
  it("extracts text from a real PDF byte stream", async () => {
    const bytes = makePdf(SAMPLE);
    const res = await extractCvText(toAB(bytes), "cv.pdf", "application/pdf");
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.format).toBe("pdf");
      expect(res.text.toLowerCase()).toContain("suvirinimas");
    }
  });
});

describe("DOCX extraction (mammoth)", () => {
  it("extracts text from a real DOCX byte stream", async () => {
    const bytes = makeDocx(SAMPLE);
    const res = await extractCvText(
      toAB(bytes),
      "cv.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.format).toBe("docx");
      expect(res.text.toLowerCase()).toContain("plyteliu klojimas");
    }
  });
});

describe("plain text + honest failures", () => {
  it("reads a .txt file directly", async () => {
    const bytes = new TextEncoder().encode(SAMPLE);
    const res = await extractCvText(toAB(bytes), "cv.txt", "text/plain");
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.text).toContain("Vilnius");
  });

  it("rejects an unsupported format (no fake support)", async () => {
    const bytes = new TextEncoder().encode("not a cv");
    const res = await extractCvText(toAB(bytes), "photo.png", "image/png");
    expect(res.kind).toBe("unsupported");
  });

  it("reports empty when a supported file yields no text", async () => {
    const bytes = new TextEncoder().encode("   \n  ");
    const res = await extractCvText(toAB(bytes), "blank.txt", "text/plain");
    expect(res.kind).toBe("empty");
  });

  it("rejects an oversized file", async () => {
    const big = new Uint8Array(MAX_CV_BYTES + 1);
    const res = await extractCvText(toAB(big), "huge.txt", "text/plain");
    expect(res.kind).toBe("too-large");
  });

  it("fails gracefully on a corrupt PDF rather than throwing", async () => {
    const junk = new TextEncoder().encode("%PDF-1.4 broken not really a pdf");
    const res = await extractCvText(toAB(junk), "bad.pdf", "application/pdf");
    // Either a clean failure or empty — never a throw, never fabricated text.
    expect(["failed", "empty"]).toContain(res.kind);
  });
});

/**
 * Line structure survives extraction — regression for a real Living CV defect.
 *
 * `parseCvSections` splits on newlines. unpdf's `mergePages: true` does not
 * merely join pages: it collapses ALL whitespace, newlines included. With that
 * flag every PDF CV reached the section parser as ONE line, so no work-history
 * row could be proposed from any PDF — the most common CV format there is.
 *
 * The assertion is behavioural (does a job come out?), and it carries its own
 * NEGATIVE CONTROL: the same text with newlines collapsed must produce zero
 * jobs. Without that control a parser that found jobs regardless of line
 * structure would make this test pass while proving nothing.
 */
describe("extraction preserves the line structure the section parser needs", () => {
  const CV_LINES = [
    "Jonas Petraitis",
    "2019-2023 UAB Statybos meistrai, stogdengys",
    "Vilniaus technologiju mokykla, statybos programa 2015-2019",
    "Anglu kalba B2",
  ];
  const CV = CV_LINES.join("\n");

  it("PDF: lines survive, and the collapsed form provably does not", async () => {
    const res = await extractCvText(toAB(makePdf(CV)), "cv.pdf", "application/pdf");
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;

    expect(res.text.split("\n").length, "a 4-line CV must not arrive as 1 line").toBe(
      CV_LINES.length,
    );

    const parsed = parseCvSections(res.text);
    expect(parsed.workHistory.map((w) => w.title)).toContain(
      "UAB Statybos meistrai, stogdengys",
    );
    expect(parsed.education.map((e) => e.institution)).toContain(
      "Vilniaus technologiju mokykla",
    );

    // NEGATIVE CONTROL — the shape `mergePages: true` produced. If this also
    // found the job, the assertion above would be measuring nothing.
    const collapsed = parseCvSections(res.text.replace(/\s+/g, " "));
    expect(
      collapsed.workHistory,
      "collapsing newlines must destroy the work history — otherwise this test is vacuous",
    ).toHaveLength(0);
  });

  it("DOCX: each paragraph is its own line", async () => {
    const res = await extractCvText(
      toAB(makeDocx(CV)),
      "cv.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    const parsed = parseCvSections(res.text);
    expect(parsed.workHistory.map((w) => w.title)).toContain(
      "UAB Statybos meistrai, stogdengys",
    );
    expect(parsed.languages.map((l) => l.lang)).toContain("en");
  });
});

/**
 * UF-3 — production walk profile-cv-history step P-6b, run 42464955148.
 *
 * A Word CV with one paragraph per line: title / employer / period on their own
 * lines. Production showed only the employer, with no dates and low confidence.
 * The blank lines mammoth puts between paragraphs are NOT the cause (the parser
 * splits on `\n+`). The cause was the employer's name: "UAB QASYNTHETICB<run>"
 * carries an 11-digit run of digits, which the contact-line rule read as a phone
 * number, so the employer line could not join the title and the period. With
 * run id "1" the same CV parsed correctly, which is why it hid locally.
 *
 * Same path as production: the DOCX bytes, the real extraction, the parser.
 */
describe("UF-3: a one-paragraph-per-line Word CV keeps title, employer and dates", () => {
  const RUN = "42464955148";
  const company = `UAB QASYNTHETICB${RUN}`;
  const lines = [
    "Darbo patirtis",
    "Plytelių klojėjas",
    company,
    "2019 – 2023",
    "Išsilavinimas",
    "QA Synthetic rengimo centras, profesinis mokymas 2015–2017",
    "Kalbos",
    "Anglų B2, rusų gimtoji",
  ];

  it("DOCX: the job keeps its title and dates; training and languages stay right", async () => {
    const res = await extractCvText(
      toAB(makeDocx(lines.join("\n"))),
      "cv.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    const parsed = parseCvSections(res.text);

    expect(parsed.workHistory).toHaveLength(1);
    const job = parsed.workHistory[0];
    expect(job.title).toBe(`Plytelių klojėjas, ${company}`);
    expect(job.startYear).toBe(2019);
    expect(job.endYear).toBe(2023);
    expect(job.confidence).not.toBe("low");
    expect(parsed.unplaced).not.toContain("Plytelių klojėjas");

    expect(parsed.education.map((e) => e.institution)).toEqual(["QA Synthetic rengimo centras"]);
    expect(parsed.workHistory.some((w) => /rengimo centras/.test(w.title))).toBe(false);

    const level = (code: string) => parsed.languages.find((l) => l.lang === code)?.level;
    expect(level("en")).toBe("B2");
    expect(level("ru")).toBe("native");
  });

  // The test PDF uses a standard-14 font, so Lithuanian letters and the en dash
  // do not survive it; the same layout is checked in ASCII. It arrives with
  // single line breaks, and the employer rule is the same one.
  it("PDF: the same stacked layout keeps title and dates", async () => {
    const ascii = [
      "Darbo patirtis",
      "Plyteliu klojejas",
      company,
      "2019 - 2023",
      "Education",
      "QA Synthetic rengimo centras, profesinis mokymas 2015-2017",
      "Languages",
      "Anglu B2, rusu gimtoji",
    ];
    const res = await extractCvText(toAB(makePdf(ascii.join("\n"))), "cv.pdf", "application/pdf");
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    const parsed = parseCvSections(res.text);

    expect(parsed.workHistory.map((w) => [w.title, w.startYear, w.endYear])).toEqual([
      [`Plyteliu klojejas, ${company}`, 2019, 2023],
    ]);
    expect(parsed.education.map((e) => e.institution)).toEqual(["QA Synthetic rengimo centras"]);
  });

  it("a real phone number is still a contact line, never part of a job", () => {
    const parsed = parseCvSections(
      ["Darbo patirtis", "Plytelių klojėjas", "+370 612 34567", "2019 – 2023"].join("\n"),
    );
    expect(parsed.workHistory.some((w) => w.title.includes("612"))).toBe(false);
    expect(parsed.unplaced.some((u) => u.includes("612"))).toBe(false);
  });
});

/**
 * UF-3 (PDF) — Lithuanian letters survive a PDF CV, in the person's name, the
 * employer and the job title, exactly as written (NFC). The test above had to
 * fall back to ASCII because a standard-14 font cannot carry ą/č/ę/ė/į/š/ų/ū/ž;
 * these PDFs use the encodings real exporters write for them. Same path as
 * production: PDF bytes, the real unpdf extraction, the parser.
 */
describe("UF-3 (PDF): Lithuanian letters survive name, employer and title", () => {
  const NAME = "QA-SYNTHETIC Žydrūnė Ąžuolaitė";
  const COMPANY = "UAB Šiaurės Ąžuolų Statyba";
  const TITLE = "Vyresnioji įrangos montuotoja";
  const EDUCATION = "QA Synthetic Ąžuolyno rengimo centras";
  const CV = [
    NAME,
    "Darbo patirtis",
    TITLE,
    COMPANY,
    "2018 – 2024",
    "Išsilavinimas",
    `${EDUCATION}, profesinis mokymas 2015–2017`,
    "Kalbos",
    "Lietuvių gimtoji, anglų B2",
  ].join("\n");
  const LETTERS = "ąčęėįšųūžĄČĘĖĮŠŲŪŽ";

  const read = async (bytes: Uint8Array) => {
    const res = await extractCvText(toAB(bytes), "qa-synthetic-cv.pdf", "application/pdf");
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") throw new Error(`extraction: ${res.kind}`);
    return res.text;
  };

  const expectExact = (text: string) => {
    // Already composed: no combining mark (U+0300-U+036F) is left anywhere.
    expect(text).toBe(text.normalize("NFC"));
    expect(/[̀-ͯ]/.test(text)).toBe(false);
    const parsed = parseCvSections(text);
    expect(parsed.workHistory.map((w) => [w.title, w.startYear, w.endYear])).toEqual([
      [`${TITLE}, ${COMPANY}`, 2018, 2024],
    ]);
    expect(parsed.unplaced).toContain(NAME);
    expect(parsed.education.map((e) => e.institution)).toEqual([EDUCATION]);
    const level = (code: string) => parsed.languages.find((l) => l.lang === code)?.level;
    expect(level("lt")).toBe("native");
    expect(level("en")).toBe("B2");
  };

  const variants: [string, Parameters<typeof makeUnicodePdf>[1]][] = [
    ["Identity-H font with a ToUnicode map (Word / Chrome shape)", {}],
    ["text written decomposed (base letter + combining mark glyphs)", { form: "NFD" }],
    ["simple font with named glyphs (/Differences, no ToUnicode)", { encoding: "differences" }],
  ];

  for (const [label, opts] of variants) {
    it(`${label}: every letter, the name, the employer and the title come back exactly`, async () => {
      expectExact(await read(makeUnicodePdf(CV, opts)));
    });
  }

  it("all nine letters and their capitals come back one for one", async () => {
    for (const opts of [{}, { form: "NFD" as const }, { encoding: "differences" as const }]) {
      const text = await read(makeUnicodePdf(`Raidės ${LETTERS}`, opts));
      expect(text).toBe(`Raidės ${LETTERS}`);
    }
  });

  it("a decomposed DOCX or pasted text is composed too", async () => {
    const res = await extractCvText(
      toAB(makeDocx(CV.normalize("NFD"))),
      "cv.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expectExact(res.text);
    const pasted = parseCvSections(CV.normalize("NFD"));
    expect(pasted.workHistory.map((w) => w.title)).toEqual([`${TITLE}, ${COMPANY}`]);
    expect(pasted.unplaced).toContain(NAME);
  });
});
