import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { typography } from "@/tokens/typography";

/**
 * §12 PREMIUM DESIGN PASS — the owner visual-acceptance contract.
 *
 * The audit's §12 complaint was structural, not decorative: "uniform small
 * type … more admin UI than a 2026 AI product". The product's OWN scale
 * (tokens/typography.ts) already answered it in words —
 *
 *   "Floor: 12px. Nothing smaller ships on a product surface."
 *   "no hand-rolled `text-[13px]` in components"
 *
 * — and 1570 strings shipped below that floor anyway. This guard makes the
 * declared scale the enforced one: every size comes from the ROLE tokens, so
 * sizes are decided in ONE place and legibility cannot regress screen by
 * screen.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

/** Every .tsx/.ts under the product surfaces, excluding guards themselves. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(APP, dir), { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (
        (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) &&
        !e.name.endsWith(".test.ts") &&
        !e.name.endsWith(".test.tsx")
      ) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return out;
}

const SURFACES = [
  ...sourceFiles("components"),
  ...sourceFiles("app"),
];

describe("§12 ONE type scale — the declared floor is the enforced floor", () => {
  it("no surface hand-rolls a pixel font size", () => {
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      let src: string;
      try {
        src = read(rel);
      } catch {
        continue; // unreadable encoding — not a design surface
      }
      const hits = src.match(/text-\[\d+px\]/g);
      if (hits) offenders.push(`${rel}: ${[...new Set(hits)].join(", ")}`);
    }
    expect(
      offenders,
      `hand-rolled sizes must use the role tokens (${Object.keys(
        typography.fontSize,
      ).join(" / ")}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the scale itself still declares the 12px floor it promises", () => {
    const meta = typography.fontSize.meta[0];
    expect(meta).toBe("0.75rem"); // 12px
    const src = read("tokens/typography.ts");
    expect(src).toMatch(/Floor: 12px/);
  });

  it("every role token is a real rem step — no accidental duplicates", () => {
    const sizes = Object.values(typography.fontSize).map((v) => v[0]);
    expect(new Set(sizes).size).toBe(sizes.length);
    for (const s of sizes) expect(s).toMatch(/^\d+(\.\d+)?rem$/);
  });
});

describe("§12 one component vocabulary on the authenticated surfaces", () => {
  it("touch targets on the primary shell stay at the 44px floor", () => {
    for (const rel of [
      "components/app/conversation/chat/composer.tsx",
      "components/app/conversation/chat/conversation-header.tsx",
      "components/app/account-menu.tsx",
      "components/app/conversation-quick-reply.tsx",
    ]) {
      expect(read(rel), rel).toMatch(/size-11|min-h-11/);
    }
  });

  it("overlays share ONE portal root and ONE z scale", () => {
    const overlay = read("components/ui/anchored-overlay.tsx");
    expect(overlay).toMatch(/z-\[60\]/); // dropdowns
    expect(read("components/app/header-search.tsx")).toMatch(/z-\[70\]/); // dialogs
    for (const rel of [
      "components/app/account-menu.tsx",
      "components/app/notification-panel.tsx",
      "components/app/conversation/chat/workspace-chip.tsx",
    ]) {
      expect(read(rel), rel).toMatch(/AnchoredOverlay/);
    }
  });

  it("no raw hex colour is introduced on the new §7/§8/§5.2 surfaces", () => {
    for (const rel of [
      "app/[locale]/dashboard/planning/page.tsx",
      "app/[locale]/dashboard/communication/page.tsx",
      "components/app/worker-player-card.tsx",
      "components/app/conversation-quick-reply.tsx",
      "components/app/conversation/chat-message-reply.tsx",
      "components/ui/anchored-overlay.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/#[0-9a-fA-F]{6}\b/);
      expect(read(rel), rel).not.toMatch(/rgb\(\s*\d/);
    }
  });
});
