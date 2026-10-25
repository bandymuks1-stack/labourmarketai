import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Own listings and services — the lifecycle reads without instructions
 * (owner direction 2026-10-24: a first-time visitor understands how to
 * publish and how to take it down).
 *
 * Over the EXISTING status model and actions only (`marketplace_listings`
 * draft|active|paused|closed, `service_offerings` draft|active|paused):
 *   1. every row says in words whether others can find it right now;
 *   2. every lifecycle control carries visible text, not an icon alone;
 *   3. taking a row out of search (pause / complete) is reversible and sits
 *      apart from the one irreversible act, the permanent delete, which goes
 *      through the ONE confirmation mechanism at its strongest tier and names
 *      the reversible way first;
 *   4. the status chip is the shared `StatusChip`, not a local colour map.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const LISTINGS = "components/app/marketplace-listings-section.tsx";
const SERVICES = "components/app/service-offerings-section.tsx";

const resolve = (msgs: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (n, k) => (n && typeof n === "object" ? (n as Record<string, unknown>)[k] : undefined),
    msgs,
  );

describe("own listings: visibility, labelled actions, confirmed delete", () => {
  const src = read(LISTINGS);

  it("each own row states whether it is visible in search", () => {
    expect(src).toMatch(/data-testid=\{`listing-visibility-\$\{row\.id\}`\}/);
    expect(src).toMatch(/t\(`searchState\.\$\{isExpired\(row\.expiresAt\) \? "expired" : row\.status\}`\)/);
  });

  it("publish, pause, complete and edit render their words, not an icon alone", () => {
    for (const key of ["pause", "close", "edit"]) {
      expect(src, key).toMatch(new RegExp(`\\{t\\("${key}"\\)\\}`));
    }
    expect(src).toMatch(/row\.status === "draft" \? t\("activate"\) : t\("republish"\)/);
    // The icon-only pattern (words only in aria-label/title) is gone.
    expect(src).not.toMatch(/title=\{t\("(activate|pause|close|edit|remove)"\)\}/);
  });

  it("a closed row offers ONE way back (publish again), not a second reopen-as-draft", () => {
    expect(src).not.toMatch(/changeStatus\(row\.id, "draft"\)/);
  });

  it("delete is the strong-tier InlineConfirm, never a hand-rolled confirm", () => {
    expect(src).toMatch(/<InlineConfirm[\s\S]*?label=\{t\("removeForever"\)\}[\s\S]*?tier="strong_irreversible"[\s\S]*?onConfirm=\{\(\) => remove\(row\.id\)\}/);
    expect(src).not.toMatch(/role="alertdialog"/);
    expect(src).not.toMatch(/confirmingId/);
  });

  it("the status chip is the shared StatusChip", () => {
    expect(src).toMatch(/from "@\/components\/app\/status-chip"/);
    expect(src).not.toMatch(/STATUS_RING/);
  });
});

describe("own services: confirmed delete apart from pause", () => {
  const src = read(SERVICES);

  it("delete is the strong-tier InlineConfirm with the reversible way named", () => {
    expect(src).toMatch(/<InlineConfirm[\s\S]*?label=\{labels\.remove\}[\s\S]*?question=\{labels\.removeQuestion\}[\s\S]*?tier="strong_irreversible"[\s\S]*?onConfirm=\{\(\) => remove\(row\)\}/);
    expect(src).not.toMatch(/onClick=\{\(\) => remove\(row\)\}/);
  });

  it("the status chip is the shared StatusChip", () => {
    expect(src).toMatch(/from "@\/components\/app\/status-chip"/);
    expect(src).not.toMatch(/STATUS_RING/);
  });

  it("the services page threads the confirmation copy", () => {
    const page = read("app/[locale]/dashboard/services/page.tsx");
    expect(page).toMatch(/removeQuestion: t\("removeQuestion"\)/);
    expect(page).toMatch(/removeYes: t\("removeYes"\)/);
  });
});

describe("lifecycle copy resolves in every active locale", () => {
  for (const loc of activeLocales) {
    it(`${loc}: visibility per state, publish-again and the delete confirmation`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      const keys = [
        ...["draft", "active", "paused", "closed", "expired"].map((s) => `marketplaceListings.searchState.${s}`),
        // The audience labels the discovery view already used stay intact.
        ...["public", "signed_in", "organizations", "workers", "own"].map((s) => `marketplaceListings.visibility.${s}`),
        "marketplaceListings.republish",
        "marketplaceListings.removeForever",
        "marketplaceListings.removeQuestion",
        "marketplaceListings.removeYes",
        "serviceOfferings.removeQuestion",
        "serviceOfferings.removeYes",
      ];
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});
