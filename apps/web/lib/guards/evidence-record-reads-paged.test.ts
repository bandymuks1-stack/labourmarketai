import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AN ORGANIZATION'S HISTORY IS READ TO THE END.
 *
 * The server answers at most 1000 rows per request, so a `.limit(5000)` is a
 * silent 1000. Production 2026-10-20: one organization holds 2,944 records,
 * and the matching signals read asked for all 43 of its people at once — two
 * thirds of the history never reached matching. The person's own records
 * read (the ONE experience total, decision 0025) had the same ceiling.
 * Both page with `.range` through `readAllPages`.
 */
const DIR = join(__dirname, "..", "organization-evidence");
const FILES = ["worker-evidence-read.ts", "history-signals-read.ts"];

/** Each `.from("organization_evidence_records")` call up to the end of its chain. */
function recordReads(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf('.from("organization_evidence_records")');
  while (at !== -1) {
    out.push(src.slice(at, src.indexOf(".then(", at) === -1 ? at + 1200 : src.indexOf(".then(", at)));
    at = src.indexOf('.from("organization_evidence_records")', at + 1);
  }
  return out;
}

describe("organization evidence record reads are paged", () => {
  it.each(FILES)("%s pages every records read with a stable order", (file) => {
    const src = readFileSync(join(DIR, file), "utf8");
    expect(src).toMatch(/import \{ readAllPages \} from "\.\/evidence-pagination"/);
    const reads = recordReads(src);
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) {
      expect(r).toMatch(/\.range\(from, to\)/);
      expect(r).toMatch(/\.order\("id", \{ ascending: true \}\)/);
      expect(r).not.toMatch(/\.limit\(/);
    }
  });
});
