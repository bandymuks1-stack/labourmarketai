/**
 * WORKER PLAYER-CARD — available-from surfacing guard (Step 5).
 *
 * The worker's own player-card now shows their `available_from` date next to
 * the availability status. It must stay REAL (sourced from card.availableFrom,
 * never fabricated), localized (LT/EN/RU), and gated (hidden when no date).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/[^\n]*/g, " ");

describe("available-from is real, gated, localized", () => {
  it("labels builder derives it only from real card.availableFrom + a localized key", () => {
    const src = code(read("lib/player-card/labels.ts"));
    expect(src).toMatch(/availabilityFrom:\s*card\.availableFrom/);
    expect(src).toMatch(/t\("availabilityFrom"/);
    // no hardcoded date words / fabrication
    expect(src).not.toMatch(/"Available from|"Laisvas nuo|"Доступен/);
  });

  it("the card renders it behind a truthy guard (hidden when absent)", () => {
    const src = code(read("components/app/worker-player-card.tsx"));
    expect(src).toMatch(/labels\.availabilityFrom\s*\?/);
    expect(src).toMatch(/player-card-available-from/);
  });

  it("i18n key present in all active locales with a {date} placeholder, no [EN]", () => {
    for (const loc of ["en", "lt", "ru"] as const) {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        playerCard?: { availabilityFrom?: string };
      };
      const v = j.playerCard?.availabilityFrom;
      expect(v, `${loc} missing playerCard.availabilityFrom`).toBeTruthy();
      expect(v).toContain("{date}");
      expect(v).not.toContain("[EN]");
    }
  });
});
