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

/** A denial is "corrected" when the line, its neighbourhood, or a
 *  document-level banner says so. */
const CORRECTION_MARKERS = [
  /corrected 2026-\d{2}-\d{2}/i,
  /\bapplied\b[^.]{0,80}\bledger\b/i,
  /superseded/i,
  /original text/i,
];

/**
 * How a document says a table is not in production.
 *
 * WIDER AND WRAP-TOLERANT ON PURPOSE. The first version of this guard matched
 * three exact phrases on a SINGLE line, and review found two live claims it
 * therefore missed: one where "`ai_runs`" and "does not exist in production"
 * were split by a line wrap, and one phrased "does not exist in prod" — a
 * wording the allowlist simply did not contain. A guard that misses the thing
 * it exists to catch is worse than no guard, because it converts an unchecked
 * risk into a false sense of coverage.
 */
const DENIAL_PATTERNS = [
  /not applied/i,
  /never applied/i,
  /absent from production/i,
  /gated by design/i,
  /does not exist in prod(uction)?/i,
  /doesn'?t exist in prod(uction)?/i,
  /missing from prod(uction)?/i,
  /no such table/i,
];

/** Lines joined around a mention, so a claim split by a wrap is still seen. */
const WINDOW_LINES = 3;
/**
 * A denial only counts when it sits NEAR the table mention. Markdown tables put
 * unrelated rows on adjacent lines — several of which legitimately say NOT
 * APPLIED about OTHER migrations — so proximity is what separates "this table
 * is denied" from "a neighbour is".
 */
const MAX_CHARS_BETWEEN = 220;

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
        const raw = readFileSync(file, "utf8");
        const lines = raw.split("\n");
        const banner = lines.slice(0, 40).join("\n");
        const bannerCorrects =
          /corrected 2026-\d{2}-\d{2}/i.test(banner) && banner.includes(table);
        if (bannerCorrects) continue;

        lines.forEach((line, i) => {
          if (!line.includes(table)) return;

          // Join a small window so a claim broken by a line wrap is still one
          // string, then require the denial to sit close to the mention.
          const from = Math.max(0, i - WINDOW_LINES);
          // Whitespace is COLLAPSED, not merely joined: markdown indents
          // continuation lines, so a wrapped "does not exist in\n  production"
          // otherwise contains a run of spaces and slips past a pattern that
          // expects one. This was the precise hole that let the first version
          // through even after the window was added.
          const window = lines
            .slice(from, i + WINDOW_LINES + 1)
            .join(" ")
            .replace(/\s+/g, " ");
          const mentionAt = window.indexOf(table);
          const denial = DENIAL_PATTERNS.map((re) => window.search(re)).filter(
            (at) => at >= 0,
          );
          const near = denial.some(
            (at) => Math.abs(at - mentionAt) <= MAX_CHARS_BETWEEN,
          );
          if (!near) return;

          const context = lines.slice(Math.max(0, i - 14), i + 3).join("\n");
          if (CORRECTION_MARKERS.some((re) => re.test(context))) return;

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
