import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Profile / capability flow clarity (train priority 2). The user must clearly
 * see, with honest (never-fake-verified) framing: their saved text, found
 * suggestions, a clear empty/no-new state, and an explicit post-save state that
 * the claim is self-declared and still needs external confirmation. Pins the
 * states + the LT/EN labels so the flow can't silently lose clarity or start
 * claiming fake verification.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const flow = read("components/app/profile-text-first-flow.tsx");

describe("profile flow renders each clarity state", () => {
  it("shows a saved-text indicator (honest: claim not verified)", () => {
    expect(flow).toMatch(/t\("textSavedLabel"\)/);
    expect(flow).toMatch(/t\("textClaimNotVerified"\)/);
  });
  it("shows found suggestions + honest empty / no-new states", () => {
    expect(flow).toMatch(/DetectedSuggestionList/);
    expect(flow).toMatch(/t\("noSuggestionsFallback"\)/);
    expect(flow).toMatch(/t\("noNewSuggestions"\)/);
  });
  it("shows an explicit post-save state (self-declared, needs external confirmation)", () => {
    expect(flow).toMatch(/t\("savedToCapabilities"\)/);
    expect(flow).toMatch(/t\("needsExternalConfirmation"\)/);
  });
});

describe("the flow never claims fake/auto/AI verification", () => {
  it("post-save copy stays self-declared, not 'verified' / 'AI' / 'matched'", () => {
    for (const locale of ["lt", "en"] as const) {
      const tf = (JSON.parse(read(`messages/${locale}.json`)) as {
        skills: { textFirst: Record<string, string> };
      }).skills.textFirst;
      const blob = [tf.textClaimNotVerified, tf.needsExternalConfirmation, tf.savedToCapabilities]
        .join(" ")
        .toLowerCase();
      // The honest framing must be present (silent-trust rule: neutral
      // work-record wording, never certification or external-review framing)…
      expect(blob).toMatch(
        locale === "lt" ? /darbo įraš|įraš/ : /work records|records/,
      );
      // …and it must not assert AI / automatic / guaranteed verification.
      expect(blob).not.toMatch(/\bai[- ]verif|automatically verified|guaranteed|automati[šks]+kai patvirtinta/i);
    }
  });
});

describe("the clarity labels exist in LT + EN", () => {
  const KEYS = [
    "textSavedLabel",
    "textClaimNotVerified",
    "noSuggestionsFallback",
    "noNewSuggestions",
    "savedToCapabilities",
    "confirmedByYou",
    "addedToProfile",
    "needsExternalConfirmation",
  ];
  for (const locale of ["lt", "en"] as const) {
    it(`${locale} skills.textFirst has every clarity key`, () => {
      const tf = (JSON.parse(read(`messages/${locale}.json`)) as {
        skills: { textFirst: Record<string, string> };
      }).skills.textFirst;
      for (const k of KEYS) expect(tf[k], `${locale} skills.textFirst.${k}`).toBeTruthy();
    });
  }
});
