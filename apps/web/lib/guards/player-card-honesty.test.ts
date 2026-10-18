import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Premium scouting/player card honesty guard (TASK 07 slice
 * design-soul-scouting-ui-v1; renamed from today-screen-honesty when the
 * orphaned today-screen surface was removed in canonical-user-journey v1).
 *
 * Pins the DESIGN_SOUL §1 anatomy rule in code: every visual signal on the
 * player card is the skin of REAL journal-chain data — verified badges only
 * from manager-verified rows, availability only when really saved, and never
 * any money/score/matching fabrication or public certification badge.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const card = read("components/app/worker-player-card.tsx");
const cardSvc = read("lib/player-card/player-card.ts");
const css = read("app/globals.css");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];

describe("DESIGN_SOUL is a committed, binding document", () => {
  it("docs/DESIGN_SOUL.md exists with the five screen tests", () => {
    const soul = readFileSync(
      join(root, "..", "..", "docs", "DESIGN_SOUL.md"),
      "utf8",
    );
    expect(soul).toMatch(/PRIVALOMAS visiems UI darbams/);
    for (const test of [
      "3 SEKUNDŽIŲ TESTAS",
      "ŽMOGAUS KALBOS TESTAS",
      "KITO ŽINGSNIO TESTAS",
      "RAMYBĖS TESTAS",
      "AUGIMO TESTAS",
    ]) {
      expect(soul).toContain(test);
    }
  });
});

describe("scouting card: gold enters ONLY as the derived provenance edge (frozen design P6)", () => {
  it("carries NO gold confirmation trust ring on the card chrome", () => {
    // The card chrome never advertises confirmation as a ring/badge; the one
    // gold a person may carry is the provenance EDGE, derived from real rows.
    expect(card).not.toMatch(/trust-ring/);
    expect(card).toMatch(/<ProvenanceEdge provenanceClass=\{card\.provenance\.class\}/);
  });
  it("verified badges come only from manager-verified worker_skills rows", () => {
    expect(cardSvc).toMatch(/\.eq\("verified", true\)/);
    expect(cardSvc).toMatch(/skill_icons/);
  });
  it("availability/profession render only when really saved (null otherwise)", () => {
    expect(card).toMatch(/labels\.availabilityLabel \?/);
    expect(cardSvc).toMatch(/availabilityStatus: worker\?\.availability_status \?\? null/);
  });
  it("latest evidence is a real timestamp or an honest empty line", () => {
    expect(cardSvc).toMatch(/latestEvidenceAt: latestEntry\?\.created_at \?\? null/);
    expect(card).toMatch(/labels\.latestEvidenceValue \?\? labels\.latestEvidenceEmpty/);
  });
});

describe("the player card names no gold class itself — the material lives in the ONE edge component", () => {
  it("--c-trust-accent token still exists for dark AND light themes", () => {
    const matches = css.match(/--c-trust-accent:/g) ?? [];
    expect(matches.length).toBe(2);
  });
  it("the card file does NOT spell the gold trust accent or tier-gold (only provenance-edge.tsx may)", () => {
    expect(card).not.toMatch(/trust-accent/);
    expect(card).not.toMatch(/tier-gold/);
  });
});

describe("copy passes the honesty + i18n bar", () => {
  it("all locales carry the playerCard keys", () => {
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`));
      expect(json.playerCard?.verifiedTitle, `${locale}: verifiedTitle`).toBeTruthy();
      expect(json.playerCard?.latestEvidenceEmpty, `${locale}: latestEvidenceEmpty`).toBeTruthy();
    }
  });
  it("LT/EN copy never fabricates money, rank or matching outcomes", () => {
    // The S4 thermometer keys (thermo*) are the ONE sanctioned money signal:
    // owner-locked formula over declared expectations + admin-sourced market
    // averages, shown only when both components really exist. Everything
    // else on the player card stays money-free.
    const dropThermo = (o: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(o).filter(([k]) => !k.startsWith("thermo")),
      );
    const blob =
      JSON.stringify(dropThermo(lt.playerCard)) +
      JSON.stringify(dropThermo(en.playerCard));
    expect(blob).not.toMatch(/€|eur|salary|atlyginim|top \d|%|guarant|garantuo/i);
    expect(blob).not.toMatch(/employer (viewed|is interested)|darbdavys (peržiūrėjo|domisi)/i);
  });
});

describe("motion stays accessible", () => {
  it("count-up respects prefers-reduced-motion and server-renders the real value", () => {
    const cu = read("components/app/today/count-up.tsx");
    expect(cu).toMatch(/prefers-reduced-motion/);
    expect(cu).toMatch(/useState\(text\)/);
  });
  it("glow-hover is disabled under prefers-reduced-motion", () => {
    const reduced =
      css.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/)?.[0] ?? "";
    expect(reduced).toMatch(/\.glow-hover/);
  });
});
