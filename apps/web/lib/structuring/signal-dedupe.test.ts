import { describe, expect, it } from "vitest";
import {
  dedupeSignalsByLabel,
  normalizeSignalLabel,
} from "@/lib/structuring/signal-dedupe";

describe("normalizeSignalLabel", () => {
  it("lowercases, trims, collapses whitespace", () => {
    expect(normalizeSignalLabel("  Mūrijimas  ")).toBe("mūrijimas");
    expect(normalizeSignalLabel("Programavimas / kodas")).toBe(
      "programavimas / kodas",
    );
    expect(normalizeSignalLabel("Linked   skill")).toBe("linked skill");
  });
});

describe("dedupeSignalsByLabel — one concept = one visible signal", () => {
  it("drops a new-skill chip already shown as a fragment label", () => {
    // The mixed-example shape: fragments produced "Mūrijimas" + "Programavimas";
    // the new-skill bucket also proposes both → both must be dropped.
    const newSkills = [
      { slug: "claim:programavimas", name: "Programavimas" },
      { slug: "bricklaying", name: "Mūrijimas" },
      { slug: "claim:derybos", name: "Komunikacija" },
    ];
    const fragmentLabels = ["Programavimas", "Mūrijimas"];
    const out = dedupeSignalsByLabel(newSkills, fragmentLabels);
    expect(out.map((s) => s.name)).toEqual(["Komunikacija"]);
  });

  it("collapses a localized-label twin to a single concept", () => {
    // Two paths describe the same concept with the SAME localized label
    // (because slugs always resolve to an LT name — no raw 'bricklaying').
    const items = [
      { slug: "bricklaying", name: "Mūrijimas" },
      { slug: "claim:murijimas", name: "Mūrijimas" },
    ];
    const out = dedupeSignalsByLabel(items);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Mūrijimas");
  });

  it("never emits a raw English slug as a visible label", () => {
    // Guard the invariant the composer relies on: every emitted label is a
    // human label, not a slug token. (Slugs use [a-z-] with no spaces/caps.)
    const items = [
      { slug: "bricklaying", name: "Mūrijimas" },
      { slug: "claim:web", name: "Interneto svetainės dizainas" },
    ];
    for (const s of dedupeSignalsByLabel(items)) {
      expect(/^[a-z][a-z0-9-]*$/.test(s.name), `${s.name} looks like a slug`).toBe(false);
    }
  });

  it("preserves order, first occurrence wins, ignores empty labels", () => {
    const items = [
      { slug: "a", name: "Alpha" },
      { slug: "b", name: "  " },
      { slug: "c", name: "alpha" },
      { slug: "d", name: "Beta" },
    ];
    expect(dedupeSignalsByLabel(items).map((s) => s.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });
});
