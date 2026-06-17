import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map owner signal depth v1 guard.
 *
 * The owner view now surfaces deeper REAL signals — preferred-location intents /
 * priority / note, and the company-need shape (need type, people, urgency,
 * mobility, accommodation, dates) — all owner-scoped, all localized (never raw
 * enums), with NO public aggregate, NO cross-user read, NO service_role / RPC /
 * SECURITY DEFINER, NO DB migration.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const CAPTURE = read("components/app/market-map-capture.tsx");
const HELPER = read("lib/market-map/capture.ts");
const ACTIONS = read("lib/market-map/capture-actions.ts");
const SIGNALS = read("lib/market-map/signals.ts");
const LOCALES = ["lt", "en", "ru"] as const;
const cap = (loc: string) => JSON.parse(read(`messages/${loc}.json`)).marketMap.capture;

function stripComments(src: string): string {
  return src
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("preferred-location depth — intents / priority / note, localized", () => {
  it("the row renders localized priority + intent chips + note", () => {
    expect(CAPTURE).toMatch(/priority\.\$\{p\.priority\}/);
    expect(CAPTURE).toMatch(/intent\.\$\{i\}/);
    expect(CAPTURE).toContain("capture-preferred-priority");
    expect(CAPTURE).toContain("capture-preferred-intents");
    expect(CAPTURE).toMatch(/p\.shortNote/);
    // never the raw enum token as a label
    expect(CAPTURE).not.toMatch(/>\{p\.priority\}</);
  });
  it("the add form lets the owner pick priority + add a note, passed to the action", () => {
    expect(CAPTURE).toContain("capture-preferred-priority-select");
    expect(CAPTURE).toContain("capture-preferred-note");
    expect(CAPTURE).toMatch(/priority:\s*pPriority/);
    expect(CAPTURE).toMatch(/shortNote:\s*pNote/);
  });
  it("the fetcher reads short_note (so the note can be shown)", () => {
    expect(HELPER).toMatch(/short_note/);
    expect(HELPER).toMatch(/shortNote/);
  });
});

describe("company-need depth — need shape, localized, edit not insert", () => {
  it("the row renders need type / urgency / mobility / accommodation / people / dates", () => {
    expect(CAPTURE).toMatch(/needType\.\$\{n\}/);
    expect(CAPTURE).toMatch(/urgency\.\$\{d\.urgency\}/);
    expect(CAPTURE).toMatch(/demand\.mobility/);
    expect(CAPTURE).toMatch(/demand\.accommodation/);
    expect(CAPTURE).toMatch(/demand\.people/);
    expect(CAPTURE).toMatch(/demand\.dates/);
    expect(CAPTURE).toContain("capture-demand-urgency");
    // visibility + need type are localized, never raw enum labels
    expect(CAPTURE).not.toMatch(/<option key=\{v\} value=\{v\}>\{v\}<\/option>/);
    expect(CAPTURE).not.toMatch(/>\{d\.needType\}</);
  });
  it("need type + visibility are editable (no new insert)", () => {
    expect(CAPTURE).toMatch(/updateDemandLocationAction\(d\.id,\s*\{\s*needType/);
    expect(CAPTURE).toContain("capture-demand-visibility");
    expect(HELPER).not.toMatch(/from\("company_demand_locations"\)[\s\S]{0,80}\.insert/);
  });
  it("the fetcher reads the need-shape columns", () => {
    for (const col of [
      "need_type",
      "people_count_min",
      "people_count_max",
      "start_date",
      "end_date",
      "urgency",
      "mobility_required",
      "accommodation_needed",
    ]) {
      expect(HELPER, col).toContain(col);
    }
  });
});

describe("i18n — depth labels present in every locale", () => {
  for (const loc of LOCALES) {
    it(`${loc}: priority / needType / urgency / demand-detail keys present`, () => {
      const c = cap(loc);
      for (const k of ["primary", "secondary", "optional"]) expect(c.priority?.[k], `${loc} priority.${k}`).toBeTruthy();
      for (const k of ["workers", "team", "service_provider", "transport_support"]) expect(c.needType?.[k], `${loc} needType.${k}`).toBeTruthy();
      for (const k of ["low", "medium", "high"]) expect(c.urgency?.[k], `${loc} urgency.${k}`).toBeTruthy();
      for (const k of ["needTypeLabel", "people", "urgencyLabel", "mobility", "accommodation", "dates"]) expect(c.demand?.[k], `${loc} demand.${k}`).toBeTruthy();
      expect(c.preferred?.priorityLabel && c.preferred?.note, `${loc} preferred labels`).toBeTruthy();
      expect(c.aggregatedHint, `${loc} aggregatedHint`).toBeTruthy();
    });
  }
});

describe("no public aggregate / privileged path / scaffold copy", () => {
  it("the UI never imports the public/cross-user aggregate", () => {
    expect(CAPTURE).not.toMatch(/\bmarketSignals\b/);
  });
  it("no service_role / RPC / SECURITY DEFINER in the capture surface", () => {
    for (const src of [CAPTURE, HELPER, ACTIONS, SIGNALS]) {
      expect(src).not.toMatch(/service_role|SERVICE_ROLE|SECURITY DEFINER/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
  });
  it("no DB schema statements in the capture surface", () => {
    for (const src of [CAPTURE, HELPER, ACTIONS, SIGNALS]) {
      expect(src).not.toMatch(/create table|alter table|drop table/i);
    }
  });
  const BANNED = [
    /\bfake\b/i,
    /netikr/i,
    /kol kas tuščias/i,
    /schema prepared|schema parengta/i,
    /foundation/i,
    /coming.?soon/i,
    /\bRLS\b/,
    /read layer/i,
    /SECURITY DEFINER/i,
  ];
  for (const loc of LOCALES) {
    it(`${loc}: marketMap copy has no banned/technical terms`, () => {
      const blob = JSON.stringify(JSON.parse(read(`messages/${loc}.json`)).marketMap);
      for (const re of BANNED) expect(blob, `${loc} ${re.source}`).not.toMatch(re);
    });
  }
  it("the capture component renders no banned terms", () => {
    const ui = stripComments(CAPTURE);
    for (const re of [/\bfake\b/i, /coming.?soon/i, /netikr/i, /schema prepared/i]) {
      expect(ui, re.source).not.toMatch(re);
    }
  });
});
