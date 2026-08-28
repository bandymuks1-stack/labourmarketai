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
    // S3: the sample literal moved into the ONE shared module both public
    // surfaces build from (the showcase must import it). The deriver rule
    // holds inside that module — and neither file may hand-build a series
    // object, which is how a prettier fake marketing chart would get in.
    expect(SHOWCASE).toContain("buildSampleWorkerPlayerCard");
    const sample = read("lib/player-card/sample-card.ts");
    expect(sample).toContain("deriveEvidenceTimeline(");
    expect(sample).toContain("deriveSkillEvidence(");
    for (const src of [SHOWCASE, sample]) {
      expect(src).not.toMatch(/evidenceTimeline:\s*\[\s*\{/);
      expect(src).not.toMatch(/skillEvidence:\s*\[\s*\{/);
    }
  });

  it("the landing sample shows the honest gap too (a skill with no records)", () => {
    // At least one declared-only skill, so the landing cannot look strictly
    // better than a real card.
    expect(read("lib/player-card/sample-card.ts")).toMatch(
      /verified: false, source: "self"/,
    );
  });

  it("the landing still says out loud that the card is a sample", () => {
    expect(SHOWCASE).toContain("conceptNote");
  });
});

describe("§5.2 the card stays reachable in the authenticated product", () => {
  it("the chat, the journal page and the profile hub all mount the card", () => {
    for (const rel of [
      "components/app/conversation/chat/conversation-chat.tsx",
      "app/[locale]/dashboard/journal/page.tsx",
      // W7-S1: `live-profile-section.tsx` was ABSORBED into the profile hub.
      // The card read moved with it — same canonical model, same surface.
      "components/app/profile-hub-overview.tsx",
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
   * CLOSED <details>, so "Mano kortele" landed on a 40px summary row - the exact
   * S5.1 defect the owner reported, while the traceability said LIVE.
   *
   * The FIX at the time was the `open` attribute, because nothing else could
   * open a disclosure a hash pointed at. That is no longer true: #1317
   * generalised `DetailsHashOpener` to open a disclosure for its OWN id and for
   * any id nested inside it. Owner ruling 2026-08-28 therefore superseded the
   * always-open default - the Journal's first viewport belongs to the work
   * records, not to 2118px of identity block - and the invariant this test
   * protects moved with it.
   *
   * The invariant was never "the attribute `open` is present". It was: THE DEEP
   * LINK MUST NOT LAND ON A CLOSED GREY BAR. That is what is asserted now, and
   * it is asserted the only way that cannot pass vacuously - the disclosure and
   * its opener must both exist, the opener must name THIS disclosure, and it
   * must be mounted inside it. Deleting any one of the three fails.
   */
  it("the card's journal disclosure arrives OPEN when deep-linked", () => {
    const journal = read("app/[locale]/dashboard/journal/page.tsx");
    // Anchored on the id alone, never on a multi-line literal: this repository
    // is edited on Windows, and a guard that matches across a line break passes
    // in CI and fails locally for a reason that has nothing to do with the code.
    const at = journal.indexOf('id="mano-cv-identity"');
    expect(at, "the mano-cv-identity disclosure must exist").toBeGreaterThan(-1);
    const block = journal.slice(at, journal.indexOf("</details>", at));
    // The opener is what makes the deep link land on an OPEN card, and it is
    // mounted INSIDE the disclosure so it cannot drift away from it.
    expect(
      block,
      "the deep link's opener must be mounted inside the disclosure",
    ).toContain('<DetailsHashOpener targetId="mano-cv-identity" />');
    expect(journal, "...and the component must actually be imported").toContain(
      'import { DetailsHashOpener } from "@/components/app/details-hash-opener"',
    );
  });

  /**
   * Negative control for the test above. The opener only helps because it
   * handles a hash naming the disclosure ITSELF - the `#mano-cv-identity` case,
   * which is what every entry point sends. A refactor that reduced it to
   * nested-id handling only would leave the guard above green and the deep link
   * broken, so the branch is pinned here rather than assumed.
   */
  it("DetailsHashOpener opens a disclosure whose own id is the hash", () => {
    const opener = read("components/app/details-hash-opener.tsx");
    expect(opener).toContain("hash === `#${targetId}`");
    expect(opener).toContain("if (!el.open) el.open = true;");
  });

  /**
   * The collapsed row is now the ONLY thing naming the card on the journal
   * page, so it names it the way the avatar menu does. Two labels for one
   * object is the duplicate-vocabulary failure the shell cleanup removed.
   */
  it("the collapsed row and the avatar menu name the card identically", () => {
    const journal = read("app/[locale]/dashboard/journal/page.tsx");
    expect(journal).toContain('label: tTabs("playerCard")');
    expect(journal).toContain('{tTabs("playerCard")}');
    expect(read("components/app/account-menu.tsx")).toContain(
      't("tabs.playerCard")',
    );
  });

  it('"show my card" still resolves to the canonical card projection', () => {
    // W3 row 1: the projection moved from the chat THREAD to the Context Panel
    // RESULT, and its loader moved to the player-card module with it. The
    // claim under test is unchanged — "show my card" reaches the ONE canonical
    // component, never a second card-shaped summary.
    expect(read("lib/player-card/player-card-result.ts")).toContain(
      "WorkerPlayerCard",
    );
    expect(read("components/app/workspace/player-card-result.tsx")).toMatch(
      /<WorkerPlayerCard/,
    );
    // …and the thread no longer draws its own copy.
    expect(
      read("components/app/conversation/chat/conversation-chat.tsx"),
    ).not.toMatch(/<WorkerPlayerCard/);
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
