import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Landing freeze (owner directive, non-landing launch repair v1).
 *
 * Until the landing page gets its real-data replacement plan, the landing
 * page, every component it renders, its placeholder feed and its i18n
 * namespaces are FROZEN: no PR outside that dedicated plan may change what
 * the landing renders — directly or indirectly through shared components or
 * message keys.
 *
 * This module is the single source of truth for what "the landing" means.
 * The committed baseline (landing-freeze-baseline.json) holds SHA-256 hashes
 * of every frozen artefact; `landing-freeze.test.ts` recomputes them on every
 * test run and fails on any drift. Regenerating the baseline
 * (scripts/generate-landing-freeze-baseline.ts) is an owner-gated act: do it
 * only inside the explicit landing real-data replacement work.
 */

/** Paths relative to apps/web. The landing page + its full render tree. */
export const FROZEN_LANDING_FILES = [
  "app/[locale]/(marketing)/page.tsx",
  "components/app/preview-chip.tsx",
  "components/app/live-map.tsx",
  "components/app/live-ticker.tsx",
  "components/app/market-counters.tsx",
  "components/app/player-card.tsx",
  "components/app/draft-board-columns.tsx",
  "components/app/recent-matches-feed.tsx",
  "components/app/regional-heatmap.tsx",
  "components/app/skills-demand-list.tsx",
  "components/app/supply-demand-chart.tsx",
  "components/marketing/draft-board.tsx",
  "components/marketing/market-pulse.tsx",
  "components/marketing/player-card-showcase.tsx",
  "components/marketing/labour-market-evidence.tsx",
  "components/decor/constellation-bg.tsx",
  // Placeholder feed: landing demo values (counters, personas, board rows)
  // live here, so the whole governed file is part of the freeze.
  "content/placeholders.ts",
] as const;

/**
 * Top-level message namespaces the landing render tree reads. Frozen in the
 * locales that were active when the freeze started; newly activated locales
 * (nl/de) ADD these namespaces without changing the frozen ones.
 */
export const FROZEN_LANDING_NAMESPACES = [
  "hero",
  "journey",
  "labourMarket",
  "live",
  "map",
  "draft",
  "marketPulse",
  "playercards",
] as const;

export const FROZEN_LOCALES = ["lt", "en", "ru"] as const;

export type LandingFreezeSnapshot = {
  files: Record<string, string>;
  namespaces: Record<string, string>;
};

const sha256 = (input: string) =>
  createHash("sha256").update(input).digest("hex");

/** Hash file content with normalized line endings (git/OS independent). */
export function hashFile(webRoot: string, relPath: string): string {
  const raw = readFileSync(join(webRoot, relPath), "utf8");
  return sha256(raw.replace(/\r\n/g, "\n"));
}

/** Stable-stringify a JSON subtree (sorted keys at every level). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Hash one landing namespace subtree of one locale's message catalog. */
export function hashNamespace(
  webRoot: string,
  locale: string,
  namespace: string,
): string {
  const catalog = JSON.parse(
    readFileSync(join(webRoot, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
  return sha256(stableStringify(catalog[namespace] ?? null));
}

/** Compute the full current snapshot (same shape as the committed baseline). */
export function computeLandingFreezeSnapshot(
  webRoot: string,
): LandingFreezeSnapshot {
  const files: Record<string, string> = {};
  for (const rel of FROZEN_LANDING_FILES) {
    files[rel] = hashFile(webRoot, rel);
  }
  const namespaces: Record<string, string> = {};
  for (const locale of FROZEN_LOCALES) {
    for (const ns of FROZEN_LANDING_NAMESPACES) {
      namespaces[`${locale}.${ns}`] = hashNamespace(webRoot, locale, ns);
    }
  }
  return { files, namespaces };
}
