import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE DASHBOARD MAY NOT CONTRADICT ITSELF, AND A GAP MUST NAME ITSELF
 * (owner window 11 §24, from a production walk on 2026-09-07).
 *
 * What the owner saw, all three at once, on `/lt/dashboard`:
 *
 *   "Viskas, kas svarbiausia, jau nurodyta."     ← readiness pillars
 *   "Laukia nurodymų: 1."                        ← instructions
 *   "Trūksta 9 dokumentų jūsų šalims."           ← documents
 *
 * TWO DISTINCT DEFECTS, not one wording problem.
 *
 * 1. AN UNBOUNDED CLAIM OVER A BOUNDED SET. "Everything that matters is
 *    already set" was only ever true of the six readiness pillars. The set it
 *    counted was invisible in the sentence, so the sentence read as a claim
 *    about the whole space — and the two lines beside it contradicted it.
 *    The fix is not softer words: it is naming and COUNTING the set.
 *
 * 2. A COUNT WHERE THE PRODUCT HELD THE ANSWER. `deriveDocumentGap` returns
 *    `documentTypeSlug`, `country`, `requirementLevel`, `sourceTitle` and
 *    `sourceUrl` per missing row, and `runDocumentsReadiness` renders all of
 *    them. The opening brief read the SAME derivation and printed the length
 *    of the array. That is SEP-8 in one line: the data existed, was reachable,
 *    and was not correctly interpreted for the person reading it.
 */

const APP = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

const catalog = (loc: string) =>
  JSON.parse(readFileSync(join(APP, "messages", `${loc}.json`), "utf8")) as Record<
    string,
    never
  >;

const at = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);

describe("a completion claim states the set it counts", () => {
  for (const loc of ACTIVE) {
    it(`[${loc}] the readiness completion line is quantified, not universal`, () => {
      const value = at(catalog(loc), "personalWorkspace.readiness.complete");
      expect(typeof value).toBe("string");
      const s = value as string;
      // The count placeholder is what makes the claim bounded. A sentence
      // without it is a claim about everything, which is the defect.
      expect(s, "the completion line must count what it is claiming").toContain("{count}");
      expect(s.length).toBeGreaterThan(20);
    });
  }

  it("the label resolver actually supplies the count", () => {
    const src = readFileSync(join(APP, "lib", "workspace", "personal-workspace-labels.ts"), "utf8");
    expect(src).toMatch(/readiness\.complete",\s*\{\s*count:/);
    // Derived from the pillar list itself, so the number can never drift from
    // the pillars the same block renders above it.
    expect(src).toMatch(/count:\s*PILLAR_KEYS\.length/);
  });
});

describe("the opening brief names the documents it counts", () => {
  const BRIEF = readFileSync(join(APP, "lib", "conversation", "opening-brief.ts"), "utf8");

  for (const loc of ACTIVE) {
    it(`[${loc}] the document line carries the list, not just the number`, () => {
      const value = at(catalog(loc), "conversation.chat.briefDocumentsMissing");
      expect(typeof value).toBe("string");
      const s = value as string;
      expect(s, "the line must name WHICH documents").toContain("{list}");
      expect(s, "the line must still say how many").toContain("{count");
    });
  }

  it("the list is built from the ONE canonical grouping, not a second one", () => {
    // `groupMissingDocumentsByType` is the same helper `runDocumentsReadiness`
    // uses. Two independent renderings of the same gap would eventually
    // disagree, and the person would have no way to tell which was right.
    expect(BRIEF).toMatch(/groupMissingDocumentsByType/);
    expect(BRIEF).toMatch(/DOCUMENT_GAP_LINE_CAP/);
    expect(BRIEF).toMatch(/briefDocumentsMissing",\s*\{\s*count:[^}]*list\s*\}/);
  });

  it("country codes are rendered as country NAMES, never raw codes", () => {
    expect(BRIEF).toMatch(/countryNames\./);
  });

  it("the line is still withheld when the person has stated no country", () => {
    // The honesty rule that already held and must keep holding: no stated
    // country means no requirement to report, never a guessed one.
    expect(BRIEF).toMatch(/docGap\.countries\.length > 0/);
  });
});

/**
 * A NOTIFICATION SAYS WHEN, AND IN WHICH CONTEXT (owner window 11 §28).
 *
 * Production showed the owner two rows reading exactly
 * "Darbuotojas pareiškė susidomėjimą jūsų poreikiu" and nothing else — no
 * time, no market, no way to tell them apart. Both facts were already
 * present: `created_at` travelled all the way into the panel component
 * unrendered, and `/dashboard/activity` has printed it for the same rows
 * since completion v1. The bell was simply the weaker of two surfaces
 * reading one source.
 *
 * What is still NOT answered, and is recorded rather than implied: WHICH
 * need and WHICH worker. That needs an authorized read of the entity behind
 * the event, and `SAFE_METADATA_KEYS` deliberately admits no free text.
 */
describe("the bell renders the facts the stored row already carries", () => {
  const PANEL = readFileSync(join(APP, "components", "app", "notification-panel.tsx"), "utf8");
  const SPINE = readFileSync(join(APP, "lib", "notifications", "spine.ts"), "utf8");
  const STREAM = readFileSync(join(APP, "components", "app", "spine-stream.tsx"), "utf8");
  const ACTIVITY = readFileSync(
    join(APP, "app", "[locale]", "dashboard", "activity", "page.tsx"),
    "utf8",
  );

  it("the durable feed carries the row's safe metadata to the client", () => {
    expect(SPINE).toMatch(/metadata: e\.metadata/);
    expect(STREAM).toMatch(/payload: \{ \.\.\.d\.metadata \}/);
  });

  it("the bell prints the event time, as the activity page already does", () => {
    const timeShape = /created_at.*slice\(0, 16\)\.replace\("T", " "\)/;
    expect(ACTIVITY, "the activity page is the reference rendering").toMatch(timeShape);
    expect(PANEL, "the bell must not be the weaker surface").toMatch(timeShape);
  });

  it("a derived signal, which has no event time, prints none", () => {
    // `spine-signals.ts` sets `created_at: ""` on purpose. Printing "" as a
    // date, or substituting now(), would be SEP-7: UNKNOWN rendered as a fact.
    expect(readFileSync(join(APP, "lib", "notifications", "spine-signals.ts"), "utf8")).toMatch(
      /created_at: ""/,
    );
    expect(PANEL).toMatch(/n\.created_at \?/);
  });

  it("the market context is a country NAME, never the raw code or a raw enum", () => {
    expect(PANEL).toMatch(/countryNames\.\$\{country\}/);
    expect(PANEL).toMatch(/tTypes\.has\(n\.type\)/);
  });
});
