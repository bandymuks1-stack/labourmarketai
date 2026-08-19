import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * DOCS MUST NOT CONTRADICT THE APPLIED LEDGER (owner section 19: "outdated
 * audit artifacts that actively mislead agents").
 *
 * This exists because the same defect bit three times in one session. An audit
 * written before a migration was applied says NOT APPLIED, stays in the repo,
 * and is then read as current truth by the next agent. The worst instance was
 * `docs/plans/ai-runtime-consolidation-plan-v1.md`, which stated that setting
 * `AI_PROVIDER_MODE=live` before `20260714150000` meant "no spend ceiling and
 * no audit trail" — a forward-looking SAFETY claim, false on both halves since
 * 2026-08-03 (the table was applied) and PR #1197 (the ceiling now fires).
 *
 * The rule is narrow on purpose. A dated audit MAY record what was true when
 * it was written — that is history, and deleting it would be worse. What it may
 * not do is assert the CURRENT state without a correction beside it. So this
 * checks only for an uncorrected claim about a migration the ledger records as
 * applied, and it is satisfied by adding the correction, never by deleting the
 * history.
 *
 * Production is not reachable from CI, so the APPLIED_LEDGER is the source of
 * truth here — which is exactly what the ledger is for.
 */
const repoRoot = join(__dirname, "..", "..", "..", "..");
const docsRoot = join(repoRoot, "docs");

/** Migrations the ledger records as applied AND that docs once denied. */
const APPLIED_BUT_ONCE_DENIED = [
  { migration: "20260714150000", table: "ai_runs", ledgerVersion: "20260803061937" },
] as const;

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

/** A denial is "corrected" when the same line or its neighbourhood says so. */
const CORRECTION_MARKERS = [
  /corrected 2026-\d{2}-\d{2}/i,
  /\bapplied\b[^.]{0,80}\bledger\b/i,
  /superseded/i,
  /original text/i,
];

describe("no doc denies a migration the ledger says is applied", () => {
  const ledger = readFileSync(join(docsRoot, "APPLIED_LEDGER.md"), "utf8");

  it.each(APPLIED_BUT_ONCE_DENIED)(
    "$migration is recorded as applied in APPLIED_LEDGER.md",
    ({ migration, ledgerVersion }) => {
      // If this fails the fixture is wrong, not the docs — check before editing.
      expect(ledger).toContain(migration);
      expect(ledger).toContain(ledgerVersion);
    },
  );

  it.each(APPLIED_BUT_ONCE_DENIED)(
    "no uncorrected doc still claims $table is absent from production",
    ({ table }) => {
      const offenders: string[] = [];
      for (const file of markdownFiles(docsRoot)) {
        // The ledger itself quotes the old state as history — that is its job.
        if (file.endsWith("APPLIED_LEDGER.md")) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          const mentionsTable = line.includes(table);
          if (!mentionsTable) return;
          const deniesIt =
            /not applied/i.test(line) ||
            /absent from production/i.test(line) ||
            /gated by design/i.test(line);
          if (!deniesIt) return;
          // A correction may sit on the line, in the lines just above it, or
          // as a document-level banner. The banner case is the honest remedy
          // for an audit that is stale in many places at once: rewriting every
          // sentence would destroy what the audit actually observed, while one
          // dated notice at the top tells the reader how to read all of them.
          const context = lines.slice(Math.max(0, i - 14), i + 2).join("\n");
          if (CORRECTION_MARKERS.some((re) => re.test(context))) return;
          const banner = lines.slice(0, 40).join("\n");
          if (
            /corrected 2026-\d{2}-\d{2}/i.test(banner) &&
            banner.includes(table)
          ) {
            return;
          }
          offenders.push(
            `${file.replace(repoRoot + "/", "")}:${i + 1} → ${line.trim().slice(0, 110)}`,
          );
        });
      }
      expect(
        offenders,
        `these lines assert a stale production state for "${table}". Add a dated correction beside the claim — do NOT delete the original, it is the record of what was true when written.`,
      ).toEqual([]);
    },
  );
});
