import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual pattern system guard (audit PR8).
 *
 * After the token repair (#638) and the dashboard hierarchy (#641), the app
 * gets ONE visual grammar for its recurring elements instead of per-file
 * styling:
 *   - ActionCard  → every "tap this to go do that" navigation card
 *   - StatusChip  → every status pill, semantic tokens only
 *   - EmptyState  → every honest "nothing here yet" block
 *   - 44px (min-h-11) touch targets on decision controls
 *   - bottom nav: a real selected indicator, one icon per destination
 *
 * This guard freezes the pattern contracts and the key adoptions so the
 * system cannot silently fragment back into bespoke one-off styling.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
// Comments legitimately NAME the anti-patterns they ban (e.g. "no raw
// emerald-500") — strip them before negative scans so docs don't trip guards.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("ActionCard is the single navigation-card pattern", () => {
  const card = read("components/app/action-card.tsx");

  it("encodes the contract: real link, 44px min, focus ring, token surfaces", () => {
    expect(card).toMatch(/min-h-11/);
    expect(card).toMatch(/focus-visible:ring-2/);
    expect(card).toMatch(/border-border-subtle bg-surface-1/);
    expect(card).toMatch(/from "@\/lib\/i18n\/navigation"/);
  });

  it("is adopted by the reference grid and the navigation-card call sites", () => {
    // Control room PR B: the reference grid is the registry-driven
    // DashboardModuleGrid (the former MyZone grid + page-level marketplace
    // cards folded into it) — the pattern's origin moved with the grid.
    for (const rel of [
      "components/app/dashboard/dashboard-module-grid.tsx",
      "app/[locale]/dashboard/service-requests/page.tsx",
      "app/[locale]/dashboard/bookings/page.tsx",
    ]) {
      expect(read(rel), `${rel} must use ActionCard`).toMatch(/<ActionCard/);
    }
  });
});

describe("StatusChip maps status to semantic tokens only", () => {
  const chip = read("components/app/status-chip.tsx");

  it("has the five variants and no raw palette colors", () => {
    for (const v of ["neutral", "waiting", "attention", "success", "danger"]) {
      expect(chip).toContain(`${v}:`);
    }
    expect(stripComments(chip)).not.toMatch(/emerald-|amber-|red-\d|green-\d/);
  });

  it("MyZone's readiness status uses it (raw emerald is gone from MyZone)", () => {
    const zone = read("components/app/my-zone.tsx");
    expect(zone).toMatch(/<StatusChip/);
    expect(stripComments(zone)).not.toMatch(/emerald-/);
  });
});

describe("EmptyState is the shared empty treatment in the marketplace loop", () => {
  it("all three loop empties use EmptyState with their original testids", () => {
    const loop = read("components/app/marketplace-loop-section.tsx");
    const mounts = loop.match(/<EmptyState/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(3);
    for (const id of [
      "marketplace-discover-empty",
      "marketplace-outgoing-empty",
      "marketplace-incoming-empty",
    ]) {
      expect(loop, `${id} testId preserved`).toContain(`testId="${id}"`);
    }
  });
});

describe("44px touch targets on decision controls", () => {
  it("page quick-nav chips", () => {
    expect(read("components/app/page-quick-nav.tsx")).toMatch(/min-h-11/);
  });
  it("booking accept/decline buttons", () => {
    const src = read("components/app/booking-respond-buttons.tsx");
    const hits = src.match(/min-h-11/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
  it("start-hub lane CTAs", () => {
    expect(read("app/[locale]/dashboard/start/page.tsx")).toMatch(/min-h-11/);
  });
  it("EmptyState CTAs", () => {
    const src = read("components/app/empty-state.tsx");
    const hits = src.match(/min-h-11/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("bottom nav: selected state is an indicator, icons are unambiguous", () => {
  const nav = read("components/app/bottom-nav.tsx");

  it("active tab renders a real indicator bar, not color alone", () => {
    expect(nav).toMatch(/data-testid="bottom-nav-active-indicator"/);
  });

  it("one icon per destination: journal=NotebookPen, messages=MessageSquare, map=MapPin", () => {
    expect(nav).toMatch(/journal: NotebookPen/);
    expect(nav).toMatch(/messages: MessageSquare/);
    expect(nav).toMatch(/map: MapPin/);
    // The old ambiguous pairs must not return (FileText belongs to documents,
    // Inbox to nothing in primary nav, plain Map to nothing).
    expect(stripComments(nav)).not.toMatch(/\bInbox\b/);
    expect(stripComments(nav)).not.toMatch(/\bFileText\b/);
  });

  it("the config icon keys say what they mean", () => {
    const cfg = read("lib/config/navigation.ts");
    expect(cfg).toMatch(/iconKey: "journal"/);
    expect(cfg).toMatch(/iconKey: "messages"/);
    expect(cfg).not.toMatch(/"fileText"|"inbox"/);
  });
});
