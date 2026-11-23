import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { foldText } from "@/lib/structuring/normalize";

/**
 * ONE TEXT FOLD FOR MATCHING (owner P0 2026-11-23, #3679; SIMPLIFICATION_PLAN
 * M9, DUPLICATION_AUDIT AI-10).
 *
 * Six readers had private `fold()` copies that removed accents but not the
 * letters that do not decompose: ł, ø, ß, æ, œ, đ, ð, þ. So one word matched
 * in one reader and not in the next. They now share `foldText`
 * (`lib/structuring/normalize.ts`).
 *
 * Other files still strip accents themselves. Some do it on purpose: they also
 * strip punctuation, or they are an index with its own contract. Their list is
 * a ratchet. It may only shrink, and a new file with its own accent strip fails.
 */

const WEB = join(__dirname, "..", "..");

const MOVED_TO_FOLD_TEXT = [
  "lib/conversation/correct-work-model.ts",
  "lib/conversation/language-statement.ts",
  "lib/conversation/past-work-period.ts",
  "lib/conversation/pay-statement.ts",
  "lib/conversation/project-mention.ts",
  "lib/journal/org-mention.ts",
] as const;

/** Files that still strip accents locally, on main 2026-11-23. Shrink only. */
const KNOWN_LOCAL_ACCENT_STRIPS: readonly string[] = [
  "lib/structuring/normalize.ts", // `foldText` itself
  "components/app/onboarding-wizard.tsx",
  "components/ui/DarkListbox.tsx",
  "lib/ai/evals/harness.ts",
  "lib/communication/person-name-match.ts",
  "lib/conversation/compound-statement.ts",
  "lib/conversation/intent-router.ts",
  "lib/crm/pipeline-model.ts",
  "lib/location/country-model.ts",
  "lib/navigation/command-registry.ts",
  "lib/organization-evidence/parse-tabular.ts",
  "lib/organization-evidence/time-semantics.ts",
  "lib/organization-evidence/work-context.ts",
  "lib/planning/week-question.ts",
  "lib/player-card/card-mode-from-text.ts",
  "lib/projects/operations-report.ts",
  "lib/timesheet-import/resolve-entities.ts",
  "lib/vacancy-store/public-vacancy-profession-match.ts",
];

const NFD_STRIP = /normalize\(\s*["']NFD["']\s*\)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const WITH_LOCAL_STRIP = ["app", "lib", "components"]
  .flatMap((d) => walk(join(WEB, d)))
  .map((p) => relative(WEB, p))
  .filter((rel) => !rel.includes("/guards/") && NFD_STRIP.test(readFileSync(join(WEB, rel), "utf8")))
  .sort();

describe("one text fold for matching (AI-10)", () => {
  it("the six readers use foldText and keep no private fold", () => {
    for (const rel of MOVED_TO_FOLD_TEXT) {
      const src = readFileSync(join(WEB, rel), "utf8");
      expect(src, `${rel} imports foldText`).toMatch(
        /import\s*\{[^}]*\bfoldText\b[^}]*\}\s*from\s*"@\/lib\/structuring\/normalize"/,
      );
      expect(/function\s+fold\s*\(/.test(src), `${rel} defines no private fold()`).toBe(false);
    }
  });

  it("foldText folds the letters the private copies missed", () => {
    expect(foldText("Łotewski")).toBe("lotewski");
    expect(foldText("zł")).toBe("zl");
    expect(foldText("Straße")).toBe("strasse");
    expect(foldText("Øresund")).toBe("oresund");
    expect(foldText("Šiandien")).toBe("siandien");
  });

  it("no new file strips accents on its own; the known list only shrinks", () => {
    const unexpected = WITH_LOCAL_STRIP.filter((rel) => !KNOWN_LOCAL_ACCENT_STRIPS.includes(rel));
    expect(unexpected, "Use foldText from lib/structuring/normalize.ts instead of a private accent strip.").toEqual([]);
    const stale = KNOWN_LOCAL_ACCENT_STRIPS.filter((rel) => !WITH_LOCAL_STRIP.includes(rel));
    expect(stale, "Remove these from KNOWN_LOCAL_ACCENT_STRIPS: they no longer strip accents locally.").toEqual([]);
  });
});
