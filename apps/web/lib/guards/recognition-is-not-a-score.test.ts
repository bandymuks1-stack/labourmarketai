import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SEP-6 / doctrine section 7: a recognition is an independent assessor's act,
 * not a score. It must not enter confidence, trust or matching rank. The
 * "recognised by" view and the recognition reader are consumed by the person's
 * own surfaces only; this pins that no ranking / matching / scoring module
 * reads them.
 */
const lib = resolve(__dirname, "..");
const RANKING_DIRS = ["market", "matching", "match", "search", "scoring", "trust"];
const FORBIDDEN = ["recognised-by-view", "competency_recognitions", "getOwnRecognitionRows", "getOwnRecognisedByRows"];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

describe("a recognition never reaches a ranking", () => {
  for (const d of RANKING_DIRS) {
    it(`lib/${d} does not read recognitions`, () => {
      let files: string[] = [];
      try {
        files = walk(join(lib, d));
      } catch {
        return; // directory absent: nothing can read it
      }
      const offenders = files.filter((f) => FORBIDDEN.some((w) => readFileSync(f, "utf8").includes(w)));
      expect(offenders).toEqual([]);
    });
  }
});
