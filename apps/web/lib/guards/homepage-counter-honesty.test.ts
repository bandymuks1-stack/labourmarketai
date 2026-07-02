import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Homepage counter honesty guard (finding F-G1 of the full-project audit
 * 2026-07-02).
 *
 * The hero counters rotate governed placeholder cycles ("318K", "1,180",
 * "84" with animated deltas) — fabricated traction unless the visitor is
 * told. The `live.counters.previewNote` disclaimer key existed since the
 * counters shipped but was rendered NOWHERE, and the public-no-fake-claims
 * guard's `\d{2,3}\s?K\+` regex missed bare "318K" (no trailing +).
 *
 * Contract: placeholder counter cycles may exist ONLY while the component
 * visibly renders the disclaimer.
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("homepage counters carry the honesty disclaimer", () => {
  const component = read("components/app/market-counters.tsx");
  const placeholders = read("content/placeholders.ts");

  it("the component renders live.counters.previewNote", () => {
    expect(component).toMatch(/t\("previewNote"\)/);
    expect(component).toMatch(/market-counters-preview-note/);
  });

  it("bare K-value cycles exist only alongside a rendered disclaimer", () => {
    const hasBareKCycle = /"\d{2,3}K"/.test(placeholders);
    if (hasBareKCycle) {
      expect(
        component.includes('t("previewNote")'),
        "content/placeholders.ts carries bare NNN-K counter cycles but " +
          "market-counters.tsx does not render the previewNote disclaimer",
      ).toBe(true);
    }
  });

  it("the disclaimer key exists in en/lt/ru", () => {
    for (const locale of ["en", "lt", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      expect(msgs.live?.counters?.previewNote, locale).toBeTruthy();
    }
  });
});
