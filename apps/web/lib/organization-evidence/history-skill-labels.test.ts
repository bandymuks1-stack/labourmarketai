import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recognizeSkills } from "@/lib/structuring/skill-recognition";

import { deriveCompetencySignals, storedSignalStillSupported } from "./competency-signals";

/**
 * OWNER P0 2026-11-24: the historical person card showed "Maisto gaminimas"
 * (cooking) and "Suvirinimas" (welding) on almost every place card of a Dutch
 * construction worker (prod walk 45401396990). The causes:
 *   - cooking from "keuken" and its compounds (keukenkasten, keukenvloer,
 *     keukenplafond, keukenmontage…) — a kitchen is the room being worked on;
 *     and from "aangekochte" (NL: purchased) ⊃ DE "kochte";
 *   - welding from "bevestigen", "bevestiging", "vochtig", "voorzichtig",
 *     "regelmatige", "handmatige" — all contain the welding synonym "tig".
 * Decision 0023: fix the wrong label, never disable inference.
 */

const slugs = (text: string) => deriveCompetencySignals(text).map((s) => s.skillSlug);

const CONSTRUCTION: ReadonlyArray<[string, string]> = [
  // Dutch — the phrases and words production stored.
  ["nl", "Tegels zetten in de keuken"],
  ["nl", "Keukenkasten gemonteerd en bevestigd"],
  ["nl", "Keukenvloer en keukenplafond afgewerkt"],
  ["nl", "Keukenmontage en stopcontacten in de bijkeuken"],
  ["nl", "Bevestiging van gipsplaten, voorzichtig werken"],
  ["nl", "Vochtige muur behandeld, regelmatige controle"],
  ["nl", "Handmatige afwerking van het dak"],
  ["nl", "Aangekochte materialen naar de bouwplaats gebracht"],
  // Lithuanian.
  ["lt", "Plytelių klijavimas virtuvėje"],
  ["lt", "Virtuvės sienų glaistymas ir dažymas"],
  ["lt", "Gipso kartono montavimas virtuvėje"],
  // Polish.
  ["pl", "Montaż płyt gipsowych w kuchni"],
  ["pl", "Układanie płytek w kuchni i łazience"],
  ["pl", "Malowanie ścian w kuchni"],
];

describe("construction records never read as cooking or welding", () => {
  it.each(CONSTRUCTION)("%s: %s", (_lang, text) => {
    const got = slugs(text);
    expect(got).not.toContain("cooking");
    expect(got).not.toContain("welding-blueprint");
  });

  it("the construction trade in them is still read (inference is not disabled)", () => {
    expect(slugs("Bevestiging van gipsplaten, voorzichtig werken")).toContain("drywall");
    expect(slugs("Plytelių klijavimas virtuvėje")).toContain("tiling");
    expect(slugs("Montaż płyt gipsowych w kuchni")).toContain("drywall");
  });
});

describe("real cooking and real welding are still recognised", () => {
  it.each([
    "Kookte voor 40 gasten",
    "Werkte als kok in een restaurant",
    "Ich kochte für 50 Gäste",
    "Dirbau virėja restorane",
    "Gaminau maistą virtuvėje",
    "Pracowałem jako kucharz",
  ])("cooking: %s", (text) => {
    expect(slugs(text)).toContain("cooking");
  });

  it.each(["Laswerk aan het hek", "Spawałem konstrukcje stalowe", "Suvirinau metalines konstrukcijas", "MIG welding of frames"])(
    "welding: %s",
    (text) => {
      expect(slugs(text).some((s) => s === "welding-blueprint" || s === "tig-welding" || s === "mig-welding")).toBe(true);
    },
  );

  it("a short abbreviation still matches as its own word", () => {
    expect(recognizeSkills("tig").map((r) => r.slug)).toContain("welding-blueprint");
    expect(recognizeSkills("bevestiging").map((r) => r.slug)).not.toContain("welding-blueprint");
  });
});

describe("stored signals are re-checked on every read — nothing is deleted", () => {
  it.each([
    ["cooking", "keukenkasten"],
    ["cooking", "aangekochte"],
    ["welding-blueprint", "bevestigen"],
    ["welding-blueprint", "vochtig"],
    ["welding-blueprint", "voorzichtig"],
  ])("a stored %s from %j is no longer shown", (slug, term) => {
    expect(storedSignalStillSupported(slug, term)).toBe(false);
  });

  it("over the record's own text, a stored kitchen-as-cooking is dropped; a hospitality one stays", () => {
    expect(storedSignalStillSupported("cooking", "keuken", "Gipsplaten gemonteerd in de keuken")).toBe(false);
    expect(storedSignalStillSupported("cooking", "keuken", "Tegels zetten in de keuken")).toBe(false);
    expect(storedSignalStillSupported("cooking", "virtuvėje", "Dirbau virtuvėje, ruošiau maistą")).toBe(true);
    // Without the record text the bare word is ambiguous, so it is kept.
    expect(storedSignalStillSupported("cooking", "keuken")).toBe(true);
  });

  it.each([
    ["cooking", "kookte"],
    ["cooking", "als kok"],
    ["welding-blueprint", "laswerk"],
    ["drywall", "gipsplaten"],
    ["roofing", "dakwerk"],
  ])("a stored %s from %j is still shown", (slug, term) => {
    expect(storedSignalStillSupported(slug, term)).toBe(true);
  });
});

describe("the profile read hides stored wrong labels (nothing deleted)", () => {
  it("a construction record's stored cooking and welding rows do not reach the card", async () => {
    const { readSubjectCompetencySignals } = await import("./competency-signals-read");
    const signals = [
      { record_id: "r1", term: "keuken", skill_slug: "cooking", confidence: 0.9 },
      { record_id: "r1", term: "bevestigen", skill_slug: "welding-blueprint", confidence: 0.6 },
      { record_id: "r1", term: "gipsplaten", skill_slug: "drywall", confidence: 0.6 },
      { record_id: "r2", term: "kookte", skill_slug: "cooking", confidence: 0.9 },
    ];
    const records = [
      { id: "r1", original_text: "Gipsplaten bevestigen in de keuken" },
      { id: "r2", original_text: "Kookte voor de ploeg" },
    ];
    const query = (data: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "in", "not", "order", "limit"]) q[m] = () => q;
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data, error: null });
      return q;
    };
    const supabase = {
      from: (table: string) => query(table === "organization_evidence_records" ? records : signals),
    };
    const res = await readSubjectCompetencySignals(supabase as never, ["r1", "r2"]);
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    const bySlug = Object.fromEntries(res.signals.map((s) => [s.slug, s.recordIds]));
    expect(bySlug["welding-blueprint"]).toBeUndefined();
    expect(bySlug["drywall"]).toEqual(["r1"]);
    // Cooking survives only where the record says someone cooked.
    expect(bySlug["cooking"]).toEqual(["r2"]);
  });
});

describe("Codex P2 on #3774: only a real trade, after the other guards, takes cooking away", () => {
  it("a transferable skill beside a kitchen does not remove cooking", () => {
    expect(recognizeSkills("Worked in a kitchen with teamwork").map((r) => r.slug)).toContain("cooking");
  });

  it("a reading another guard removed does not count as a competing trade", () => {
    // flooring is dropped by the cleaning guard; cooking must survive it.
    expect(recognizeSkills("I worked in the kitchen and washed floors").map((r) => r.slug)).toContain("cooking");
  });

  it("a construction trade still makes the kitchen the room", () => {
    expect(recognizeSkills("Gipsplaten gemonteerd in de keuken").map((r) => r.slug)).not.toContain("cooking");
  });
});

describe("Codex P2 on #3774: German 'kochte' on its own is still cooking", () => {
  it.each(["Kochte täglich frische Gerichte", "Er kochte gestern Suppe"])("%s → cooking", (text) => {
    expect(recognizeSkills(text).map((r) => r.slug)).toContain("cooking");
  });
  it("inside Dutch 'aangekochte' it is not", () => {
    expect(recognizeSkills("Aangekochte materialen gebracht").map((r) => r.slug)).not.toContain("cooking");
  });
});
