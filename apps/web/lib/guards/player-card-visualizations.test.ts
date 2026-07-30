import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * §5.2 PLAYER CARD VISUALIZATIONS — the contract the owner's post-deploy
 * review created.
 *
 * The previous round's §5.2 guard asserted that markers EXISTED in the card's
 * source. That passed while the card was still a column of text boxes, which
 * is exactly why the owner rejected it (see
 * docs/audits/owner-visual-acceptance-false-completion-postmortem-2026.md).
 *
 * This guard is written to FAIL in the situations the owner named:
 *   - the charts disappear from the card;
 *   - a chart stops reading real rows (invented series);
 *   - the card disappears from the authenticated surfaces;
 *   - the landing card and the product card drift apart;
 *   - a chart can render an empty frame or a raw i18n key.
 *
 * It is a source + catalogue guard, so it runs in CI without a database. The
 * geometry itself is covered by lib/player-card/evidence-visuals.test.ts, and
 * the rendered production DOM by scripts/qa-player-card-visuals.mjs.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const CARD = read("components/app/worker-player-card.tsx");
const DATA = read("lib/player-card/player-card.ts");
const LABELS = read("lib/player-card/labels.ts");
const SHOWCASE = read("components/marketing/player-card-showcase.tsx");
const VISUALS = read("lib/player-card/evidence-visuals.ts");
const CHART_EVIDENCE = read(
  "components/app/player-card/evidence-timeline-chart.tsx",
);
const CHART_SKILLS = read("components/app/player-card/skill-evidence-chart.tsx");
const CHART_HISTORY = read(
  "components/app/player-card/work-history-timeline.tsx",
);

describe("§5.2 the card really carries data visualizations", () => {
  it("renders all three visualization components", () => {
    for (const marker of [
      "<EvidenceTimelineChart",
      "<SkillEvidenceChart",
      "<WorkHistoryTimeline",
    ]) {
      expect(CARD, `card must render ${marker}`).toContain(marker);
    }
    expect(CARD).toContain('data-testid="player-card-visualizations"');
  });

  it("each chart draws geometry — not another list of sentences", () => {
    // The evidence chart is a real column chart: an SVG with one rect per month.
    expect(CHART_EVIDENCE).toMatch(/<svg[\s\S]*viewBox/);
    expect(CHART_EVIDENCE).toMatch(/<rect[\s\S]*height=\{h\}/);
    // The skill chart encodes the count as a width, not as text alone.
    expect(CHART_SKILLS).toMatch(/width: `\$\{pct === 0 \? 2 : Math\.max\(4, pct\)\}%`/);
    // The history band positions segments from the derived fractions.
    expect(CHART_HISTORY).toMatch(/left: `\$\{lane\.startFraction \* 100\}%`/);
    expect(CHART_HISTORY).toMatch(/lane\.endFraction - lane\.startFraction/);
  });

  it("every chart has a real empty branch — no empty frame may ship", () => {
    for (const [name, src] of [
      ["evidence", CHART_EVIDENCE],
      ["skills", CHART_SKILLS],
      ["history", CHART_HISTORY],
    ] as const) {
      expect(src, `${name} chart needs an empty state`).toContain(
        'data-chart-state="empty"',
      );
      expect(src, `${name} chart needs a live state`).toContain(
        'data-chart-state="live"',
      );
    }
    // A zero month is drawn as a real floor tick, never smoothed away.
    expect(CHART_EVIDENCE).toContain("FLOOR");
  });
});

describe("§5.2 the series are REAL rows, never invented", () => {
  it("the evidence timeline reads the worker's own live journal entries", () => {
    expect(DATA).toContain("journalEntryTimestamps");
    expect(DATA).toMatch(/\.from\("journal_entries"\)[\s\S]{0,200}\.select\("created_at"\)/);
    expect(DATA).toMatch(/\.is\("deleted_at", null\)/);
    expect(DATA).toMatch(/\.gte\("created_at", windowStart\.toISOString\(\)\)/);
  });

  it("skill evidence reads the real journal↔skill link table", () => {
    expect(DATA).toContain("journalSkillLinkSlugs");
    expect(DATA).toMatch(/\.from\("journal_entry_skills"\)/);
    expect(DATA).toMatch(/\.eq\("worker_id", workerId\)/);
  });

  it("both series degrade to [] on a read error — never to a filler series", () => {
    // Each reader ends in a catch that returns an empty array.
    const readers = DATA.split("async function").filter(
      (chunk) =>
        chunk.startsWith(" journalEntryTimestamps") ||
        chunk.startsWith(" journalSkillLinkSlugs"),
    );
    expect(readers).toHaveLength(2);
    for (const r of readers) {
      expect(r).toMatch(/catch \{[\s\S]{0,40}return \[\];/);
    }
  });

  it("the card's geometry comes from the pure, unit-tested derivers", () => {
    expect(DATA).toContain("deriveEvidenceTimeline(");
    expect(DATA).toContain("deriveSkillEvidence(");
    expect(CARD).toContain("deriveWorkHistoryTimeline(");
    // The derivers must stay pure: no DB client, no server-only import.
    expect(VISUALS).not.toMatch(/supabase|createClient|server-only/);
  });

  it("no visualization may invent, smooth or rank a person", () => {
    for (const src of [VISUALS, CHART_EVIDENCE, CHART_SKILLS, CHART_HISTORY]) {
      expect(src).not.toMatch(/Math\.random/);
      expect(src).not.toMatch(/(?:bg|text|border|stroke|fill)-tier-(?:gold|silver|bronze)/);
      expect(src).not.toMatch(/\bOvrRing\b|trust_score|opportunityScore/);
    }
  });
});

describe("§5.2 landing and product cannot drift apart", () => {
  it("the landing renders the canonical component, not a marketing copy", () => {
    expect(SHOWCASE).toContain("WorkerPlayerCard");
    expect(SHOWCASE).toContain("buildPlayerCardLabels");
    expect(SHOWCASE).not.toMatch(/<PlayerCard\b/);
  });

  it("the landing sample goes through the SAME derivers as the real card", () => {
    expect(SHOWCASE).toContain("deriveEvidenceTimeline(");
    expect(SHOWCASE).toContain("deriveSkillEvidence(");
    // It may not hand-build a series object — that is how a prettier fake
    // marketing chart would get in.
    expect(SHOWCASE).not.toMatch(/evidenceTimeline:\s*\[\s*\{/);
    expect(SHOWCASE).not.toMatch(/skillEvidence:\s*\[\s*\{/);
  });

  it("the landing sample shows the honest gap too (a skill with no records)", () => {
    // At least one declared-only skill, so the landing cannot look strictly
    // better than a real card.
    expect(SHOWCASE).toMatch(/verified: false, source: "self"/);
  });

  it("the landing still says out loud that the card is a sample", () => {
    expect(SHOWCASE).toContain("conceptNote");
  });
});

describe("§5.2 the card stays reachable in the authenticated product", () => {
  it("the chat, the journal page and the live profile all mount the card", () => {
    for (const rel of [
      "components/app/conversation/chat/conversation-chat.tsx",
      "app/[locale]/dashboard/journal/page.tsx",
      "components/app/live-profile-section.tsx",
    ]) {
      expect(read(rel), rel).toContain("WorkerPlayerCard");
    }
  });

  it("the avatar menu still deep-links to the card", () => {
    expect(read("components/app/account-menu.tsx")).toMatch(
      /\/dashboard\/journal#mano-cv-identity/,
    );
  });

  /**
   * Found in AUTHENTICATED production on 2026-07-30: the deep-link target was a
   * CLOSED <details>, so "Mano kortelė" landed on a 40px summary row — the exact
   * §5.1 defect the owner reported, while the traceability said LIVE. The card
   * may be collapsible, but it may never arrive collapsed.
   */
  it("the card's disclosure on the journal page is OPEN by default", () => {
    const journal = read("app/[locale]/dashboard/journal/page.tsx");
    const block = journal.slice(journal.indexOf("<details"));
    const details = block.slice(0, block.indexOf(">") + 1);
    expect(details, "the mano-cv-identity disclosure").toContain(
      'id="mano-cv-identity"',
    );
    expect(details, "must carry `open`").toMatch(/\bopen\b/);
  });

  it('"show my card" still resolves to the canonical card projection', () => {
    expect(read("lib/conversation/player-card-chat.ts")).toContain(
      "WorkerPlayerCard",
    );
  });
});

describe("§5.2 no raw i18n key can reach a chart", () => {
  const LOCALES = readdirSync(join(APP, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("all 11 served locales exist", () => {
    expect(LOCALES.length).toBe(11);
  });

  it("every visuals key the resolver reads exists in EVERY served locale", () => {
    const keys = [
      ...new Set(
        [...LABELS.matchAll(/t\("visuals\.([a-zA-Z0-9_]+)"/g)].map((m) => m[1]),
      ),
    ];
    // The resolver must actually read a full set — a shrunken list would make
    // this guard vacuous.
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const loc of LOCALES) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        playerCard?: { visuals?: Record<string, unknown> };
      };
      const visuals = msgs.playerCard?.visuals;
      expect(visuals, `${loc}.playerCard.visuals`).toBeTruthy();
      const missing = keys.filter((k) => {
        const v = visuals?.[k];
        return typeof v !== "string" || v.trim().length === 0;
      });
      expect(missing, `${loc} missing: ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("the active locales carry real translations, not [EN] markers", () => {
    // da/de/nl/ru are ratcheted locales and lt/en must be complete: a new
    // untranslated marker in any of them is a defect, not debt.
    for (const loc of ["lt", "en", "de", "nl", "ru", "da"]) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        playerCard?: { visuals?: Record<string, string> };
      };
      const marked = Object.entries(msgs.playerCard?.visuals ?? {}).filter(
        ([, v]) => typeof v === "string" && v.startsWith("[EN]"),
      );
      expect(marked.map(([k]) => k), `${loc} untranslated`).toEqual([]);
    }
  });
});
