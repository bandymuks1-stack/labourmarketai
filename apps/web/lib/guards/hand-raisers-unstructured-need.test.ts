import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard — hand-raisers on a need that names NO trade (owner decision
 * 2026-10-22, verbatim):
 *
 *   "When a worker expresses interest in an open need without a specified
 *    trade, show that interest to the employer immediately, subject to
 *    existing worker privacy and consent rules. Clearly label trade matching
 *    as not assessed. Do not invent or imply verified qualifications."
 *
 * The defect this pins shut: `runScoutingCore` returned `not-structured`
 * BEFORE it read `demand_interest_signals`, so the worker saw "interested"
 * and the employer saw nobody — on the scouting page and in the chat panel.
 * Behaviour is proven in lib/scouting/scouting-hand-raisers.test.ts; this
 * guard pins the surfaces: every renderer states "not assessed", and none of
 * them renders a match field for a person nobody compared.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const CORE = read("lib/scouting/scouting.ts");
const SAFE = read("lib/scouting/scout-safe-view.ts");
const PAGE = read("app/[locale]/dashboard/company/scouting/page.tsx");
const ADAPTER = read("lib/conversation/employer-workspace.ts");
const PANEL = read("components/app/workspace/candidates-result.tsx");

const LOCALES = ["en", "lt", "ru", "pl", "de", "nl"] as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgs = (loc: string): any => JSON.parse(read(`messages/${loc}.json`));

function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `anchor "${start}"`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `anchor "${end}" after "${start}"`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("the scouting core looks at hand-raisers before giving up on structure", () => {
  it("interest is read BEFORE the not-structured return, and the return carries them", () => {
    const read = CORE.indexOf('.from("demand_interest_signals")');
    const giveUp = CORE.indexOf("if (source === null)");
    expect(read).toBeGreaterThan(-1);
    expect(giveUp).toBeGreaterThan(read);
    expect(CORE).toMatch(/kind: "not-structured",\s*demand,\s*handRaisers: await readUnassessedHandRaisers\(/);
    // The result type forces every consumer to see the field.
    expect(CORE).toMatch(/kind: "not-structured"; demand: CompanyDemand; handRaisers: UnassessedHandRaiser\[\]/);
  });

  it("the unassessed read reuses the privacy gates and scores NOTHING", () => {
    const fn = between(CORE, "async function readUnassessedHandRaisers(", "\n}\n");
    // Same visibility read (RLS row / discovery projection), same fixture rule.
    // Every hand-raiser, batched by the pool budget (Codex review #2680): each
    // batch goes through the same supply read with the same fixture rule.
    expect(fn).toMatch(/i \+= SUPPLY_POOL_BUDGET/);
    expect(fn).toMatch(/buildSupplyCandidates\(supabase, \{ workerIds, excludeFixtures: input\.excludeFixtures \}\)/);
    // Same live-proposal verdict; withdrawn hands are not even fetched.
    expect(fn).toMatch(/candidateActionability\(/);
    expect(fn).toMatch(/mayOfferEmployerActions\(actionability\)/);
    expect(fn).toMatch(/status !== "withdrawn"/);
    // Same Step 3A safe view.
    expect(fn).toMatch(/toUnassessedHandRaiser\(/);
    // No match, no ranking, no demotion.
    for (const forbidden of [/matchWorkerToNeed/, /compareMatches/, /freshnessDemotionRank/, /toScoutSafeCandidate/]) {
      expect(forbidden.test(fn), `${forbidden} must not run for an unassessed hand-raiser`).toBe(false);
    }
  });

  it("the safe view carries matchAssessed: false and no match/readiness field", () => {
    expect(SAFE).toMatch(/export interface UnassessedHandRaiser\s+extends Omit<ScoutSafeCandidate, "match" \| "readiness">/);
    expect(SAFE).toMatch(/readonly matchAssessed: false;/);
    const fn = between(SAFE, "export function toUnassessedHandRaiser(", "\n}\n");
    expect(fn).toMatch(/matchAssessed: false/);
    expect(fn).toMatch(/safePreviewAndContact\(input\)/);
    expect(fn).not.toMatch(/match:|readiness|companyCandidateReadiness/);
  });
});

describe("the scouting page shows them, labelled, with no match field", () => {
  const block = between(PAGE, 'data-testid="scouting-hand-raisers-unassessed"', '{result?.kind === "needs-migration"');

  it("renders beside the kept not-structured explanation", () => {
    expect(PAGE).toMatch(/data-testid="scouting-not-structured"[\s\S]{0,80}t\("notStructured"\)/);
    expect(PAGE.indexOf('data-testid="scouting-not-structured"')).toBeLessThan(
      PAGE.indexOf('data-testid="scouting-hand-raisers-unassessed"'),
    );
    expect(PAGE).toMatch(/result\?\.kind === "not-structured" && handRaisers\.length > 0/);
  });

  it("states 'not assessed' for the section AND on every card", () => {
    expect(block).toMatch(/data-match-assessed="false"/);
    expect(block).toMatch(/t\("handRaisers\.notAssessed"\)/);
    expect(block).toMatch(/scout-match-not-assessed-\$\{h\.workerId\}[\s\S]{0,80}t\("handRaisers\.badge"\)/);
    expect(block).toMatch(/t\("handRaisers\.ownWords"\)/);
    expect(block).toMatch(/data-testid=\{`scout-candidate-\$\{h\.workerId\}`\}/);
  });

  it("renders no score, status, skill count, verdict, evidence or readiness", () => {
    for (const forbidden of [
      /\.match\b/,
      // the match-status lookup (`statusLabels[c.match.status]`) — the ack's
      // own `statusLabels:` prop is interest vocabulary and stays.
      /statusLabels\[/,
      /skillCount|skillUnknown|skillFit/,
      /verdict\./,
      /evidenceCount|fields\.evidence/,
      /readiness/,
      /nextAction/,
    ]) {
      expect(forbidden.test(block), `hand-raiser card must not render ${forbidden}`).toBe(false);
    }
  });

  it("keeps the canonical employer actions and the agency refusal", () => {
    for (const control of [
      "<RequestCommunicationButton",
      "<ProposeBookingButton",
      "<RequestContactDetailsButton",
      "<CompanyInterestAck",
      "<ScoutingShortlistButtons",
    ]) {
      expect(block, control).toContain(control);
    }
    // Contact gates: the core's canContact (actionability + schedule), then
    // the deliberate shortlist before a conversation.
    expect(block).toMatch(/h\.canContact \? \(/);
    expect(block).toMatch(/isShortlistedForContact\(h\.shortlistStatus\)/);
    expect(block).toMatch(/actsForClient \? \(/);
    // No country fit was computed, so none is handed to the booking form.
    expect(block).toMatch(/countryCode=\{null\}/);
  });

  it("the applicant identity release is the database's existing rule, unchanged", () => {
    expect(PAGE).toMatch(/getApplicantIdentity\(result\.demand\.id, c\.workerId\)/);
    expect(PAGE).toMatch(/result\?\.kind === "ok" \|\| result\?\.kind === "not-structured"\s*\? Promise\.all\(/);
  });
});

describe("the chat candidates panel shows them, labelled, server-side", () => {
  it("the adapter projects hand-raisers without any match field", () => {
    const branch = between(ADAPTER, 'if (result.kind === "not-structured") {', "\n  }\n");
    expect(branch).toMatch(/matchAssessed: false/);
    expect(branch).toMatch(/handRaisers: raised\.map/);
    for (const forbidden of [/matchStatus/, /coveragePct/, /confirmedCount/, /eligible/, /gaps/, /\.match\b/]) {
      expect(forbidden.test(branch), `${forbidden}`).toBe(false);
    }
  });

  it("the panel states 'not assessed' for the section and in place of the match line", () => {
    expect(PANEL).toMatch(/data-testid="candidates-hand-raisers-unassessed"/);
    expect(PANEL).toMatch(/t\("handRaisersNotAssessed"\)/);
    expect(PANEL).toMatch(/const matched = "matchAssessed" in candidate \? null : candidate;/);
    expect(PANEL).toMatch(/candidate-match-not-assessed-\$\{candidate\.workerId\}[\s\S]{0,80}t\("handRaiserBadge"\)/);
    // Match-derived facts render only for a matched candidate.
    expect(PANEL).toMatch(/matched && !matched\.eligible/);
    expect(PANEL).toMatch(/matched && matched\.gaps\.length > 0/);
    // Still no direct canonical import from the client (w8 guard's rule).
    expect(PANEL).not.toMatch(/@\/lib\/(scouting|demand)\//);
  });
});

describe("copy: 6 locales, says 'not assessed', claims no qualification", () => {
  const CERT_STEM = /verif|confirm|certif|tvirtin|sertifik|подтверж|верифиц|zertifi|bestätig|geverifieerd|bevestig|potwierdz|zweryfik/i;
  const NOT_ASSESSED: Record<(typeof LOCALES)[number], RegExp> = {
    en: /not assessed/i,
    lt: /nevertinta/i,
    ru: /не оценивал/i,
    pl: /nie zostało ocenione|nieocenione/i,
    de: /nicht bewertet/i,
    nl: /niet beoordeeld/i,
  };

  for (const loc of LOCALES) {
    it(`${loc}: every key present, labelled, no certification wording`, () => {
      const m = msgs(loc);
      const h = m.scouting.handRaisers;
      const r = m.conversation.results;
      const texts = [h.title, h.notAssessed, h.badge, h.ownWords, r.handRaisersTitle, r.handRaisersNotAssessed, r.handRaiserBadge];
      for (const s of texts) expect(typeof s === "string" && s.length > 0, `${loc}: missing copy`).toBe(true);
      for (const s of [h.notAssessed, h.badge, r.handRaisersNotAssessed, r.handRaiserBadge]) {
        expect(s, `${loc}: must say not assessed`).toMatch(NOT_ASSESSED[loc]);
      }
      for (const s of texts) {
        expect(s, `${loc}: no certification wording`).not.toMatch(CERT_STEM);
        expect(s, `${loc}: banned term`).not.toMatch(/\bdemo\b/i);
      }
      // The explanation the employer already had is kept.
      expect(m.scouting.notStructured.length).toBeGreaterThan(0);
    });
  }
});
