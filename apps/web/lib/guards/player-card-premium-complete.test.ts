import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * §5.2 PREMIUM PLAYER CARD — the owner visual-acceptance completeness
 * contract. The card must carry: avatar, professional identity, location,
 * availability, work history, proven skills, signals, document status,
 * reputation statistics, explainable evidence and opportunities — and
 * landing + product must render the SAME component.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const CARD = read("components/app/worker-player-card.tsx");
const DATA = read("lib/player-card/player-card.ts");
const LABELS = read("lib/player-card/labels.ts");
const SHOWCASE = read("components/marketing/player-card-showcase.tsx");

describe("§5.2 the card carries every agreed dimension", () => {
  it("avatar, identity, availability, location", () => {
    for (const marker of [
      "avatarUrl", // real consented photo or the initials monogram
      "professionName", // professional identity
      "player-card-availability",
      "player-card-available-from",
      "player-card-location", // §5.2 addition
    ]) {
      expect(CARD, marker).toContain(marker);
    }
  });

  it("work history, proven skills and signals", () => {
    expect(CARD).toContain("workHistory");
    expect(CARD).toContain("verifiedSkillNames");
    expect(CARD).toContain("journalSupportedLabel"); // the signal tier
    expect(CARD).toContain("candidateLabel"); // candidate signals
  });

  it("document status and reputation statistics (§5.2 additions)", () => {
    expect(CARD).toContain("player-card-documents");
    expect(CARD).toContain("player-card-reputation");
    expect(CARD).toContain("reputationHint");
  });

  it("explainable evidence and opportunities", () => {
    expect(CARD).toContain("latestEvidenceLabel"); // when the proof last grew
    expect(CARD).toContain("evidenceLabel"); // how many records back it
    expect(CARD).toContain("player-card-thermometer"); // market opportunity
  });
});

describe("§5.2 every new dimension is REAL data, honestly absent otherwise", () => {
  it("location comes from the worker's own stated country, country-precision", () => {
    expect(DATA).toMatch(/locationCountry: worker\?\.current_location_country \?\? null/);
    // The label resolves the country NAME from the ONE canonical catalogue.
    expect(LABELS).toMatch(/countryNames\.\$\{card\.locationCountry\}/);
  });

  it("documents reuse the documents surface's OWN reader and pure deriver", () => {
    expect(DATA).toContain("listMyDocuments");
    expect(DATA).toContain("deriveDocumentStatus");
    // Any non-ok state is null — never a fabricated "0 documents" summary.
    expect(DATA).toMatch(/if \(res\.kind !== "ok"\) return null/);
  });

  it("reputation is real confirmations — never a universal human score", () => {
    expect(DATA).toContain("managerConfirmations");
    // A zero is stated in words, not rendered as a verdict number.
    expect(LABELS).toMatch(/card\.managerConfirmations > 0[\s\S]{0,160}: null/);
    expect(CARD).toMatch(/labels\.reputationValue \?\? labels\.reputationEmpty/);
    // No medal TIERS and no universal score: the retired FUT card's tier
    // tokens and OVR ring may never appear as rendered classes or data here.
    // (Design-token prose in comments explains what gold is RESERVED for —
    // the trust accent — which is exactly why it must not be a tier.)
    expect(CARD).not.toMatch(/(?:bg|text|border)-tier-(?:gold|silver|bronze)/);
    expect(CARD).not.toMatch(/TIER_(?:BAR|ACCENT)|card\.tier|OvrRing/);
  });

  it("a card with no documents surface simply renders no documents block", () => {
    expect(CARD).toMatch(/labels\.documentsLabel && labels\.documentsValue \?/);
  });
});

describe("§5.2 landing and product are the SAME component", () => {
  it("the landing showcase renders the canonical WorkerPlayerCard", () => {
    expect(SHOWCASE).toContain("WorkerPlayerCard");
    expect(SHOWCASE).toContain("buildPlayerCardLabels");
    expect(SHOWCASE).not.toMatch(/<PlayerCard\b/);
  });

  it("the landing sample fills the SAME §5.2 fields", () => {
    expect(SHOWCASE).toContain("locationCountry");
    expect(SHOWCASE).toContain("documents:");
  });

  it("the landing still says out loud that the sample is not a real person", () => {
    expect(SHOWCASE).toContain("conceptNote");
  });
});

describe("§5.2 premium self-check — no zero-as-verdict, no repeated placeholder rows", () => {
  it("a zero document count is stated in words, not rendered as '0 valid'", () => {
    // Production screenshot showed "0 galiojantys" reading as a verdict.
    expect(LABELS).toMatch(/card\.documents\.total === 0/);
    expect(LABELS).toMatch(/documentsEmpty/);
  });

  /**
   * EVERY playerCard key the resolver reads must EXIST in the served
   * locales. A production check caught `playerCard.documentsEmpty` rendering
   * as the raw KEY because a copy script ran in the wrong directory and
   * silently changed nothing — source-only assertions could not see it.
   * This closes that class: the guard reads the catalogues, not the code.
   */
  it("every playerCard key the resolver reads exists in every served locale", () => {
    const keys = [
      ...new Set(
        [...LABELS.matchAll(/t\("([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]),
      ),
    ];
    expect(keys.length).toBeGreaterThan(20);
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      const pc = msgs.playerCard as Record<string, unknown> | undefined;
      expect(pc, `${loc}.playerCard`).toBeTruthy();
      const missing = keys.filter((k) => {
        let node: unknown = pc;
        for (const part of k.split(".")) {
          if (node === null || typeof node !== "object") return true;
          node = (node as Record<string, unknown>)[part];
        }
        return typeof node !== "string" || node.trim().length === 0;
      });
      expect(missing, `${loc} missing playerCard keys: ${missing.join(", ")}`).toEqual(
        [],
      );
    }
  });

  it("work-history rows that cannot NAME the work are dropped, not padded", () => {
    // Two rows both rendered the generic fallback noun in production.
    expect(CARD).toMatch(/namedHistory/);
    expect(CARD).toMatch(
      /filter\(\s*\(h\) => \(h\.organizationName \?\? h\.title \?\? ""\)\.trim\(\)\.length > 0/,
    );
    // The fallback noun is no longer rendered as a row label at all.
    expect(CARD).not.toMatch(/\{h\.organizationName \?\? h\.title \?\? labels\.workHistoryUnnamed\}/);
  });

  /**
   * §5.2 stage 1 (post-postmortem) TIGHTENED this rule. The history is now a
   * real time band, so the old text list may not restate what the band already
   * shows: it renders ONLY named engagements the band could not place, and
   * disappears when there are none. Stating the same engagement twice is the
   * filler pattern the owner rejected.
   */
  it("the text list carries ONLY what the time band cannot place", () => {
    expect(CARD).toMatch(/const placedHistoryIds = new Set\(/);
    expect(CARD).toMatch(
      /const unplacedHistory = namedHistory\.filter\(\(h\) => !placedHistoryIds\.has\(h\.id\)\)/,
    );
    expect(CARD).toMatch(/unplacedHistory\.length > 0 \?/);
    // …and it may never re-render the full named list.
    expect(CARD).not.toMatch(/namedHistory\.slice\(/);
  });
});
