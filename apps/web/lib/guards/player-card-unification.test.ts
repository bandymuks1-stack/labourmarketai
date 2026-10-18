import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Player Card unification guard (full-completion train PR 1).
 *
 * The dashboard Player Card must read as the SAME premium scouting card as the
 * landing card — reusing the shared visual tokens and a status/readiness ring —
 * WITHOUT any fabricated score. The ring is an honest met/total signal gauge.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const card = read("components/app/worker-player-card.tsx");
const ring = read("components/app/readiness-ring.tsx");

describe("Player Card reuses the shared premium scouting visual language", () => {
  it("uses the shared card chrome tokens (card-border + glow)", () => {
    expect(card).toMatch(/card-border/);
    expect(card).toMatch(/bg-card-glow/);
    // Dead-UI repair (owner smoke 2026-07-05): the SECTION is not clickable,
    // so it must NOT carry a hover lift — hover affordance moved to the real
    // links inside it (stat tiles). Pinned by clickability-actionability.
    expect(card).not.toMatch(/hover:shadow-card-hover/);
  });
  it("carries NO gold confirmation trust ring; gold only as the derived provenance edge (P6)", () => {
    // The card chrome must not advertise confirmation as a badge: no gold
    // trust ring, no gold class spelled here, no gold tier. The ONE gold a
    // person may carry is the provenance EDGE (components/app/provenance),
    // whose class is DERIVED from real confirmation rows — pinned by
    // provenance-edge-derived.test.ts.
    expect(card).not.toMatch(/trust-ring/);
    expect(card).not.toMatch(/trust-accent/);
    expect(card).not.toMatch(/tier-gold/);
    expect(card).toMatch(/ProvenanceEdge/);
  });
  it("mounts the readiness status ring", () => {
    expect(card).toMatch(/ReadinessRing/);
    expect(card).toMatch(/deriveWorkerReadiness/);
  });
  it("is an app card, not a table layout", () => {
    expect(card).toMatch(/flex flex-col/);
    expect(card).not.toMatch(/<table\b/);
  });
});

describe("the readiness ring is HONEST — met/total signals, never a fake rating", () => {
  it("uses the same SVG gauge language as the landing OVR ring (animated arc)", () => {
    expect(ring).toMatch(/stroke-(brand-cyan|brand-blue|ink-500)/);
    expect(ring).toMatch(/strokeDashoffset/);
    // honest palette: readiness never borrows the reserved trust gold
    expect(ring).not.toMatch(/tier-gold/);
  });
  it("the arc fills by met/total (a real fraction), not a 0–99 score", () => {
    expect(ring).toMatch(/met\s*\/\s*total/);
    expect(ring).not.toMatch(/\/\s*99\b/); // no OVR-style 0..99 denominator
  });
  it("centre shows the met/total count, never a fabricated number", () => {
    expect(ring).toMatch(/\{met\}\/\{total\}/);
  });
  it("aria label states it is signals met, not a rating", () => {
    expect(ring).toMatch(/signals met/i);
  });
});

describe("the evidence levels stay visible but NEUTRAL (silent-trust rule)", () => {
  it("no green 'verified' glow; skills + journal-supported + declared still shown", () => {
    // The strongest signal must NOT carry a green manager-verified glow.
    expect(card).not.toMatch(/state-success/);
    // journal-supported middle rung stays (neutral cyan signal, not a badge)
    expect(card).toMatch(/journalSupportedSkills/);
    expect(card).toMatch(/brand-cyan/);
    // self-declared count still shown
    expect(card).toMatch(/skillsDeclared/);
    // skills are still listed as a neutral signal section
    expect(card).toMatch(/player-card-skill-signals/);
  });
});

describe("readiness copy exists in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: playerCard.readiness has level + pillar labels`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const r = m.playerCard.readiness;
      expect(r, `${loc} readiness`).toBeTruthy();
      for (const k of ["label", "levelReady", "levelBuilding", "levelStart", "signalsTemplate", "nextLabel"]) {
        expect(typeof r[k] === "string" && r[k].length > 0, `${loc} readiness.${k}`).toBe(true);
      }
      for (const p of ["profession", "availability", "skills", "journal", "evidence", "workCard"]) {
        expect(typeof r.pillars[p] === "string" && r.pillars[p].length > 0, `${loc} pillar ${p}`).toBe(true);
      }
    });
  }
});
