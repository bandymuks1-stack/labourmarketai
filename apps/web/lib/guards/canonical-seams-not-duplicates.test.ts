import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { WORK_CARD_AVAILABILITY_STATUSES } from "@/lib/worker/work-card-core";
import { ASSET_AVAILABILITY } from "@/lib/assets/assets-model";

/**
 * THINGS THAT LOOK LIKE DUPLICATES AND ARE NOT.
 *
 * Step D re-examined the convergence backlog against the five-point proof and
 * found that its two headline items were FALSE, for opposite reasons. Both
 * would have caused real damage if "converged" on the strength of the name:
 *
 *  · EVID-5 asked for a TypeScript reader that UNIONS the three hour stores.
 *    They are not three truths — they are a pipeline. `timesheet_compute_lines_v1`
 *    is labelled THE CANONICAL HOUR FACT and carries an allocation-wins dedupe
 *    so an entry referenced by a live allocation counts exactly ONCE. A union
 *    would double-count by construction. The convergence had already happened
 *    anyway: OWNER RULING 2026-08-18 made `lib/journal/work-time.ts` the one
 *    derivation rule, closing a defect where three computations gave 0 h, 5 h
 *    and 9 h for the same production entry.
 *
 *  · CAL-3 counted "four incompatible availability vocabularies". They belong
 *    to four different SUBJECTS — a person, a team, a piece of equipment —
 *    and share only the English word "available".
 *
 * This guard pins both, so the same findings cannot be re-derived from names
 * and acted on. It does NOT claim the code is free of real duplication; it
 * claims these particular shapes are load-bearing distinctions.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "tests") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("the hour stores are a pipeline, and stay one", () => {
  it("work-time.ts is still THE derivation rule, and says whose ruling that is", () => {
    const src = read("lib/journal/work-time.ts");
    expect(src).toMatch(/CANONICAL WORK-TIME DERIVATION/);
    expect(src).toMatch(/OWNER RULING 2026-08-18/);
    // The rule that makes double counting structurally impossible.
    expect(src).toMatch(/never summed|A and B are never summed/i);
  });

  it("no product module reads all three hour stores together", () => {
    // That combination is the shape of a union reader. The dedupe that makes
    // hours count once lives in SQL (`timesheet_compute_lines_v1`); a
    // TypeScript module that gathered all three would have to re-implement it
    // — a second home for the hour truth — or silently double-count.
    const offenders: string[] = [];
    for (const abs of [
      ...sources(join(APP, "lib")),
      ...sources(join(APP, "app")),
    ]) {
      const src = readFileSync(abs, "utf8");
      const hits = [
        /from\("work_hour_allocations"\)/.test(src),
        /from\("timesheets"\)/.test(src),
        /from\("journal_entry_metrics"\)/.test(src),
      ].filter(Boolean).length;
      if (hits === 3) offenders.push(relative(APP, abs).split(sep).join("/"));
    }
    expect(
      offenders,
      "this module reads all three hour stores — if it sums them it double-counts; " +
        "the reconciliation belongs in timesheet_compute_lines_v1, which dedupes",
    ).toEqual([]);
  });
});

describe("availability vocabularies describe different subjects", () => {
  it("a person, a team and a piece of equipment do not share one vocabulary", () => {
    const worker = [...WORK_CARD_AVAILABILITY_STATUSES].sort();
    const asset = [...ASSET_AVAILABILITY].sort();
    expect(worker).toEqual(["available", "busy", "unavailable"]);
    expect(asset).toEqual(["assigned", "available", "maintenance", "retired"]);
    // Overlapping on one token is not sameness. If a future change makes these
    // identical it has almost certainly collapsed a real distinction.
    expect(worker).not.toEqual(asset);
  });

  it("the team vocabulary keeps its date-bearing state", () => {
    // `available_from` is why the team vocabulary cannot fold into the
    // worker one: it pairs a state with a start date, which the worker model
    // carries in a separate `availableFrom` column instead.
    const src = read("lib/company/team-brigades.ts");
    expect(src).toMatch(/"available_now"/);
    expect(src).toMatch(/"available_from"/);
    expect(src).toMatch(/"not_available"/);
  });
});

describe("the frozen matching fork is frozen, not converged", () => {
  it("the canonical engine stays pure, which is what let it be compared at all", () => {
    const src = read("lib/market/match-v1.ts");
    expect(src).toMatch(/This file is PURE \(no DB, no fetch, no persistence\)/);
  });

  it("the public preview still refuses to state a score", () => {
    // The fork's honesty rests on this: its input is hand-typed by a stranger
    // with no evidence behind it, so it reports blocker verdicts and counts,
    // never a percentage that would imply evidence it does not have.
    const src = read("lib/staffing/match-preview.ts");
    expect(src).toMatch(/never a % or AI score|NOT a fabricated percentage/i);
  });
});
