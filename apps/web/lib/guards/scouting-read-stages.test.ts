import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The company's "who fits this need" page reads in batches, not one await per
 * read.
 *
 * `/dashboard/company/scouting` is the second step of the company path
 * (need → candidates → contact). After the need was chosen it awaited up to
 * nine reads one after another: the scouting run, the auto-match receipt, the
 * agency-offered candidates, the team offers, the applicant identities, the
 * offer booking statuses, the contact-detail asks, the pipeline facts and the
 * project list. None of the stage-1 reads needs another, and none of the
 * stage-2 reads needs anything but the scouting result, so the page waited for
 * the SUM of the round trips where the slowest one would do. On the shared
 * PostgREST pool that sum is what a phone user feels.
 *
 * The rule pinned here: those reads run as two `Promise.all` stages, and none
 * of them comes back as a lone `await`.
 */

const PAGE = readFileSync(
  resolve(__dirname, "../../app/[locale]/dashboard/company/scouting/page.tsx"),
  "utf8",
);

function stage(opener: string): string {
  const start = PAGE.indexOf(opener);
  expect(start, `stage "${opener}" present`).toBeGreaterThan(-1);
  const end = PAGE.indexOf("]);", start);
  return PAGE.slice(start, end);
}

describe("scouting page — the reads after the need is chosen run in stages", () => {
  it("stage 1 batches the scouting run with the reads that need only the need", () => {
    const s1 = stage("const [result, offeredCandidates, contactRequests] = await Promise.all([");
    expect(s1).toMatch(/runScouting\(selected, requestedFilters\)/);
    expect(s1).toMatch(/listOfferedCandidatesForRequest\(selected\)/);
    expect(s1).toMatch(/getScoutingContactRequestStates\(selected\)/);
  });

  it("stage 2 batches every read that needs the scouting result", () => {
    const s2 = stage(
      "const [autoMatchReceipt, teamOffers, appliedIdentities, offerBookingStatus, pipelineFacts] =",
    );
    for (const read of [
      "readLastAutoMatchReceipt(",
      "loadTeamOffersForDemand(",
      "getApplicantIdentity(",
      "readOfferBookingStatuses(",
      "loadDemandPipelineFacts(",
    ]) {
      expect(s2, read).toContain(read);
    }
  });

  it("none of the batched reads is awaited on its own", () => {
    for (const read of [
      "runScouting",
      "readLastAutoMatchReceipt",
      "listOfferedCandidatesForRequest",
      "loadTeamOffersForDemand",
      "readOfferBookingStatuses",
      "getScoutingContactRequestStates",
      "loadDemandPipelineFacts",
    ]) {
      expect(PAGE, `lone await ${read}`).not.toMatch(new RegExp(`await ${read}\\(`));
    }
  });
});
