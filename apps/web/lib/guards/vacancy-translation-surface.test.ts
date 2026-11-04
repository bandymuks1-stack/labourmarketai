import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = process.cwd();
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const JOB_PAGE = "app/[locale]/(marketing)/jobs/[id]/page.tsx";
const CONTROL = "components/app/vacancy-translate-control.tsx";

/**
 * THE SURFACE SIDE of the owner's 2026-09-22 translation decision.
 *
 * Proven in a browser on the fresh build (anonymous, /lt/jobs/<id>):
 * `[data-testid="vacancy-translate"]` count 0, and the board rendered
 * Swedish publisher titles under Lithuanian product chrome. These pin the
 * properties that walk proved, so the next change cannot quietly undo them.
 */
describe("only a signed-in person can ask for a translation", () => {
  /**
   * A PUBLIC PAGE MUST NOT BE ABLE TO SPEND MONEY. /jobs/[id] is crawlable.
   * The control lives inside the `member ?` branch, so an anonymous visitor
   * (and every crawler) receives no affordance at all — verified anonymously
   * against the built app before this was written.
   */
  it("the translate control sits inside the member-only branch", () => {
    const src = read(JOB_PAGE);
    const memberBranch = src.indexOf("{member ? (");
    const control = src.indexOf("<VacancyTranslateControl");
    expect(memberBranch).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(memberBranch);
  });

  it("the server action refuses a caller with no session", () => {
    const src = read("lib/vacancy-store/vacancy-translation-action.ts");
    expect(src).toContain('if (!entitlements.profileId) return { kind: "signed_out" };');
    // Identity is never taken from the caller's arguments.
    expect(src).not.toMatch(/profileId:\s*(input|args|params)\./);
  });
});

describe("the publisher's words never leave the page", () => {
  it("the original description renders independently of any rendering", () => {
    const src = read(JOB_PAGE);
    // The original body is its own section, not a fallback inside the
    // translated one — a rendering ADDS, it never replaces.
    expect(src).toContain("{member.descriptionRaw}");
    const control = src.indexOf("<VacancyTranslateControl");
    const original = src.indexOf("{member.descriptionRaw}");
    expect(original).toBeGreaterThan(control);
  });

  it("the advertisement's own language is always named for a foreign ad", () => {
    const src = read(JOB_PAGE);
    expect(src).toContain("vacancySources.language.originalIn");
    expect(src).toContain('data-testid="vacancy-source-language"');
  });

  it("a rendering is always labelled as a machine rendering", () => {
    expect(read(CONTROL)).toContain("labels.machineNote");
  });
});

describe("no technical enum and no invented figure reaches a screen", () => {
  it("every outcome is rendered through a translated label", () => {
    const src = read(CONTROL);
    // The reason codes exist in the contract but are never printed raw.
    for (const raw of ["no_provider", "rate_limited", "refused"]) {
      expect(src).not.toContain(`>{"${raw}"}`);
      expect(src).not.toContain(`{result.reason}`);
    }
  });

  it("the remaining figure renders only when the server returned a real one", () => {
    const src = read(CONTROL);
    // SEP-7: an unknown count renders nothing, never a comforting zero.
    expect(src).toContain('typeof result.remaining === "number"');
    expect(src).not.toMatch(/remaining\s*\?\?\s*0/);
  });
});

describe("the copy exists, in every served locale, as real sentences", () => {
  const LOCALES = ["en", "lt", "ru", "nl", "de", "pl"] as const;
  const KEYS = [
    "translate",
    "translating",
    "allowanceRemaining",
    "allowanceExhausted",
    "unavailable",
    "signedOut",
  ] as const;

  it("every locale carries every key", () => {
    for (const loc of LOCALES) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as Record<string, never>;
      const lang = (m as unknown as {
        vacancySources: { language: Record<string, string> };
      }).vacancySources.language;
      for (const k of KEYS) {
        expect(typeof lang[k], `${loc}.${k}`).toBe("string");
        expect(lang[k].trim().length, `${loc}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("no non-English locale ships the English sentence verbatim", () => {
    const en = (JSON.parse(read("messages/en.json")) as unknown as {
      vacancySources: { language: Record<string, string> };
    }).vacancySources.language;
    for (const loc of LOCALES.filter((l) => l !== "en")) {
      const lang = (JSON.parse(read(`messages/${loc}.json`)) as unknown as {
        vacancySources: { language: Record<string, string> };
      }).vacancySources.language;
      for (const k of KEYS) {
        expect(lang[k], `${loc}.${k} is still English`).not.toBe(en[k]);
      }
    }
  });
});
