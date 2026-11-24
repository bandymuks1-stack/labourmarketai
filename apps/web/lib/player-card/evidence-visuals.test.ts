import { describe, expect, it } from "vitest";

import {
  deriveEvidenceTimeline,
  deriveSkillEvidence,
  deriveWorkHistoryTimeline,
  hasEvidenceToPlot,
} from "./evidence-visuals";
import type { WorkHistoryEntry } from "./work-history-model";

const NOW = new Date("2026-07-30T12:00:00.000Z");

/** Explicit `null` overrides must survive — a `??` default would silently
 *  restore the value the test is trying to remove. */
const engagement = (o: Partial<WorkHistoryEntry> = {}): WorkHistoryEntry => ({
  id: "e1",
  title: null,
  organizationName: "Restoranas",
  relationshipSlug: "employee",
  kind: "employment",
  startedAt: "2025-03-01",
  endedAt: null,
  current: true,
  countryCode: "LT",
  ...o,
});

describe("deriveEvidenceTimeline — real months, real zeros", () => {
  it("returns exactly the requested number of consecutive months, newest last", () => {
    const t = deriveEvidenceTimeline([], NOW, 12);
    expect(t).toHaveLength(12);
    expect(t[11].month).toBe("2026-07");
    expect(t[0].month).toBe("2025-08");
    // ascending, no gaps
    for (let i = 1; i < t.length; i += 1) {
      expect(t[i].month > t[i - 1].month).toBe(true);
    }
  });

  it("counts real entries into their real month and leaves other months at zero", () => {
    const t = deriveEvidenceTimeline(
      [
        "2026-07-01T08:00:00Z",
        "2026-07-29T23:59:59Z",
        "2026-05-15T10:00:00Z",
      ],
      NOW,
    );
    const by = new Map(t.map((m) => [m.month, m.entries]));
    expect(by.get("2026-07")).toBe(2);
    expect(by.get("2026-05")).toBe(1);
    expect(by.get("2026-06")).toBe(0); // a real zero, never smoothed
  });

  it("ignores entries outside the window instead of folding them into the edge", () => {
    const t = deriveEvidenceTimeline(["2019-01-01T00:00:00Z"], NOW);
    expect(t.reduce((n, m) => n + m.entries, 0)).toBe(0);
  });

  it("ignores unparseable timestamps rather than inventing a bucket", () => {
    const t = deriveEvidenceTimeline(["not-a-date"], NOW);
    expect(t.reduce((n, m) => n + m.entries, 0)).toBe(0);
  });

  it("hasEvidenceToPlot is false only when every month is genuinely zero", () => {
    expect(hasEvidenceToPlot(deriveEvidenceTimeline([], NOW))).toBe(false);
    expect(
      hasEvidenceToPlot(deriveEvidenceTimeline(["2026-07-02T00:00:00Z"], NOW)),
    ).toBe(true);
  });
});

describe("deriveSkillEvidence — counts of own rows, never a score", () => {
  it("counts real journal links per skill and sorts by evidence", () => {
    const bars = deriveSkillEvidence(
      [{ slug: "cooking" }, { slug: "cooking" }, { slug: "cleaning" }],
      [
        { slug: "cooking", verified: false, source: "work_journal" },
        { slug: "cleaning", verified: false, source: "self" },
      ],
    );
    expect(bars.map((b) => [b.slug, b.entries])).toEqual([
      ["cooking", 2],
      ["cleaning", 1],
    ]);
  });

  it("keeps a declared skill with zero evidence — the gap IS the information", () => {
    const bars = deriveSkillEvidence(
      [{ slug: "cooking" }],
      [
        { slug: "cooking", verified: false, source: "work_journal" },
        { slug: "welding", verified: false, source: "self" },
      ],
    );
    const welding = bars.find((b) => b.slug === "welding");
    expect(welding).toBeDefined();
    expect(welding?.entries).toBe(0);
    expect(welding?.tier).toBe("declared");
    // …but it can never outrank a skill that has real evidence.
    expect(bars[0].slug).toBe("cooking");
  });

  it("the strongest REAL tier wins when a skill has several rows", () => {
    const bars = deriveSkillEvidence(
      [],
      [
        { slug: "cooking", verified: false, source: "self" },
        { slug: "cooking", verified: true, source: "work_journal" },
      ],
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].tier).toBe("verified");
  });

  it("a skill known only through a journal link is journal-backed, never verified", () => {
    const bars = deriveSkillEvidence([{ slug: "tiling" }], []);
    expect(bars[0].tier).toBe("journal");
  });

  it("drops empty slugs and honours the limit", () => {
    const bars = deriveSkillEvidence(
      [{ slug: "" }, { slug: null }],
      Array.from({ length: 20 }, (_, i) => ({
        slug: `s${String(i).padStart(2, "0")}`,
        verified: false,
        source: "self",
      })),
      5,
    );
    expect(bars).toHaveLength(5);
    expect(bars.every((b) => b.slug !== "")).toBe(true);
  });
});

describe("deriveWorkHistoryTimeline — placed on real dates only", () => {
  it("places a running engagement from its real start to now", () => {
    const tl = deriveWorkHistoryTimeline(
      [engagement({ startedAt: "2025-03-01", current: true })],
      NOW,
    );
    expect(tl.lanes).toHaveLength(1);
    expect(tl.lanes[0].startFraction).toBe(0);
    expect(tl.lanes[0].endFraction).toBe(1);
    expect(tl.lanes[0].current).toBe(true);
    expect(tl.fromIso).toBe("2025-03-01");
    expect(tl.toIso).toBe("2026-07-30");
  });

  it("counts undated engagements instead of guessing a position", () => {
    const tl = deriveWorkHistoryTimeline(
      [
        engagement({ id: "a", startedAt: "2025-03-01" }),
        engagement({ id: "b", startedAt: null }),
      ],
      NOW,
    );
    expect(tl.lanes.map((l) => l.id)).toEqual(["a"]);
    expect(tl.undatedCount).toBe(1);
  });

  it("drops rows that cannot NAME the work — same rule as the card body", () => {
    const tl = deriveWorkHistoryTimeline(
      [engagement({ organizationName: null, title: null })],
      NOW,
    );
    expect(tl.lanes).toHaveLength(0);
    expect(tl.undatedCount).toBe(1);
  });

  it("returns an empty band, not a fabricated one, when nothing is placeable", () => {
    const tl = deriveWorkHistoryTimeline([], NOW);
    expect(tl.lanes).toHaveLength(0);
    expect(tl.ticks).toHaveLength(0);
    expect(tl.fromIso).toBeNull();
    expect(tl.toIso).toBeNull();
  });

  it("orders two engagements by their real dates and marks the closed one", () => {
    const tl = deriveWorkHistoryTimeline(
      [
        engagement({
          id: "old",
          organizationName: "Senas",
          startedAt: "2023-01-01",
          endedAt: "2024-01-01",
          current: false,
        }),
        engagement({ id: "now", startedAt: "2025-03-01", current: true }),
      ],
      NOW,
    );
    const old = tl.lanes.find((l) => l.id === "old");
    const cur = tl.lanes.find((l) => l.id === "now");
    expect(old?.startFraction).toBe(0);
    expect(old?.current).toBe(false);
    expect(cur?.endFraction).toBe(1);
    expect((old?.endFraction ?? 1) < (cur?.startFraction ?? 0)).toBe(true);
  });

  it("emits a year tick for every real year boundary inside the span", () => {
    const tl = deriveWorkHistoryTimeline(
      [engagement({ startedAt: "2023-06-01", current: true })],
      NOW,
    );
    expect(tl.ticks.map((t) => t.year)).toEqual([2024, 2025, 2026]);
    for (const t of tl.ticks) {
      expect(t.fraction).toBeGreaterThan(0);
      expect(t.fraction).toBeLessThan(1);
    }
  });

  it("a same-day engagement still gets a visible width, capped at the band", () => {
    const tl = deriveWorkHistoryTimeline(
      [
        engagement({
          id: "short",
          startedAt: "2026-07-01",
          endedAt: "2026-07-01",
          current: false,
        }),
        engagement({ id: "long", startedAt: "2020-01-01", current: true }),
      ],
      NOW,
    );
    const short = tl.lanes.find((l) => l.id === "short");
    expect(short).toBeDefined();
    expect((short?.endFraction ?? 0) - (short?.startFraction ?? 0)).toBeGreaterThan(0);
    expect(short?.endFraction).toBeLessThanOrEqual(1);
  });
});
