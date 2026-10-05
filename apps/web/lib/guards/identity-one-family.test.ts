import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { initialsOf } from "@/components/app/identity/identity-family";
import { playerInitials } from "@/lib/identity/player-identity";
import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * ONE PERSON IDENTITY, not two systems (owner decision 2026-10-05):
 *
 *   FROZEN IDENTITY GRAMMAR + REAL THEME TOKENS.
 *
 * `PersonPortrait` (the 4:5 persistent portrait pinned by person-identity-card
 * / player-identity-stage / project-staffing-model) and `PersonAvatar` (the
 * identity family's squircle) are two SILHOUETTES of the same person. A person
 * without a photograph is ONE deliberate thing in both: a tonal plate with an
 * engraved figure and a quiet monogram — drawn entirely through the theme
 * channels (`--c-identity-*`), never a fixed palette, so it swaps with the
 * theme and keeps its tonal depth in dark and light.
 *
 * What stays pinned elsewhere and is deliberately NOT changed: the portrait's
 * markup, test ids and `avatarUrl ?` ternary (real behaviour: a consented
 * photo or the shared monogram, never a synthesised face).
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8").replace(/\r\n/g, "\n");

const FAMILY = read("components/app/identity/identity-family.tsx");
const PORTRAIT = read("components/app/identity/person-portrait.tsx");
const CSS = read("app/globals.css");

describe("one person identity — one rule, two silhouettes", () => {
  it("every person surface takes its initials from the single monogram source", () => {
    expect(initialsOf).toBe(personMonogram);
    expect(playerInitials).toBe(personMonogram);
    expect(initialsOf("Jonas Petraitis")).toBe("JP");
    expect(initialsOf("")).toBe("•");
    expect(FAMILY).toMatch(/export const initialsOf = personMonogram;/);
  });

  it("the persistent portrait draws its no-photo person with the family's plate and figure", () => {
    expect(PORTRAIT).toMatch(/import \{ PersonFigure, plate \} from "@\/components\/app\/identity\/identity-family"/);
    expect(PORTRAIT).toMatch(/background: plate\(key\)/);
    expect(PORTRAIT).toMatch(/<PersonFigure id=\{key\} \/>/);
  });

  it("the portrait's pinned contract is intact: real photo or monogram, canonical tokens, test ids", () => {
    expect(PORTRAIT).toMatch(/avatarUrl \?/);
    expect(PORTRAIT).toContain('data-testid="person-portrait"');
    expect(PORTRAIT).toContain("PLAYER_IDENTITY_FALLBACK_SURFACE");
    expect(PORTRAIT).toContain("PLAYER_IDENTITY_AVATAR_BORDER");
    expect(PORTRAIT).toMatch(/data-testid=\{testids\?\.monogram\}/);
    expect(PORTRAIT).not.toMatch(/placeholder|unsplash|pravatar|randomuser/i);
  });

  it("an anonymous person is drawn with NO photo, whatever the caller passes", () => {
    expect(FAMILY).toMatch(/if \(person\.photo && !person\.anonymous\) \{/);
    const anonymous = FAMILY.slice(FAMILY.indexOf("if (person.anonymous) {"), FAMILY.indexOf('data-identity="person-fallback"'));
    expect(anonymous).not.toMatch(/person\.photo/);
    expect(anonymous).toMatch(/aria-label=\{anonymousLabel\}/);
  });
});

describe("the identity family is theme tokens, not a fixed palette", () => {
  it("draws nothing in the proof's fixed dark colours (the only literal is the logo ground)", () => {
    expect(FAMILY).not.toMatch(/rgba\(245,\s*241,\s*232/);
    const hex = FAMILY.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    // A company LOGO is drawn for a light ground in every theme: ivory plate,
    // near-black mark. That is brand semantics, not an identity tone.
    expect([...new Set(hex)].sort()).toEqual(["#151513", "#ece7dc"]);
  });

  it("every plate stop and the figure ink are defined for BOTH themes and registered as colours", () => {
    const dark = CSS.slice(CSS.indexOf("/* ── IDENTITY FAMILY"));
    const darkBlock = dark.slice(dark.indexOf(":root,"), dark.indexOf(':root[data-theme="light"]'));
    const lightBlock = dark.slice(dark.indexOf(':root[data-theme="light"]'));
    const names = [..."123456"].flatMap((n) => [`identity-${n}a`, `identity-${n}b`]).concat("identity-figure");
    for (const name of names) {
      expect(darkBlock, `dark ${name}`).toContain(`--c-${name}:`);
      expect(lightBlock, `light ${name}`).toContain(`--c-${name}:`);
    }
    const colors = read("tokens/colors.ts");
    for (const name of names) expect(colors, name).toContain(`c("${name}")`);
  });

  it("the monogram and figure stay legible on every plate in BOTH themes (WCAG ≥ 4.5:1 at the drawn alpha)", () => {
    type RGB = readonly [number, number, number];
    const channel = (block: string, name: string): RGB => {
      const m = new RegExp(`--c-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(block);
      if (!m) throw new Error(`missing ${name}`);
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const lum = ([r, g, b]: RGB) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a: RGB, b: RGB) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const over = (fg: RGB, bg: RGB, alpha: number): RGB => [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))) as unknown as RGB;

    const dark = CSS.slice(CSS.indexOf("/* ── IDENTITY FAMILY"));
    const blocks = {
      dark: dark.slice(dark.indexOf(":root,"), dark.indexOf(':root[data-theme="light"]')),
      light: dark.slice(dark.indexOf(':root[data-theme="light"]')),
    };
    const MONOGRAM_ALPHA = 0.88; // the alpha the monogram is drawn at
    for (const [theme, block] of Object.entries(blocks)) {
      const figure = channel(block, "identity-figure");
      for (const n of [..."123456"]) {
        for (const stop of ["a", "b"]) {
          const plateRgb = channel(block, `identity-${n}${stop}`);
          const ratio = contrast(over(figure, plateRgb, MONOGRAM_ALPHA), plateRgb);
          expect(ratio, `${theme} plate ${n}${stop}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("the themes differ in the way the contract needs: light plates are lighter than the dark ones", () => {
    const grab = (block: string, name: string) => {
      const m = new RegExp(`--c-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(block)!;
      return Number(m[1]) + Number(m[2]) + Number(m[3]);
    };
    const css = CSS.slice(CSS.indexOf("/* ── IDENTITY FAMILY"));
    const darkBlock = css.slice(css.indexOf(":root,"), css.indexOf(':root[data-theme="light"]'));
    const lightBlock = css.slice(css.indexOf(':root[data-theme="light"]'));
    for (const n of [..."123456"]) {
      expect(grab(lightBlock, `identity-${n}a`), `plate ${n}`).toBeGreaterThan(grab(darkBlock, `identity-${n}a`));
    }
    expect(grab(lightBlock, "identity-figure")).toBeLessThan(grab(darkBlock, "identity-figure"));
  });
});
