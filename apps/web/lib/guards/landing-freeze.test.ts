import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FROZEN_LANDING_FILES,
  FROZEN_LANDING_NAMESPACES,
  FROZEN_LOCALES,
  computeLandingFreezeSnapshot,
  type LandingFreezeSnapshot,
} from "./landing-freeze";

/**
 * Landing freeze guard (owner directive, non-landing launch repair v1).
 *
 * The landing page is frozen until its real-data replacement plan runs. This
 * test proves — on every CI run — that the landing page file, every component
 * in its render tree, the placeholder feed and the landing i18n namespaces
 * (lt/en/ru) are byte-identical to the committed baseline. It catches both
 * direct edits and indirect drift through shared components or message keys.
 *
 * If this test fails, the change touched the landing. Revert it. Do NOT
 * regenerate the baseline unless the change is part of the explicit,
 * owner-approved landing plan (see scripts/generate-landing-freeze-baseline.ts).
 */

const webRoot = join(__dirname, "..", "..");
const baseline = JSON.parse(
  readFileSync(join(__dirname, "landing-freeze-baseline.json"), "utf8"),
) as LandingFreezeSnapshot;

describe("landing freeze", () => {
  const current = computeLandingFreezeSnapshot(webRoot);

  it("baseline covers exactly the declared frozen file set", () => {
    expect(Object.keys(baseline.files).sort()).toEqual(
      [...FROZEN_LANDING_FILES].sort(),
    );
    expect(Object.keys(baseline.namespaces).sort()).toEqual(
      FROZEN_LOCALES.flatMap((l) =>
        FROZEN_LANDING_NAMESPACES.map((ns) => `${l}.${ns}`),
      ).sort(),
    );
  });

  it("no frozen landing file has drifted from the baseline", () => {
    const drifted = Object.entries(baseline.files)
      .filter(([rel, hash]) => current.files[rel] !== hash)
      .map(([rel]) => rel);
    expect(drifted).toEqual([]);
  });

  it("no frozen landing i18n namespace has drifted (lt/en/ru)", () => {
    const drifted = Object.entries(baseline.namespaces)
      .filter(([key, hash]) => current.namespaces[key] !== hash)
      .map(([key]) => key);
    expect(drifted).toEqual([]);
  });
});
