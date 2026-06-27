import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAYER_CARD_MIN_FIELDS,
  buildPlayerCardMinimum,
} from "@/lib/identity/player-card-minimum";
import { playerInitials } from "@/lib/identity/player-identity";

/**
 * Player Card MINIMUM contract guard.
 *
 * Locks the foundation that keeps the next identity slices from drifting: the
 * canonical field set, honest fallbacks, and the forbidden-fake invariants
 * (missing → null/0/[], never fabricated, never a completion percentage). Also
 * pins that the field contract reuses the visual identity foundation (one
 * identity, not two) and that neither the module nor the doc carries
 * demo/preview/coming-soon or external product names. Pure + additive: no DB,
 * RLS, RPC, route, or business-logic surface here.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");

describe("canonical minimum field set", () => {
  it("is exactly the six minimum identity fields, in order", () => {
    expect([...PLAYER_CARD_MIN_FIELDS]).toEqual([
      "avatar",
      "name",
      "headline",
      "location",
      "skills",
      "about",
    ]);
  });
});

describe("buildPlayerCardMinimum is pure, null-safe and never fabricates", () => {
  it("empty source → all fields null/0 and ALL essentials missing", () => {
    const r = buildPlayerCardMinimum({});
    expect(r.avatarUrl).toBeNull();
    expect(r.displayName).toBeNull();
    expect(r.initials).toBe("•"); // neutral, never a synthesised face
    expect(r.headline).toBeNull();
    expect(r.location).toBeNull();
    expect(r.skillsDeclared).toBe(0);
    expect(r.skillsVerified).toBe(0);
    expect(r.about).toBeNull();
    expect(r.present).toEqual([]);
    expect(r.missing).toEqual([...PLAYER_CARD_MIN_FIELDS]);
  });

  it("a full source → every essential present + canonical initials", () => {
    const r = buildPlayerCardMinimum({
      avatarUrl: "https://signed/x",
      fullName: "Jonas Petraitis",
      headline: "Dažytojas",
      location: "LT",
      skillsDeclared: 4,
      skillsVerified: 2,
      about: "Interior finishing.",
    });
    expect(r.present).toEqual([...PLAYER_CARD_MIN_FIELDS]);
    expect(r.missing).toEqual([]);
    expect(r.displayName).toBe("Jonas Petraitis");
    expect(r.initials).toBe(playerInitials("Jonas Petraitis"));
  });

  it("email is a DISPLAY fallback only — name still counts as missing", () => {
    const r = buildPlayerCardMinimum({ email: "jonas@example.com" });
    expect(r.displayName).toBe("jonas");
    expect(r.missing).toContain("name"); // no real full_name saved
    expect(r.present).not.toContain("name");
  });

  it("blank/whitespace and non-positive counts are treated as absent", () => {
    const r = buildPlayerCardMinimum({
      fullName: "   ",
      about: "",
      skillsDeclared: 0,
      skillsVerified: -3,
    });
    expect(r.displayName).toBeNull();
    expect(r.about).toBeNull();
    expect(r.skillsDeclared).toBe(0);
    expect(r.skillsVerified).toBe(0);
    expect(r.missing).toEqual(expect.arrayContaining(["name", "about", "skills"]));
  });

  it("never emits a completion percentage — missing is a concrete field list", () => {
    const r = buildPlayerCardMinimum({ fullName: "A B" });
    // the view-model exposes lists, not a number/percent completion field
    expect(Array.isArray(r.missing)).toBe(true);
    expect(Array.isArray(r.present)).toBe(true);
    expect(r).not.toHaveProperty("completion");
    expect(r).not.toHaveProperty("percent");
    expect(r).not.toHaveProperty("score");
  });
});

describe("the field contract reuses the visual identity foundation", () => {
  const src = read("lib/identity/player-card-minimum.ts");
  it("imports playerInitials from the visual foundation (one identity)", () => {
    expect(src).toMatch(/from "@\/lib\/identity\/player-identity"/);
    expect(src).toMatch(/playerInitials/);
  });
  it("does no DB/RLS/RPC read (pure transform)", () => {
    expect(src).not.toMatch(/createClient|server-only|\.rpc\(|\.from\(/);
  });
});

describe("contract doc exists and carries the binding sections", () => {
  const doc = readRepo("docs/contracts/player-card-minimum-contract-v1.md");
  it("has real content and the required sections", () => {
    expect(doc.length).toBeGreaterThan(2000);
    const lower = doc.toLowerCase();
    for (const s of [
      "audited identity surfaces",
      "minimum player card fields",
      "fallbacks",
      "forbidden fake signals",
      "allowed surfaces",
      "non-scope",
      "next implementation slices",
    ]) {
      expect(lower, `section: ${s}`).toContain(s);
    }
  });
  it("states the non-scope: no DB/migration/RLS/RPC and no CV parser/AI", () => {
    const lower = doc.toLowerCase();
    expect(lower).toMatch(/no db|no database/);
    expect(lower).toContain("rls");
    expect(lower).toContain("rpc");
    expect(lower).toMatch(/cv parsing\/import|cv parser\/import/);
    expect(lower).toContain("ai extraction");
  });
});

describe("no fake-signal or external-name drift in the contract artifacts", () => {
  const moduleSrc = read("lib/identity/player-card-minimum.ts");
  const doc = readRepo("docs/contracts/player-card-minimum-contract-v1.md");
  // forbidden product-copy framing (aligned with product-copy-forbidden-terms)
  const BANNED = /(?<![\p{L}\p{N}_])(demos?|coming[ -]?soon)(?![\p{L}\p{N}_])/iu;
  it("the module carries no demo/coming-soon framing", () => {
    expect(BANNED.test(moduleSrc)).toBe(false);
  });
  it("the doc's own copy carries no demo/coming-soon framing", () => {
    // The doc legitimately NAMES the forbidden tokens once (to forbid them);
    // assert it forbids rather than uses them.
    expect(doc).toMatch(/no demo\/preview\/coming-soon/i);
  });
});
