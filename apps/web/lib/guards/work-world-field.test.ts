import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the Project Field reads with the work-world grammar — people ×
 * capacity as one CapacityBand fed only by the model's own totals, lane time
 * as a PlaceTimeStamp — while the canonical player-identity tile stays the
 * one person representation on the Field (P4 contract; no second grammar).
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const FIELD = read("components/app/project-field.tsx");

describe("Guard: the Field states capacity with the work-world grammar (FIELD_REACHABLE)", () => {
  it("people × open slots is ONE CapacityBand driven by the model's own totals", () => {
    expect(FIELD).toContain('from "@/components/app/work-world/primitives"');
    expect(FIELD).toMatch(/filled=\{field\.peopleTotal\}/);
    expect(FIELD).toMatch(/const total = field\.peopleTotal \+ field\.slotsTotal/);
    // drawn in BOTH views (the list view renders the same objects)
    expect(FIELD.match(/<FieldCapacity field=\{field\} \/>/g)?.length).toBe(2);
    // nothing to state → nothing drawn; an unavailable tasks read never draws a band
    expect(FIELD).toMatch(/if \(!field\.tasksApplied\) return null;/);
    expect(FIELD).toMatch(/if \(total === 0\) return null;/);
  });

  it("lane time is a PlaceTimeStamp (same day figures, mono)", () => {
    expect(FIELD).toMatch(/<PlaceTimeStamp>\s*\{day\(lane\.start\)\}/);
  });

  it("tokens keep the canonical player-identity tile — no second person grammar on the Field", () => {
    expect(FIELD).toMatch(/playerInitials\(token\.name\)/);
    expect(FIELD).not.toContain("PersonPresence");
  });

  it("the capacity labels exist as ICU plurals in every active locale", () => {
    for (const loc of ["en", "lt", "ru", "de", "nl"]) {
      const j = JSON.parse(read(`messages/${loc}.json`)) as { projectField: { capacity: Record<string, string> } };
      for (const k of ["people", "open"]) {
        expect(j.projectField.capacity[k], `${loc} capacity.${k}`).toMatch(/\{n, plural,/);
      }
    }
  });
});
