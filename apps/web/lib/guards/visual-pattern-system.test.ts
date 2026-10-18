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

  it("is adopted by the navigation-card call sites", () => {
    // The registry-driven DashboardModuleGrid died with the second dashboard
    // (W3 Package 4); the surviving call sites keep the pattern adopted.
    for (const rel of [
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

  // The MyZone adoption pin died with MyZone (W3 Package 4 deleted the
  // second dashboard); the chip contract above is what must not fragment.
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
    // The map lives in `components/app/nav-icons.ts` since the one top bar
    // started rendering the same core destinations. ONE icon per destination is
    // now a property of that single module rather than of one component's
    // private copy — the stronger form of the same rule, because two surfaces
    // can no longer disagree about what "journal" looks like.
    const icons = read("components/app/nav-icons.ts");
    expect(icons).toMatch(/journal: NotebookPen/);
    expect(icons).toMatch(/messages: MessageSquare/);
    expect(icons).toMatch(/map: MapPin/);
    expect(icons).toMatch(/calendar: CalendarDays/);
    // Every nav surface must take its icons from there, never re-declare them.
    for (const surface of [
      "components/app/bottom-nav.tsx",
      "components/app/conversation/chat/conversation-header.tsx",
    ]) {
      expect(read(surface)).toMatch(/NAV_ICONS/);
    }
    // The old ambiguous pairs must not return (FileText belongs to documents,
    // Inbox to nothing in primary nav, plain Map to nothing).
    for (const src of [icons, nav]) {
      expect(stripComments(src)).not.toMatch(/\bInbox\b/);
      expect(stripComments(src)).not.toMatch(/\bFileText\b/);
    }
  });

  it("the config icon keys say what they mean", () => {
    const cfg = read("lib/config/navigation.ts");
    expect(cfg).toMatch(/iconKey: "journal"/);
    expect(cfg).toMatch(/iconKey: "messages"/);
    expect(cfg).not.toMatch(/"fileText"|"inbox"/);
  });
});
