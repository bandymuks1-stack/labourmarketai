import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Worker "šiandienos ekranas" + premium scouting card honesty guard (TASK 07
 * slice design-soul-scouting-ui-v1).
 *
 * Pins the DESIGN_SOUL §1 anatomy rule in code: every visual signal on the
 * today screen is the skin of REAL journal-chain data — confirmed glow only
 * for real confirmations, hours only when explicitly recorded, the growth
 * suggestion only from the real profession_skills taxonomy, and never any
 * money/score/matching fabrication.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const svc = read("lib/worker/today-screen.ts");
const screen = read("components/app/today/today-screen.tsx");
const card = read("components/app/worker-player-card.tsx");
const cardSvc = read("lib/player-card/player-card.ts");
const css = read("app/globals.css");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl"];

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

describe("today-screen read service is real-data-only", () => {
  it("reads only the real journal chain + taxonomy tables", () => {
    expect(svc).toMatch(/journal_entries/);
    expect(svc).toMatch(/journal_entry_confirmations/);
    expect(svc).toMatch(/journal_entry_metrics/);
    expect(svc).toMatch(/profession_skills/);
  });
  it("derives review state via the canonical latest-wins helpers", () => {
    expect(svc).toMatch(/deriveReviewResult/);
    expect(svc).toMatch(/deriveReviewOrigin/);
  });
  it("hours are explicit-only: fragment_time metrics, null when none (never fake 0)", () => {
    expect(svc).toMatch(/fragment_time/);
    expect(svc).toMatch(/weekConfirmedHours: number \| null/);
    expect(svc).toMatch(/if \(found\) weekConfirmedHours/);
  });
  it("degrades to the honest empty shape on any error", () => {
    expect(svc).toMatch(/return empty;/);
    expect(svc).toMatch(/skillSuggestion: null/);
  });
  it("never touches money — no salary/eur columns on the today screen", () => {
    expect(svc).not.toMatch(/salary_min|salary_max|_eur\b|€/i);
  });
});

describe("the today screen renders real states with one next step", () => {
  it("mounts on the worker dashboard", () => {
    const dash = read("app/[locale]/dashboard/page.tsx");
    expect(dash).toMatch(/<TodayScreen\b/);
  });
  it("pending-review line renders ONLY when entries really wait", () => {
    expect(screen).toMatch(/data\.pendingReview > 0 \?/);
  });
  it("hours stat renders ONLY when explicit durations exist", () => {
    expect(screen).toMatch(/data\.weekConfirmedHours !== null \?/);
  });
  it("growth suggestion is the real taxonomy skill or an honest empty state", () => {
    expect(screen).toMatch(/data\.skillSuggestion \?/);
    expect(screen).toMatch(/path\.empty/);
  });
  it("the CTAs point at real routes (journal / profile)", () => {
    expect(screen).toMatch(/\/dashboard\/journal/);
    expect(screen).toMatch(/\/dashboard\/profile/);
  });
});

describe("scouting card: glow is the skin of real confirmation (DESIGN_SOUL §1)", () => {
  it("gold trust ring is conditional on the REAL work-card confirmation", () => {
    expect(card).toMatch(/confirmed && "trust-ring"/);
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

describe("gold stays a single semantic trust accent — no gold palette", () => {
  it("--c-trust-accent is defined for dark AND light themes", () => {
    const matches = css.match(/--c-trust-accent:/g) ?? [];
    expect(matches.length).toBe(2);
  });
  it("the trust ring + chips use the semantic token, not tier-gold directly", () => {
    expect(card).toMatch(/trust-accent/);
    expect(card).not.toMatch(/tier-gold/);
  });
});

describe("copy passes the honesty + i18n bar", () => {
  it("all 10 locales carry the todayScreen namespace + new playerCard keys", () => {
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`));
      expect(json.todayScreen?.action?.title, `${locale}: action.title`).toBeTruthy();
      expect(json.todayScreen?.week?.emptyHeadline, `${locale}: week.emptyHeadline`).toBeTruthy();
      expect(json.todayScreen?.path?.empty, `${locale}: path.empty`).toBeTruthy();
      expect(json.playerCard?.verifiedTitle, `${locale}: verifiedTitle`).toBeTruthy();
      expect(json.playerCard?.latestEvidenceEmpty, `${locale}: latestEvidenceEmpty`).toBeTruthy();
    }
  });
  it("LT/EN copy never fabricates money, rank or matching outcomes", () => {
    // The S4 thermometer keys (thermo*) are the ONE sanctioned money signal:
    // owner-locked formula over declared expectations + admin-sourced market
    // averages, shown only when both components really exist. Everything
    // else on the today screen / player card stays money-free.
    const dropThermo = (o: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(o).filter(([k]) => !k.startsWith("thermo")),
      );
    const blob =
      JSON.stringify(lt.todayScreen) +
      JSON.stringify(en.todayScreen) +
      JSON.stringify(dropThermo(lt.playerCard)) +
      JSON.stringify(dropThermo(en.playerCard));
    expect(blob).not.toMatch(/€|eur|salary|atlyginim|top \d|%|guarant|garantuo/i);
    expect(blob).not.toMatch(/employer (viewed|is interested)|darbdavys (peržiūrėjo|domisi)/i);
  });
  it("week headline speaks human, not system (no raw counter phrasing)", () => {
    expect(lt.todayScreen.week.confirmedHeadline).toMatch(/tavo darbas patvirtintas/);
    expect(en.todayScreen.week.confirmedHeadline).toMatch(/Your work was confirmed/);
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
