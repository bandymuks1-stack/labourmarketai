import { describe, it, expect } from "vitest";
import {
  buildEntrySkillReview,
  acceptedLabels,
  type ReviewDecision,
} from "./entry-skill-review";

describe("entry skill review model", () => {
  it("construction entry → reviewable items + both durations + 50 m2", () => {
    const r = buildEntrySkillReview(
      "Šiandien tinkavo 50 m2 sienos, keitė stogo sijas 3 valandas ir klojo čerpes 4 h",
    );
    expect(r.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(["Sienų tinkavimas", "Čerpių klojimas / stogo dangos darbai"]),
    );
    expect(r.durations.map((d) => d.value)).toEqual([3, 4]);
    expect(r.quantities[0]).toEqual({ value: 50, unit: "m2", raw: "50 m2" });
    expect(r.items.every((i) => i.confirmed === false && i.status === "suggested")).toBe(true);
  });

  it("cleaning entry → cleaning items, never carpentry", () => {
    const r = buildEntrySkillReview("Valėme biuro patalpas 6 val., plovėme langus");
    expect(r.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(["Patalpų valymas", "Langų valymas"]),
    );
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/carpent|staliaus/);
  });

  it("unknown skill → unmapped review phrase, no invented item", () => {
    const r = buildEntrySkillReview("Kalibravau spektrometrą");
    expect(r.items).toEqual([]);
    expect(r.unmapped.length).toBeGreaterThan(0);
  });

  it("vague entry → needs more detail, nothing invented", () => {
    const r = buildEntrySkillReview("Dirbom objekte");
    expect(r.items).toEqual([]);
    expect(r.unmapped).toEqual([]);
    expect(r.needsMoreDetail).toBe(true);
  });

  it("acceptedLabels returns only accepted items (accept vs ignore vs pending)", () => {
    const r = buildEntrySkillReview("Montavome kabelius, jungėme elektros skydą ir tikrinome įtampą");
    const ids = r.items.map((i) => i.id);
    const decisions: Record<string, ReviewDecision> = {
      [ids[0]]: "accepted",
      [ids[1]]: "ignored",
      [ids[2]]: "pending",
    };
    const accepted = acceptedLabels(r.items, decisions);
    expect(accepted).toEqual([r.items[0].label]);
  });
});