import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAYER_IDENTITY_VARIANTS,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_AVATAR_PX,
  playerInitials,
} from "@/lib/identity/player-identity";
import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * Player Identity foundation guard.
 *
 * Pins the canonical identity contract (variant taxonomy + shared avatar tokens)
 * and that the shared profile avatar adopts it — so the profile monogram tile is
 * the SAME tile as the worker player card header and the map marker fallback.
 * This is an additive design-system foundation: no DB / auth / route / business
 * logic is involved. The full plan lives in the adaptation-plan doc.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");

describe("canonical player-identity contract", () => {
  it("defines exactly the seven canonical variants", () => {
    expect([...PLAYER_IDENTITY_VARIANTS]).toEqual([
      "hero",
      "profile",
      "cv-header",
      "work-strip",
      "dashboard-compact",
      "map-marker",
      "request-provider",
    ]);
  });

  it("playerInitials is the canonical person monogram used by card + map", () => {
    expect(playerInitials).toBe(personMonogram);
    // identical two-letter initials wherever a name is shown
    expect(playerInitials("Jonas Petraitis")).toBe("JP");
    expect(playerInitials("")).toBe("•"); // neutral, never an error glyph
  });

  it("the canonical fallback surface matches the guard-blessed card/map tokens", () => {
    expect(PLAYER_IDENTITY_FALLBACK_SURFACE).toContain("bg-ink-700");
    expect(PLAYER_IDENTITY_FALLBACK_SURFACE).toContain("text-text-primary");
    expect(PLAYER_IDENTITY_AVATAR_BORDER).toBe("border border-ink-500");
  });

  it("avatar pixel scale spans the compact → hero ends deterministically", () => {
    expect(PLAYER_AVATAR_PX.marker).toBeGreaterThan(0);
    expect(PLAYER_AVATAR_PX.hero).toBeGreaterThan(PLAYER_AVATAR_PX.compact);
  });
});

describe("the shared profile avatar adopts the foundation", () => {
  const disp = read("components/app/avatar-display.tsx");

  it("AvatarDisplay imports + consumes the canonical surface and border", () => {
    expect(disp).toMatch(/from "@\/lib\/identity\/player-identity"/);
    expect(disp).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    expect(disp).toMatch(/PLAYER_IDENTITY_AVATAR_BORDER/);
  });

  it("the monogram tile no longer uses the out-of-line bg-ink-800 surface", () => {
    expect(disp).not.toMatch(/bg-ink-800 font-semibold text-text-secondary/);
  });

  it("still renders an honest initials monogram (no synthesised face)", () => {
    // keeps the avatarMonogram primitive + the monogram testid (avatar-upload-real)
    expect(disp).toMatch(/avatarMonogram/);
    expect(disp).toMatch(/data-testid="avatar-monogram"/);
  });
});

describe("the adaptation plan doc is present and principle-only", () => {
  const doc = readRepo("docs/design/player-identity-adaptation-plan.md");

  it("exists with real content", () => {
    expect(doc.length).toBeGreaterThan(2000);
  });

  it("documents the canonical anatomy + the seven variants", () => {
    expect(doc.toLowerCase()).toContain("playeridentitycard");
    for (const v of PLAYER_IDENTITY_VARIANTS) {
      expect(doc, `variant ${v} documented`).toContain(v);
    }
  });

  it("states the non-negotiable: no DB / auth / route / business-logic change", () => {
    expect(doc.toLowerCase()).toMatch(/no (db|database)/);
    expect(doc.toLowerCase()).toContain("no route");
    expect(doc.toLowerCase()).toContain("no auth");
  });
});
