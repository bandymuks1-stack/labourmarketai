import { describe, expect, it } from "vitest";
import { classifyEntryRecognition } from "./recognition-tiers";
import { recognizeSkills } from "./skill-recognition";
import { labelForLocale } from "./new-skill-suggestions";

/**
 * Recognition-tiers guard (journal-real-world-recognition-audit-p0, owner
 * product-direction correction). Three levels:
 *   1 auto_signal · 2 candidate_suggestion · 3 manual_only
 *
 * The owner rule still holds — a wrong AUTO signal is worse than none (BAD 0) —
 * but the recogniser must no longer stay silent when SIMILAR matches exist: it
 * offers candidates for the worker to choose (never auto-linked, never verified).
 */

const CERT = /confirm|verif|patvirtin|approved|certified|trusted|proof|подтверж|верифиц/i;

describe("Tier 1 — confident AUTO signal", () => {
  it("'ploviau grindis' is the cleaning AUTO signal, never flooring", () => {
    const r = classifyEntryRecognition("ploviau grindis");
    expect(r.tier).toBe("auto_signal");
    // The current cleaning signal is shown…
    expect(r.autoCapabilityLabels).toContain("Valymo darbai");
    // …and flooring is never produced — not as a signal, not as a candidate.
    expect(r.autoSignalSlugs).not.toContain("flooring");
    expect(r.candidates.map((c) => c.slug)).not.toContain("flooring");
    expect(recognizeSkills("ploviau grindis", 8).map((s) => s.slug)).not.toContain("flooring");
  });

  it("real floor INSTALLATION still triggers the flooring AUTO signal", () => {
    for (const text of ["klojau grindis", "dėjau laminatą", "klojau parketą", "montavau grindis"]) {
      const r = classifyEntryRecognition(text);
      expect(r.tier, text).toBe("auto_signal");
      expect(r.autoSignalSlugs, text).toContain("flooring");
    }
  });
});

describe("Tier 2 — CANDIDATE suggestions (not auto-linked)", () => {
  // Each was SAFE EMPTY before; now a similar candidate is OFFERED.
  const CASES: { text: string; slug: string }[] = [
    { text: "Pristačiau siuntas po miestą", slug: "delivery-driving" },
    { text: "rinkau uzsakymus, pakavau, etiketavau", slug: "order-picking" },
    { text: "valiau sniega nuo taku, bariau druska", slug: "winter-service" },
    { text: "kuriau logotipą, maketavau bukletą", slug: "graphic-design" },
    { text: "Testavau aplikaciją, radau klaidas", slug: "qa-testing" },
    { text: "auklejau vaikus, vedziau i darzeli", slug: "childcare" },
  ];
  for (const { text, slug } of CASES) {
    it(`"${text}" → candidate ${slug}`, () => {
      const r = classifyEntryRecognition(text);
      expect(r.tier, text).toBe("candidate_suggestion");
      expect(r.candidates.map((c) => c.slug), text).toContain(slug);
    });
  }

  // Maximal recognition (PR #562): housekeeping + elderly care were UPGRADED
  // from candidate-only to a confident (but still suggested, never confirmed)
  // capability — the recognizer now names the activity directly. Coverage is
  // preserved and strengthened, not dropped.
  const UPGRADED: { text: string; label: RegExp }[] = [
    { text: "tvarkiau kambarius viesbuty, patalyne", label: /valym/i },
    { text: "Prižiūrėjau senelius, daviau vaistus", label: /priežiūr|globa/i },
  ];
  for (const { text, label } of UPGRADED) {
    it(`"${text}" → auto suggested capability (not auto-confirmed)`, () => {
      const r = classifyEntryRecognition(text);
      expect(r.tier, text).toBe("auto_signal");
      expect(r.autoCapabilityLabels.join(" "), text).toMatch(label);
    });
  }

  it("candidates are OFFERS, not current linked skills (no fact, no fake slug)", () => {
    const r = classifyEntryRecognition("kuriau logotipą, maketavau bukletą");
    expect(r.tier).toBe("candidate_suggestion");
    // No auto signal was asserted alongside the candidate.
    expect(r.autoSignalSlugs).toEqual([]);
    expect(r.autoCapabilityLabels).toEqual([]);
    for (const c of r.candidates) {
      // Real kebab-case catalogue slug (never a raw construction slug leak or
      // a synthetic "claim:"/empty slug), and a real localized label per locale.
      expect(c.slug).toMatch(/^[a-z][a-z-]+$/);
      expect(c.labels.lt.length).toBeGreaterThan(0);
      for (const loc of ["lt", "en", "ru"]) {
        expect(CERT.test(labelForLocale(c.labels, loc)), `${c.slug} ${loc}`).toBe(false);
      }
    }
  });

  it("no duplicate candidate concept (one slug, once)", () => {
    const slugs = classifyEntryRecognition("Pristačiau siuntas po miestą").candidates.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("Tier 3 — MANUAL ONLY (truly unclear, never invent a skill)", () => {
  const VAGUE = [
    "dirbau visa diena, labai pavargau",
    "buvo daug darbo, padariau ka reikejo",
    "tvarkiau reikalus",
    "valiau",
    "objektas Vilniuje, Kalvarijų g. 125",
    "9h",
  ];
  for (const text of VAGUE) {
    it(`"${text}" → manual_only, no invented skill/candidate`, () => {
      const r = classifyEntryRecognition(text);
      expect(r.tier, text).toBe("manual_only");
      expect(r.candidates, text).toEqual([]);
      expect(r.autoSignalSlugs, text).toEqual([]);
    });
  }
});
