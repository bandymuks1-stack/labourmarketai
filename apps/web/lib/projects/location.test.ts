import { describe, expect, it } from "vitest";
import { deriveProjectLocation, formatProjectPlace } from "./location";

/**
 * systemic-ux-project-v1 — honest project location status, no fake markers.
 */
describe("deriveProjectLocation", () => {
  it("no city/country → missing, not mappable", () => {
    const l = deriveProjectLocation({});
    expect(l.status).toBe("missing");
    expect(l.mappable).toBe(false);
  });

  it("city/country text but no coords → text_only, never mappable", () => {
    const l = deriveProjectLocation({ city: "Vilnius", country: "Lietuva" });
    expect(l.status).toBe("text_only");
    expect(l.mappable).toBe(false);
    expect(formatProjectPlace(l)).toBe("Vilnius, Lietuva");
  });

  it("coords present but geocode pending → unverified, NOT mappable (no fake marker)", () => {
    const l = deriveProjectLocation({
      city: "Vilnius",
      latitude: 54.6,
      longitude: 25.2,
      geocodeStatus: "pending",
    });
    expect(l.status).toBe("unverified");
    expect(l.mappable).toBe(false);
  });

  it("verified coords → verified + mappable", () => {
    const l = deriveProjectLocation({
      city: "Vilnius",
      latitude: 54.6,
      longitude: 25.2,
      geocodeStatus: "verified",
    });
    expect(l.status).toBe("verified");
    expect(l.mappable).toBe(true);
  });

  it("blank strings are treated as no text", () => {
    const l = deriveProjectLocation({ city: "  ", country: "" });
    expect(l.status).toBe("missing");
    expect(formatProjectPlace(l)).toBeNull();
  });
});
