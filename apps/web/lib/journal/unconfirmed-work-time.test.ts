import { describe, expect, it } from "vitest";

import {
  reviewUnconfirmedWorkTime,
  type UnconfirmedWorkTimeInput,
} from "./unconfirmed-work-time";

function input(p: Partial<UnconfirmedWorkTimeInput> = {}): UnconfirmedWorkTimeInput {
  return {
    fragments: [],
    entryTimeStatus: "confirmed",
    entryTimeValue: "",
    ...p,
  };
}

describe("a save must never silently discard hours the worker wrote", () => {
  it("a pending fragment duration blocks the save", () => {
    const r = reviewUnconfirmedWorkTime(
      input({ fragments: [{ status: "pending", timeValue: 3 }] }),
    );
    expect(r.unreviewedCount).toBe(1);
    expect(r.wouldSilentlyDiscard).toBe(true);
  });

  it("this is the real production shape: several pending durations at once", () => {
    // "3h staliaus darbai / 6,5h betonavimas" — two fragments, neither
    // confirmed, both dropped today.
    const r = reviewUnconfirmedWorkTime(
      input({
        fragments: [
          { status: "pending", timeValue: 3 },
          { status: "pending", timeValue: 6.5 },
        ],
      }),
    );
    expect(r.fragmentCount).toBe(2);
    expect(r.wouldSilentlyDiscard).toBe(true);
  });

  it("a pending ENTRY-level duration blocks the save too", () => {
    const r = reviewUnconfirmedWorkTime(
      input({ entryTimeStatus: "pending", entryTimeValue: "9" }),
    );
    expect(r.entryPending).toBe(true);
    expect(r.wouldSilentlyDiscard).toBe(true);
  });

  it("accepts the comma decimal Lithuanian workers actually write", () => {
    // Refusing to SEE "6,5" here would recreate the loss this guards against.
    const r = reviewUnconfirmedWorkTime(
      input({ entryTimeStatus: "pending", entryTimeValue: "6,5" }),
    );
    expect(r.entryPending).toBe(true);
  });

  it("counts fragments and the entry-level duration together", () => {
    const r = reviewUnconfirmedWorkTime(
      input({
        fragments: [
          { status: "pending", timeValue: 4 },
          { status: "pending", timeValue: 2 },
        ],
        entryTimeStatus: "pending",
        entryTimeValue: "9",
      }),
    );
    expect(r.unreviewedCount).toBe(3);
  });
});

describe("a decision the worker already made is never second-guessed", () => {
  it("DISCARDED is an answer — it does not block", () => {
    const r = reviewUnconfirmedWorkTime(
      input({ fragments: [{ status: "discarded", timeValue: 8 }] }),
    );
    expect(r.unreviewedCount).toBe(0);
    expect(r.wouldSilentlyDiscard).toBe(false);
  });

  it("confirmed and edited do not block", () => {
    for (const status of ["confirmed", "edited", "saved", "already_saved"]) {
      const r = reviewUnconfirmedWorkTime(
        input({ fragments: [{ status, timeValue: 8 }] }),
      );
      expect(r.wouldSilentlyDiscard, status).toBe(false);
    }
  });

  it("a discarded entry-level duration does not block", () => {
    const r = reviewUnconfirmedWorkTime(
      input({ entryTimeStatus: "discarded", entryTimeValue: "9" }),
    );
    expect(r.wouldSilentlyDiscard).toBe(false);
  });
});

describe("only real durations count — nothing is invented", () => {
  it("a pending fragment with NO parsed duration does not block", () => {
    // The worker wrote something the pipeline could not time. Blocking on it
    // would demand a decision about a number that does not exist.
    for (const timeValue of [null, undefined, 0]) {
      const r = reviewUnconfirmedWorkTime(
        input({ fragments: [{ status: "pending", timeValue }] }),
      );
      expect(r.wouldSilentlyDiscard).toBe(false);
    }
  });

  it("a negative or unparsable entry-level value is not a duration", () => {
    for (const entryTimeValue of ["", "   ", "abc", "-3", "0"]) {
      const r = reviewUnconfirmedWorkTime(
        input({ entryTimeStatus: "pending", entryTimeValue }),
      );
      expect(r.entryPending, entryTimeValue).toBe(false);
    }
  });

  it("an entry with no time at all saves freely", () => {
    expect(reviewUnconfirmedWorkTime(input()).wouldSilentlyDiscard).toBe(false);
  });
});
