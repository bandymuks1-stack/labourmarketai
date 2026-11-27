import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  candidateActionability,
  isClosedNeedHistory,
  mayOfferEmployerActions,
  type CandidateActionabilityInput,
} from "./candidate-actionability";

/**
 * P0.2 candidate-to-hire, step 9. A closed need told the employer "below is
 * who was compared and what was decided" and then listed nobody: every
 * candidate of a closed need is `need_closed`, and the reader dropped all of
 * them. The history is the people the need recorded a fact about. It is read
 * only: nobody in it becomes actionable.
 */
const NOW = "2026-11-14T08:00:00.000Z";
const input = (o: Partial<CandidateActionabilityInput>): CandidateActionabilityInput => ({
  needStatus: "closed",
  needStartsOn: null,
  workerRecordPresent: true,
  interestStatus: null,
  shortlistStatus: null,
  availabilityStatus: "available",
  availableFrom: null,
  ...o,
});
const verdict = (o: Partial<CandidateActionabilityInput>) => candidateActionability(input(o), NOW);

describe("a closed need keeps its history", () => {
  it.each([
    ["saved", null],
    ["interested", null],
    ["reviewed", null],
    ["not_fit", null],
    [null, "interested"],
    [null, "reviewed"],
    [null, "contacted"],
    ["not_fit", "interested"],
  ] as const)("shortlist %s / interest %s is history", (shortlistStatus, interestStatus) => {
    const a = verdict({ shortlistStatus, interestStatus });
    expect(a).toEqual({ kind: "not_actionable", reason: "need_closed" });
    expect(isClosedNeedHistory(a, { shortlistStatus, interestStatus })).toBe(true);
    // History is never an offer: no contact, no dates, no decision control.
    expect(mayOfferEmployerActions(a)).toBe(false);
  });

  it("a person who was only ever a match, with nothing recorded, is not history", () => {
    const a = verdict({});
    expect(isClosedNeedHistory(a, { shortlistStatus: null, interestStatus: null })).toBe(false);
  });

  it("a withdrawn interest with no employer decision stays out, as on an open need", () => {
    const a = verdict({ interestStatus: "withdrawn" });
    expect(isClosedNeedHistory(a, { shortlistStatus: null, interestStatus: "withdrawn" })).toBe(false);
  });

  it("an OPEN need is untouched: a 'not a fit' is still removed from the current list", () => {
    const a = verdict({ needStatus: "open", shortlistStatus: "not_fit" });
    expect(a).toEqual({ kind: "not_actionable", reason: "employer_decided" });
    expect(isClosedNeedHistory(a, { shortlistStatus: "not_fit", interestStatus: null })).toBe(false);
  });
});

describe("the reader and the page agree on it", () => {
  const web = join(__dirname, "..", "..");
  const reader = readFileSync(join(web, "lib/scouting/scouting.ts"), "utf8");
  const page = readFileSync(join(web, "app/[locale]/dashboard/company/scouting/page.tsx"), "utf8");

  it("the assessed list keeps actionable people OR closed-need history, nothing else", () => {
    expect(reader).toMatch(
      /mayOfferEmployerActions\(actionability\) \|\|\s+isClosedNeedHistory\(actionability, \{\s+interestStatus: interestByWorker\[c\.workerId\] \?\? null,\s+shortlistStatus: shortlist\.get\(c\.workerId\)\?\.status \?\? null,/,
    );
  });

  it("every control on a candidate card is behind an open need", () => {
    expect(page).toMatch(/\{c\.canContact && needOpen \? \(/);
    expect(page).toMatch(/\{needOpen \? \(\s+<ScoutingShortlistButtons/);
    expect(page).toMatch(/\{needOpen && !actsForClient && result\.interestByWorker\[c\.workerId\] \? \(\s+<CompanyInterestAck/);
    // The recorded decision is shown as a fact where the control would be.
    expect(page).toContain("data-testid={`scout-shortlist-history-${c.workerId}`}");
    expect(page).toContain('data-testid="scouting-closed-history"');
  });
});
