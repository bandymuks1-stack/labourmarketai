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
 * Final-CTA nested-interactive fix (owner directive 2026-08-11, PUBLIC BETA
 * TRAIN V5_1 §2) — the landing's four final CTAs were
 * `<Link><Button>label</Button></Link>`. The <button> carried every style
 * including the focus ring, while the <a> that actually navigates was an
 * unstyled `w-full` box; measured on the sibling /create-cv CTA at 320-1440px
 * the equivalent anchor was 20px tall against a 44px-looking button. The pair
 * also formed TWO tab stops for one action, and interactive content inside an
 * <a> is invalid HTML. The anchor now carries the shared CTA grammar
 * (`buttonLinkClassName`) directly — SAME classes, same rendered look, only
 * the element carrying them changed; no copy, colour or layout was touched.
 *
 * The regeneration touched EXACTLY ONE file hash — final-cta-band.tsx — and
 * ZERO namespace hashes, which is the whole proof that nothing else moved:
 * the i18n drift assertion passed untouched while the file assertion named
 * this one path. The fix is guarded permanently by
 * `cta-not-nested-interactive.test.ts`, which RENDERS the band and fails on a
 * nested control or a missing 44px floor, so the freeze is not the only thing
 * standing between the landing and the nesting coming back. That guard also
 * closes a real gap: the browser spec that found this
 * (tests/e2e/acquisition-cta-touch-floor.spec.ts) does not run in CI, which
 * executes vitest only.
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
 *
 * Landing minimal truth update (owner mandate 2026-08-17, functional
 * completion train V2 §27) — the landing gained ONE new section,
 * `market-proof-band.tsx`: production-derived market floors ("41 000+"
 * active opportunities / "7 600+" employers / 21 regions, read back from
 * `public_vacancies` on 2026-08-17 21:22 UTC — query + values in the
 * component header) and the data-derived top-profession ranking (ranking
 * only, no absolute counts — profession grouping covers part of the
 * listings and the visible note says so). Coverage framing only; the
 * adoption-verb separation is enforced permanently by
 * `market-coverage-claims.test.ts` and the copy↔floor agreement by
 * `landing-market-proof.test.ts`, so the freeze is not the only thing
 * standing between the landing and a stale or dishonest number. The
 * regeneration touched the page hash, the new component (added to the
 * frozen set), and the three `*.landing` namespace hashes
 * (`landing.marketProof` added in all 11 catalogs; lt/en/ru are the frozen
 * three). No other frozen artefact moved.
 *
 * Market-proof honest browsable basis (OWNER APPROVAL 2026-08-19, numbers-only
 * correction; finding in docs/audits/landing-coverage-claim-basis-2026-08-18.md)
 * — the band advertised "41 000+ active job opportunities" and "7 600+
 * employers" under "On the platform right now". Those floors were read on
 * `is_active AND lifecycle = 'published'`. The public job board shipped a day
 * later (#1184/#1190) and selects on a NARROWER predicate — the one in
 * `count_public_vacancies_v1` and its three siblings — so /jobs renders a
 * smaller number than the landing promises, and a visitor could disprove the
 * landing in one click.
 *
 * Re-measured over a five-day window (2026-08-15..19) rather than one moment,
 * because a floor from a single reading is a spot price: browsable vacancies
 * ran 40,460 · 40,089 · 37,105 · 38,181 · 39,795 and identified employers
 * 7,482 · 7,416 · 7,252 · 7,433 · 7,628. So "7 600+" was false on FOUR of those
 * five days — a second defect the original finding had not caught. New floors
 * clear the window trough with headroom: 35 000+ / 7 000+ / 21.
 *
 * Numbers and the as-of date ONLY. No layout, no wording, no new claim, no new
 * surface. The regeneration touched EXACTLY ONE file hash —
 * market-proof-band.tsx, whose header comment carries the measurement
 * provenance — and the three `*.landing` namespace hashes. Zero other frozen
 * artefacts moved, which is the proof that this stayed a numbers correction.
 * Permanently guarded by `floorsAreSupportedBy` in
 * `lib/analytics/market-coverage-claims.ts`: a public floor may only derive
 * from the job board's own predicate, over a multi-day window, and must clear
 * the window LOW with at least 3% headroom. The freeze is not the only thing
 * standing between the landing and an unbacked number.
 *
 * LIVE / FOCUS modes (OWNER ADDENDUM 2026-08-20, PR #1221) — the approved
 * command remains LIVE v1 and gains one user-selectable, locally persisted
 * FOCUS presentation on the SAME canonical `/` acquisition surface. FOCUS
 * reuses the shared image, content, governed reader, routes and SEO, while
 * LIVE-only duplicate image layers, activity DOM and motion listeners are
 * mounted only after the stored mode resolves to LIVE. The existing
 * first-party telemetry boundary gained bounded `mode` attribution and the
 * five owner-specified landing events; no provider, PII, route or public
 * surface was added. The pure landing-experience contract joins this frozen
 * set, and `landing-experience-modes.test.ts` permanently guards canonical
 * integrity, persistence, workload deferral and analytics dimensions.
 *
 * FOCUS = the RESTORED previous production landing (OWNER APPROVAL 2026-08-22,
 * granted verbatim for "restore the actual previous production
 * labourmarket.ai landing as FOCUS, while keeping the current LIVE landing
 * unchanged") — the FOCUS shipped by #1221 was a calmer RESTYLING of the LIVE
 * tree, so the canonical surface was being compared against itself. FOCUS is
 * now the landing production actually served immediately before #1221:
 * `app/[locale]/(marketing)/page.tsx` at 7179882, recovered from git rather
 * than rebuilt. That file is the only one that has ever served `/{locale}`
 * and `git log --diff-filter=D` shows 5c78ac5 deleted it, so 7179882 is its
 * final production state by definition rather than by judgement.
 *
 * The six components it composes are the ORIGINALS, unmodified: `git diff
 * 7179882 main -- components/marketing/` is EMPTY, so restoring the
 * composition restores the rendered landing. They join this frozen set for
 * the first time since #1221 narrowed it to the live tree, together with the
 * restored composition and its switcher. `market-proof-band.tsx` is
 * DELIBERATELY re-frozen at its existing hash: its production-derived floors
 * are owner-approved truth (see the 2026-08-19 entry above) and restoring the
 * landing means restoring them, not re-deriving them.
 *
 * The regeneration moved exactly three existing hashes —
 * `app/[locale]/page.tsx` (now a server dispatcher between the two arms),
 * `live-market-command.tsx` (its switcher reloads instead of restyling) and
 * `landing-experience.ts` (the bounded mode cookie the server reads) — and
 * ZERO namespace hashes, which is the proof that no copy moved in either
 * arm. LIVE's composition, motion, data panels and CTAs are untouched.
 * Permanently guarded by `landing-experience-modes.test.ts`, which now pins
 * the restoration itself: the six components, their order, the historical
 * wrapper and `#how-it-works` anchor, and the reproduced (marketing) chrome.
 *
 * FOCUS BECOMES THE DEFAULT + ONE MARKET TRUTH (OWNER COMMAND 2026-08-22,
 * approval granted verbatim for this exact change) — three bindings, no
 * redesign of either arm:
 *
 *   1. DEFAULT. `page.tsx` now falls back to FOCUS, so a visitor without an
 *      explicit choice gets the stable landing and LIVE opens only when it is
 *      chosen. Persistence became explicit-only: both arms stopped writing
 *      the record on mount, because a mount-write forges an "explicit choice"
 *      for anyone who merely arrived and makes a real LIVE choice
 *      indistinguishable from the old automatic default. Ambiguous or absent
 *      state therefore resolves to FOCUS, as the command requires.
 *   2. DISCOVERY. The FOCUS switcher's LIVE control gained a 6 px status dot
 *      with a slow breathe and ONE bounded three-cycle attention pulse after
 *      the hero settles. No popup, banner, toast or tooltip, and not one word
 *      added to the restored composition — the switch itself is the
 *      invitation. Under `prefers-reduced-motion` both animations drop and
 *      the dot remains, so the signal never depends on motion alone.
 *   3. ONE MARKET TRUTH. `market-proof-band.tsx` no longer renders typed
 *      floors. It receives the SAME `readLiveMarketLandingSnapshot` result
 *      LIVE renders — same projection, same 300 s cache entry — and prints
 *      the exact counts, omitting them entirely when the reader cannot
 *      answer. Provenance is the reader's own refresh stamp plus a
 *      subordinate `Data source · Sweden`, never a pinned date. The static
 *      `regions` stat was audited and REMOVED: the public vacancy contract
 *      exposes no region count, so inside a band stating current verified
 *      data it could only read as a live European statistic while silently
 *      going stale. The grid drops to two columns; nothing else moves.
 *
 * The i18n regeneration is the proof that this stayed a data change: the
 * three frozen `*.landing` namespace hashes moved ONLY because the stale
 * `stats.*.value`, `stats.regions` and `asOfNote` keys were deleted from all
 * eleven catalogs — no copy was rewritten, and the labels, eyebrow, title and
 * ranking notes are byte-identical. `verified-market-data-live.test.ts` now
 * pins BOTH presentations to the one canonical reader, and
 * `landing-market-proof.test.ts` was inverted: it used to prove the typed
 * numbers equalled the claim module, and now proves no catalog carries a
 * market total at all.
 *
 * LIVE-arm funnel beacon (acquisition readiness v1, owner handoff 2026-08-31
 * §12, PR #1370) — the FOCUS landing and every (marketing) page mount
 * `MarketingFunnelBeacon`, but the LIVE tree did not: a visitor who had
 * explicitly chosen LIVE produced no `landing_viewed` event and no
 * first-touch capture, so LIVE-arm ad landings were invisible in the
 * acquisition funnel. `live-market-page.tsx` now mounts the SAME beacon
 * component with the same once-per-tab-session semantics ahead of the
 * unchanged composition. The beacon renders NOTHING — no copy, no layout,
 * no data, no visual output moved. The regeneration touched EXACTLY ONE
 * file hash — live-market-page.tsx — and ZERO namespace hashes, which is
 * the proof this stayed a telemetry mount.
 */

/** Paths relative to apps/web. The landing page + its full render tree.
 *  PR-H global landing (owner-directed landing replacement plan): the world
 *  map + the new section components joined the render tree and are frozen
 *  with it; live-map.tsx stays frozen (still in the repo, restorable). */
export const FROZEN_LANDING_FILES = [
  // Owner decision 2026-08-20: the living European labour-market command is
  // the production V1. Freeze the actual root composition, its shared server
  // assembler, cinematic client, styling and governed public-data reader.
  "app/[locale]/page.tsx",
  "app/[locale]/live-market-review/live-market-page.tsx",
  "app/[locale]/live-market-review/live-market-command.tsx",
  "app/[locale]/live-market-review/live-market-command.module.css",
  "lib/market/live-market-landing.ts",
  "lib/telemetry/landing-experience.ts",
  // Owner approval 2026-08-22: FOCUS is the RESTORED previous production
  // landing, so its composition, its switcher and the six original
  // components it renders are part of the landing render tree again.
  "app/[locale]/focus-landing/focus-landing.tsx",
  "app/[locale]/focus-landing/landing-mode-switcher.tsx",
  "app/[locale]/focus-landing/landing-mode-switcher.module.css",
  "components/marketing/hero-live-demo.tsx",
  "components/marketing/product-chain-band.tsx",
  "components/marketing/market-proof-band.tsx",
  "components/marketing/player-card-showcase.tsx",
  "components/marketing/trust-band.tsx",
  "components/marketing/final-cta-band.tsx",
] as const;

/**
 * Top-level message namespaces the landing render tree reads. Frozen in the
 * locales that were active when the freeze started; newly activated locales
 * (nl/de) ADD these namespaces without changing the frozen ones.
 */
export const FROZEN_LANDING_NAMESPACES = [
  "livingMarketReview",
  "landing",
  "hero",
  "nav",
  "professions",
  "workEntryReview",
  "live",
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
