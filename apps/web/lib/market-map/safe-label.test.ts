import { describe, expect, it } from "vitest";

import { MARKET_LABEL_MAX, safeMarketLabel } from "./safe-label";

describe("safeMarketLabel", () => {
  it("keeps an ordinary role as typed", () => {
    expect(safeMarketLabel("Tile setters")).toBe("Tile setters");
    expect(safeMarketLabel("20 welders for the Kaunas site")).toBe("20 welders for the Kaunas site");
  });

  it("removes an e-mail address", () => {
    expect(safeMarketLabel("Electricians, write to jonas@firma.lt")).toBe("Electricians, write to");
    expect(safeMarketLabel("jonas@firma.lt")).toBeNull();
  });

  it("removes phone numbers but not head-counts", () => {
    expect(safeMarketLabel("Plumbers +370 600 12345")).toBe("Plumbers");
    expect(safeMarketLabel("call 8 600 12345 plumbers")).toBe("plumbers");
    expect(safeMarketLabel("12 plumbers")).toBe("12 plumbers");
  });

  it("removes URLs, bare domains and handles", () => {
    expect(safeMarketLabel("Roofers https://firma.lt/jobs")).toBe("Roofers");
    expect(safeMarketLabel("Roofers www.firma.lt")).toBe("Roofers");
    expect(safeMarketLabel("Roofers firma.lt")).toBe("Roofers");
    expect(safeMarketLabel("Roofers @jonas_roofs")).toBe("Roofers");
  });

  it("removes a contact word left dangling", () => {
    expect(safeMarketLabel("Painters whatsapp: +370 600 12345")).toBe("Painters");
  });

  it("keeps only the first line", () => {
    expect(safeMarketLabel("Carpenters\nphone 600 12345")).toBe("Carpenters");
  });

  it("returns null when nothing sayable is left", () => {
    expect(safeMarketLabel("")).toBeNull();
    expect(safeMarketLabel("   ")).toBeNull();
    expect(safeMarketLabel("+370 600 12345")).toBeNull();
    expect(safeMarketLabel(null)).toBeNull();
    expect(safeMarketLabel(undefined)).toBeNull();
  });

  it("bounds the length on a word boundary with an ellipsis", () => {
    const out = safeMarketLabel("Experienced industrial electricians for a long running multi site programme");
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(MARKET_LABEL_MAX + 1);
    expect(out!.endsWith("…")).toBe(true);
  });

  it("is safe for non-Latin scripts", () => {
    expect(safeMarketLabel("Плиточники, тел. +370 600 12345")).toBe("Плиточники");
    expect(safeMarketLabel("Plytelių klojėjai")).toBe("Plytelių klojėjai");
  });
});
