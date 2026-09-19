import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ZERO DATA LEADS TO THE NEXT CANONICAL ACTION (2026-09-19 completion queue).
 *
 * Three empty states explained themselves and offered nothing: the message
 * centre ("No messages yet…"), the market map's "nothing is advertised for
 * {profession}" and the team-roster card that described the invite without
 * linking it. Each now carries ONE link to the canonical door — no sample
 * data, no invented rows. And the employer's per-requirement ledger renders
 * the MET criteria beside the failed and the unknown, with the note that it
 * is evidence comparison, not qualification and not ranking.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de"] as const;
const msgs = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(read(`messages/${l}.json`)) as Record<string, unknown>]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;
const at = (o: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), o);

describe("empty states lead somewhere", () => {
  it("the message centre offers the network when there is nothing yet", () => {
    const src = read("app/[locale]/dashboard/communication/page.tsx");
    expect(src).toMatch(/data-testid="communication-empty-cta"/);
    expect(src).toMatch(/href="\/dashboard\/network"[\s\S]{0,300}t\("emptyCta"\)/);
    for (const l of LOCALES) expect(at(msgs[l], "communication.emptyCta"), l).toBeTruthy();
  });

  it("an empty pool on the map offers to change the work looked for", () => {
    const src = read("app/[locale]/dashboard/market-map/page.tsx");
    expect(src).toMatch(/data-testid="market-map-vacancy-volume-none-cta"/);
    expect(src).toMatch(/href="\/dashboard\/profile#work-directions"/);
    for (const l of LOCALES) expect(at(msgs[l], "marketExplanation.noneOpenCta"), l).toBeTruthy();
  });

  it("the team-roster card links the invitation it describes", () => {
    const src = read("components/app/team-roster-empty-state.tsx");
    expect(src).toMatch(/href="\/dashboard\/network\?type=join_as_employee"/);
    expect(src).toMatch(/team-roster-empty-\$\{variant\}-cta/);
    for (const l of LOCALES) {
      expect(at(msgs[l], "teamRosterEmpty.company.cta"), l).toBeTruthy();
      expect(at(msgs[l], "teamRosterEmpty.agency.cta"), l).toBeTruthy();
    }
  });
});

describe("the employer's requirement ledger renders all three answers", () => {
  const src = read("app/[locale]/dashboard/company/scouting/page.tsx");

  it("MET (matched hard + strengths) beside FAILED (blocking) and UNKNOWN (missing facts)", () => {
    expect(src).toMatch(/data-testid=\{`scout-met-\$\{c\.workerId\}`\}/);
    expect(src).toMatch(/\[\.\.\.c\.match\.matchedHard, \.\.\.c\.match\.strengths\]/);
    expect(src).toMatch(/data-testid=\{`scout-blocking-\$\{c\.workerId\}`\}/);
    expect(src).toMatch(/data-testid=\{`scout-missing-\$\{c\.workerId\}`\}/);
  });

  it("says what it is — evidence comparison, never a qualification or a ranking — in five locales", () => {
    expect(src).toMatch(/data-testid=\{`scout-ledger-note-\$\{c\.workerId\}`\}/);
    for (const l of LOCALES) {
      expect(at(msgs[l], "scouting.tiers.met"), l).toBeTruthy();
      const note = String(at(msgs[l], "scouting.tiers.evidenceNote") ?? "");
      expect(note.length, l).toBeGreaterThan(20);
    }
    // No score, no percentage, no stars anywhere near the ledger.
    const ledger = src.split("scout-met-")[1]?.split("scout-blocking-")[0] ?? "";
    expect(ledger).not.toMatch(/score|rating|★|%/);
  });
});
