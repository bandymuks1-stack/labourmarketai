import { describe, expect, it } from "vitest";
import { resolveCity, resolveLocation, COUNTRY_CENTROID } from "./city-coordinates";

/**
 * Map city precision (owner UX smoke). A manually-entered city must place the
 * marker at CITY-level coordinates — not the country centroid and never a
 * silently-wrong nearby city. Country-only stays approximate; an unknown city
 * resolves to "unset" (UI asks to confirm), never a guessed point.
 */

describe("resolveCity — city-level coordinates", () => {
  it("Hilversum, NL → near Hilversum (NOT the NL centroid)", () => {
    const c = resolveCity("NL", "Hilversum");
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(52.2236, 2);
    expect(c!.lng).toBeCloseTo(5.1761, 2);
    // And clearly different from the NL country centroid.
    const dLat = Math.abs(c!.lat - COUNTRY_CENTROID.NL.lat);
    const dLng = Math.abs(c!.lng - COUNTRY_CENTROID.NL.lng);
    expect(dLat + dLng).toBeGreaterThan(0.1);
  });

  it("works with extra words and case ('hilversum, Noord-Holland')", () => {
    expect(resolveCity("NL", "hilversum, Noord-Holland")).not.toBeNull();
  });

  it("normalizes local/EN names", () => {
    expect(resolveCity("NL", "Den Haag")).toEqual(resolveCity("NL", "The Hague"));
    expect(resolveCity("DE", "München")).toEqual(resolveCity("DE", "Munich"));
    expect(resolveCity("DE", "Köln")).toEqual(resolveCity("DE", "Cologne"));
    expect(resolveCity("DK", "København")).toEqual(resolveCity("DK", "Copenhagen"));
    expect(resolveCity("SE", "Göteborg")).toEqual(resolveCity("SE", "Gothenburg"));
    expect(resolveCity("PL", "Warszawa")).toEqual(resolveCity("PL", "Warsaw"));
  });

  it("LT cities resolve with and without diacritics", () => {
    expect(resolveCity("LT", "Šiauliai")).toEqual(resolveCity("LT", "siauliai"));
    expect(resolveCity("LT", "Vilnius")!.lat).toBeCloseTo(54.6872, 2);
  });

  it("unknown city → null (no wrong-city fallback)", () => {
    expect(resolveCity("NL", "Nowheresville")).toBeNull();
    expect(resolveCity("LT", "")).toBeNull();
    expect(resolveCity(null, "Vilnius")).toBeNull();
  });

  it("a city in the WRONG country does not resolve", () => {
    // "Amsterdam" is not a LT city in the table.
    expect(resolveCity("LT", "Amsterdam")).toBeNull();
  });
});

describe("resolveLocation — coordinate + honest precision", () => {
  it("device geolocation → exact device precision", () => {
    const r = resolveLocation({ source: "auto", lat: 54.69, lng: 25.28, country: null, region: null });
    expect(r.precision).toBe("device");
    expect(r.coord).toEqual({ lat: 54.69, lng: 25.28 });
  });

  it("manual city (Hilversum, NL) → city precision at Hilversum", () => {
    const r = resolveLocation({ source: "manual", lat: null, lng: null, country: "NL", region: "Hilversum" });
    expect(r.precision).toBe("city");
    expect(r.coord!.lat).toBeCloseTo(52.2236, 2);
  });

  it("country-only → approximate country precision (not a precise city marker)", () => {
    const r = resolveLocation({ source: "manual", lat: null, lng: null, country: "NL", region: null });
    expect(r.precision).toBe("country");
    expect(r.coord).toEqual(COUNTRY_CENTROID.NL);
  });

  it("manual city that is unknown → unset (no guessed marker)", () => {
    const r = resolveLocation({ source: "manual", lat: null, lng: null, country: "NL", region: "Nowheresville" });
    expect(r.precision).toBe("unset");
    expect(r.coord).toBeNull();
  });

  it("nothing set → unset", () => {
    expect(resolveLocation({ source: "manual", lat: null, lng: null, country: null, region: null }).precision).toBe("unset");
    expect(resolveLocation(null).precision).toBe("unset");
  });
});
