import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { countDecidableCandidateOffers, mostOfferedOpenRequest } from "./bridge-model";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

describe("the offers bell counts only what can still be decided", () => {
  it("an offer on a closed need is not attention", () => {
    const byRequest = new Map([
      [A, 2],
      [B, 1],
    ]);
    expect(countDecidableCandidateOffers(byRequest, new Set([B]))).toBe(2);
  });

  it("every offer on closed needs → the bell clears", () => {
    expect(countDecidableCandidateOffers(new Map([[A, 3]]), new Set([A]))).toBe(0);
  });

  /** UNKNOWN is not closed: a need the caller's list does not carry may be a
   *  colleague's open need, and dropping it would hide a waiting offer. */
  it("a need the list does not carry stays counted", () => {
    expect(countDecidableCandidateOffers(new Map([[C, 1]]), new Set([A]))).toBe(1);
  });

  it("nothing offered → zero", () => {
    expect(countDecidableCandidateOffers(new Map(), new Set())).toBe(0);
  });
});

describe("the bell's link lands on a need with an offer to decide", () => {
  it("picks the open need with the most offers", () => {
    expect(
      mostOfferedOpenRequest(
        new Map([
          [A, 1],
          [B, 3],
        ]),
        [A, B],
      ),
    ).toBe(B);
  });

  it("never picks a closed need, however many offers sit on it", () => {
    expect(
      mostOfferedOpenRequest(
        new Map([
          [A, 1],
          [B, 9],
        ]),
        [A],
      ),
    ).toBe(A);
  });

  it("a tie resolves the same way on every load", () => {
    const m = new Map([
      [B, 2],
      [A, 2],
    ]);
    expect(mostOfferedOpenRequest(m, [A, B])).toBe(A);
    expect(mostOfferedOpenRequest(m, [B, A])).toBe(A);
  });

  it("nothing waiting → no opinion, the page's other rules apply", () => {
    expect(mostOfferedOpenRequest(new Map(), [A, B])).toBeNull();
    expect(mostOfferedOpenRequest(new Map([[C, 2]]), [A, B])).toBeNull();
  });
});

describe("the wiring", () => {
  const web = process.cwd();
  const read = readFileSync(join(web, "lib/agency/bridge-read.ts"), "utf8");
  const page = readFileSync(
    join(web, "app/[locale]/dashboard/company/scouting/page.tsx"),
    "utf8",
  );

  it("the bell's count goes through the closed-need rule", () => {
    const fn = read.slice(
      read.indexOf("export async function countOpenCandidateOffersForClient"),
      read.indexOf("THE BRIDGE'S SPINE COUNTS"),
    );
    expect(fn).toContain("countDecidableCandidateOffers(byRequest, closed)");
    // No second, unfiltered head count beside it.
    expect(fn).not.toContain("head: true");
  });

  it("the page opens the offered need when it was given no instruction", () => {
    expect(page).toMatch(
      /request \?\?\s+mostTeamOffered \?\?\s+mostAgencyOffered \?\?\s+mostAwaited \?\?/,
    );
    // An explicit ?request= still wins: it stays first in the chain above.
    expect(page).toContain("countOpenCandidateOffersByRequest(employerContext.companyId)");
  });
});
