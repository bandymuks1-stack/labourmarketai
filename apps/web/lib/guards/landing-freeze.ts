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
 *
 * BASELINE REGENERATIONS ON RECORD
 * --------------------------------
 * W14 Slice 1 (owner directive 2026-08-02) — "Remove fabricated AI
 * confidence". The hero rendered "Confidence 86%" from a literal in
 * `landing-scenario.ts` (W14 audit P0-1). Removing it necessarily changed a
 * frozen file (`hero-live-demo.tsx`) and the frozen `landing` namespace in
 * lt/en/ru, so the baseline was regenerated as part of that directive. The
 * regeneration touched exactly four hashes — the hero file and the three
 * `*.landing` namespaces — and nothing else in the frozen set moved. The
 * replacement is guarded permanently by `public-no-fabricated-confidence.test.ts`,
 * so the freeze is not the only thing standing between the landing and that
 * number coming back.
 *
 * MarketPulse liveness honesty (owner directive 2026-08-09, beta train §8) —
 * the landing MarketPulse section and its four panels rendered a pulsing
 * `live-dot` over GOVERNED PLACEHOLDER data — visually claiming live market
 * intelligence the platform is not computing (the verified P2 of the
 * 2026-08-09 fake-metrics classification). The five dots were removed; copy
 * and the placeholder registry were NOT touched (the frozen `marketPulse`
 * namespaces already said "overview", not "live", so no namespace hash
 * moved). The regeneration touched exactly five file hashes —
 * market-pulse.tsx, regional-heatmap.tsx, skills-demand-list.tsx,
 * supply-demand-chart.tsx, recent-matches-feed.tsx — and the removal is
 * guarded permanently by `public-market-pulse-liveness.test.ts`, so the
 * freeze is not the only thing standing between the landing and the
 * fake-liveness coming back.
 *
 * S3 player-card honesty (owner directive 2026-08-03) — the retired FUT-style
 * concept card (`components/app/player-card.tsx` + `components/app/
 * ovr-ring.tsx`) was DELETED: `/for-workers` was the last public surface
 * rendering it, and it now renders the canonical `WorkerPlayerCard` with the
 * shared sample from `lib/player-card/sample-card.ts` — the SAME sample the
 * landing showcase uses. That removed a frozen file (player-card.tsx left
 * this list; freezing a deleted file would only make the guard fail to
 * load), extracted the showcase's inline sample into the shared module
 * (player-card-showcase.tsx hash moved, render output unchanged), removed
 * the card payloads + getCard from `content/placeholders.ts`, and pruned the
 * dead `playercards.stat/tier/status/statLegendIntro` keys from the frozen
 * `playercards` namespaces. The removal is guarded permanently by
 * `public-worker-card-honesty.test.ts`, so the freeze is not the only thing
 * standing between the public pages and the OVR fiction coming back.
 */

/** Paths relative to apps/web. The landing page + its full render tree.
 *  PR-H global landing (owner-directed landing replacement plan): the world
 *  map + the new section components joined the render tree and are frozen
 *  with it; live-map.tsx stays frozen (still in the repo, restorable). */
export const FROZEN_LANDING_FILES = [
  "app/[locale]/(marketing)/page.tsx",
  "components/app/preview-chip.tsx",
  "components/app/live-map.tsx",
  "components/app/live-world-map.tsx",
  "components/app/world-geo.ts",
  "components/app/live-ticker.tsx",
  "components/app/market-counters.tsx",
  "components/app/draft-board-columns.tsx",
  "components/app/recent-matches-feed.tsx",
  "components/app/regional-heatmap.tsx",
  "components/app/skills-demand-list.tsx",
  "components/app/supply-demand-chart.tsx",
  // Landing rebuild (owner directive 2026-07-29): the narrative chain —
  // hero demo, six-link product chain, the map moment, the proof band.
  //
  // Premium rebuild (owner directive 2026-07-31): `live-product-demo.tsx` was
  // superseded by `hero-live-demo.tsx` — the same cinematic role, now driving
  // the canonical <MarketMap> — and the dead file was deleted. The freeze
  // follows the component that is actually rendered; freezing a deleted file
  // would only make the guard fail to load.
  "components/marketing/hero-live-demo.tsx",
  "components/marketing/product-chain-band.tsx",
  "components/marketing/market-moment.tsx",
  "components/marketing/proof-band.tsx",
  "lib/use-mounted.ts",
  "components/marketing/draft-board.tsx",
  "components/marketing/market-pulse.tsx",
  "components/marketing/player-card-showcase.tsx",
  "components/marketing/labour-market-evidence.tsx",
  "components/marketing/reveal.tsx",
  "components/marketing/how-it-works-band.tsx",
  "components/marketing/conversation-os-panel.tsx",
  "components/marketing/audience-value-sections.tsx",
  "components/marketing/trust-band.tsx",
  "components/marketing/final-cta-band.tsx",
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
  "landing",
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
