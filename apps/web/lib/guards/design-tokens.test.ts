/**
 * Guards for the TASK 06 token-first / theme-swappable design system. Pin the
 * non-negotiable architecture so a later PR can't quietly reintroduce raw values
 * or break the dark↔light swap.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("Guard: color tokens are theme-swappable CSS-var channels", () => {
  const colors = read("tokens/colors.ts");

  it("every colour resolves to rgb(var(--c-*) / <alpha-value>) — no raw hex", () => {
    expect(colors).toMatch(/rgb\(var\(--c-\$\{name\}\) \/ <alpha-value>\)/);
    // No literal hex colours left in the token source.
    expect(colors).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("globals.css defines the dark (:root) AND light ([data-theme=light]) channel sets", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/:root\s*\{[\s\S]*--c-ink-900:/);
    expect(css).toMatch(/\[data-theme="light"\][\s\S]*--c-ink-900:/);
    // A representative semantic token flips between the two themes.
    expect(css).toMatch(/--c-text-primary:\s*244 246 251/); // dark
    expect(css).toMatch(/--c-text-primary:\s*11 13 23/); // light
  });
});

describe("Guard: motion is token-driven and accessible", () => {
  it("tokens/motion.ts resolves to the CSS motion variables (single source)", () => {
    const m = read("tokens/motion.ts");
    expect(m).toMatch(/var\(--motion-fast\)/);
    expect(m).toMatch(/var\(--motion-ease-spring\)/);
  });

  it("the preset exposes the motion tokens as Tailwind duration/easing", () => {
    const p = read("tailwind-preset.ts");
    expect(p).toMatch(/transitionDuration:\s*\{\s*\.\.\.motion\.duration\s*\}/);
    expect(p).toMatch(/transitionTimingFunction:\s*\{\s*\.\.\.motion\.easing\s*\}/);
  });

  it("the verified 'scored' moment exists and honours prefers-reduced-motion", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/\.verified-pop\s*\{[\s\S]*var\(--motion-slow\)/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\}\s*\}/)?.[0] ?? "";
    expect(reduced).toMatch(/\.verified-pop/);
    expect(reduced).toMatch(/animation: none/);
  });
});

describe("Guard: no raw i18n role slug renders (admin label present)", () => {
  for (const locale of ["en", "lt", "de", "nl", "pl", "lv", "et", "da", "no", "sv"]) {
    it(`${locale}.json has auth.signup.role.admin`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`));
      expect(json.auth?.signup?.role?.admin, `${locale}: admin role label missing`).toBeTruthy();
    });
  }
});
