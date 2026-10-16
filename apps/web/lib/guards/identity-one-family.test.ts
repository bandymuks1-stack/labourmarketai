import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { entityMonogram, initialsOf, personToneKey, plate } from "@/components/app/identity/identity-family";
import { playerInitials } from "@/lib/identity/player-identity";
import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * ONE IDENTITY FAMILY (D2, 2026-10-14) — re-port of the owner-frozen design
 * class 4e695e261 (`identity-one-family.test.ts` on the frozen branch),
 * adapted to the owner restraint directives:
 *
 *   - a person without a photo is a calm PLATE with initials — never a
 *     stand-in face; the engraved figure appears only at card/stage size;
 *   - plates are theme tokens (`--c-identity-*`), never a fixed palette, and
 *     no plate is a state (no gold, no green on any mark);
 *   - another person's photo reaches a mark only through the readers (own
 *     avatar / getAvatarForVisibleWorker); an anonymous person never shows one;
 *   - the project mark never draws a generated picture.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8").replace(/\r\n/g, "\n");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

  it("the same person gets the same plate on every surface (keyed by the name)", () => {
    expect(personToneKey("Ona Kazlauskienė", "a")).toBe(personToneKey(" ona kazlauskienė ", "b"));
    expect(plate(personToneKey("Ona Kazlauskienė"))).toBe(plate(personToneKey("Ona Kazlauskienė", "x")));
    expect(personToneKey("", "row-1")).toBe("row-1");
    expect(PORTRAIT).toMatch(/const key = personToneKey\(name, initials\);/);
    expect(FAMILY).toMatch(/const key = personToneKey\(person\.name, person\.id\);/);
  });

  it("the persistent portrait draws its no-photo person with the family's plate", () => {
    expect(PORTRAIT).toMatch(/from "@\/components\/app\/identity\/identity-family"/);
    expect(PORTRAIT).toMatch(/background: plate\(key\)/);
    expect(PORTRAIT).toMatch(/<PersonFigure id=\{key\} \/>/);
  });

  it("the portrait's pinned contract is intact: real photo or monogram, canonical tokens, test ids", () => {
    expect(PORTRAIT).toMatch(/avatarUrl \?/);
    expect(PORTRAIT).toContain('data-testid="person-portrait"');
    expect(PORTRAIT).toContain("PLAYER_IDENTITY_FALLBACK_SURFACE");
    expect(PORTRAIT).toContain("PLAYER_IDENTITY_AVATAR_BORDER");
    expect(PORTRAIT).toMatch(/data-testid=\{testids\?\.monogram\}/);
    expect(PORTRAIT).toMatch(/data-testid=\{testids\?\.photo\}/);
    expect(code(PORTRAIT)).not.toMatch(/placeholder|unsplash|pravatar|randomuser/i);
    expect(code(FAMILY)).not.toMatch(/placeholder|unsplash|pravatar|randomuser/i);
  });

  it("initials are ALWAYS drawn on a no-photo person (the plate is never blank)", () => {
    const fallback = FAMILY.slice(FAMILY.indexOf("const withFigure = s >= FIGURE_MIN_PX;"));
    // The initials span is unconditional; only the faint figure depends on size.
    expect(fallback).toMatch(/\{withFigure \? <PersonFigure id=\{key\} \/> : null\}\s*<span/);
    expect(fallback).toMatch(/\{initialsOf\(person\.name\)\}/);
  });

  it("an anonymous person is drawn with NO photo, whatever the caller passes", () => {
    expect(FAMILY).toMatch(/if \(person\.photo && !person\.anonymous\) \{/);
    const anonymous = FAMILY.slice(FAMILY.indexOf("if (person.anonymous) {"), FAMILY.indexOf('data-identity="person-fallback"'));
    expect(anonymous).not.toMatch(/person\.photo/);
    expect(anonymous).toMatch(/a11y\(anonymousLabel\)/);
  });

  it("the project mark never draws a generated picture: real media or the plate + monogram", () => {
    const project = FAMILY.slice(FAMILY.indexOf("export function ProjectMark"));
    expect(project).not.toMatch(/<svg|<path|<rect/);
    expect(project).toMatch(/entityMonogram\(project\.name\)/);
  });

  it("entity monograms skip legal forms and quote marks", () => {
    expect(entityMonogram('UAB „Statybų grupė"')).toBe("SG");
    expect(entityMonogram("Nordbygg AS")).toBe("N");
    expect(entityMonogram("")).toBe("•");
  });
});

describe("the identity family is theme tokens, not a fixed palette, and no mark is a state", () => {
  it("draws nothing in fixed colours (the only literal is the logo's ivory ground)", () => {
    const hex = code(FAMILY).match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect([...new Set(hex)].sort()).toEqual(["#ece7dc"]);
    expect(code(FAMILY)).not.toMatch(/rgba?\(\s*\d/);
  });

  it("no gold, no green on any mark (restraint: tone is never a state)", () => {
    for (const src of [code(FAMILY), code(PORTRAIT)]) {
      expect(src).not.toMatch(/brand-blue|brand-champagne|tier-gold|state-success|trust-accent/);
    }
  });

  it("every plate stop and the figure ink are defined for BOTH themes and registered as colours", () => {
    const css = CSS.slice(CSS.indexOf("/* ── IDENTITY FAMILY"));
    const darkBlock = css.slice(css.indexOf(":root,"), css.indexOf(':root[data-theme="light"]'));
    const lightBlock = css.slice(css.indexOf(':root[data-theme="light"]'));
    const names = [..."123456"].flatMap((n) => [`identity-${n}a`, `identity-${n}b`]).concat("identity-figure");
    for (const name of names) {
      expect(darkBlock, `dark ${name}`).toContain(`--c-${name}:`);
      expect(lightBlock, `light ${name}`).toContain(`--c-${name}:`);
    }
    const colors = read("tokens/colors.ts");
    for (const name of names) expect(colors, name).toContain(`c("${name}")`);
  });

  it("the monogram stays legible on every plate in BOTH themes (WCAG ≥ 4.5:1 at the drawn alpha)", () => {
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
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
      [0, 1, 2].map((i) => Math.round(fg[i]! * alpha + bg[i]! * (1 - alpha))) as unknown as RGB;

    const css = CSS.slice(CSS.indexOf("/* ── IDENTITY FAMILY"));
    const blocks = {
      dark: css.slice(css.indexOf(":root,"), css.indexOf(':root[data-theme="light"]')),
      light: css.slice(css.indexOf(':root[data-theme="light"]')),
    };
    const MONOGRAM_ALPHA = 0.88; // the alpha the monogram is drawn at
    expect(FAMILY).toContain("--c-identity-figure)/0.88");
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
});

describe("the family is the one person mark at the migrated call sites", () => {
  const SITES: ReadonlyArray<readonly [string, RegExp]> = [
    ["components/app/account-menu.tsx", /<PersonAvatar person=\{me\}/],
    ["components/app/project-operations-board.tsx", /<PersonAvatar person=\{\{ id: worker\.workerId, name: worker\.name \}\}/],
    ["components/app/marketplace-loop-section.tsx", /<PersonAvatar person=\{\{ id: r\.id, name: requester\.displayName \?\? "" \}\}/],
    ["app/[locale]/dashboard/projects/[id]/page.tsx", /<PersonPortrait name=\{w\.name\}/],
  ];
  for (const [rel, re] of SITES) {
    it(rel, () => expect(read(rel)).toMatch(re));
  }

  it("the account menu shows only the viewer's OWN photo (getOwnAvatar), streamed off the TTFB path", () => {
    const menu = read("components/app/account-menu.tsx");
    expect(menu).toMatch(/useOwnAvatarUrl\(\)/);
    expect(menu).not.toMatch(/getAvatarForVisibleWorker|signAvatarPath/);
    expect(read("components/app/identity/own-avatar-stream.tsx")).toMatch(/getOwnAvatar\(\)/);
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(/<Suspense fallback=\{null\}>\s*<OwnAvatarStream \/>\s*<\/Suspense>/);
    // the name is sentence case: no mono-uppercase eyebrow for a person's name
    const identity = menu.slice(menu.indexOf('data-testid="account-menu-identity"'));
    expect(identity.slice(0, 600)).not.toMatch(/uppercase/);
  });
});
