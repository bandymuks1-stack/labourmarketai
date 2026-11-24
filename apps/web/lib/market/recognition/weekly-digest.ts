/**
 * Weekly public digest (v1) — PURE. Builds anonymized, aggregate-only digest
 * lines from counts. By construction it CANNOT leak identity: its only input is
 * `WeeklyDigestCounts` (integers + closed-set trade slugs) — there is no field
 * for a name, employer, company, person-location, salary, document or photo.
 *
 * Scheduling, the real data source (aggregate reads), and a public surface are
 * owner-approval-gated (audit §D). This module only produces the digest value
 * from counts a future approved aggregation would supply. No fabricated counters:
 * a zero count produces no line.
 */
import type { WeeklyDigestCounts, WeeklyPublicDigest, LocalizableLine } from "./types";

export function buildWeeklyPublicDigest(
  counts: WeeklyDigestCounts,
): WeeklyPublicDigest {
  const lines: LocalizableLine[] = [];

  if (counts.workersBecameReady > 0)
    lines.push({
      code: "marketRecognition.digest.workersReady",
      params: { n: counts.workersBecameReady },
    });

  if (counts.needsBecameClear > 0)
    lines.push({
      code: "marketRecognition.digest.needsClear",
      params: { n: counts.needsBecameClear },
    });

  if (counts.projectsClarified > 0)
    lines.push({
      code: "marketRecognition.digest.projectsClarified",
      params: { n: counts.projectsClarified },
    });

  // Top trades are closed-set SLUGS (the UI localizes them) — not identities.
  const trades = counts.topTradeSlugs.filter(Boolean).slice(0, 5);
  if (trades.length > 0)
    lines.push({
      code: "marketRecognition.digest.topTrades",
      params: { trades: trades.join(", ") },
    });

  return { lines };
}
