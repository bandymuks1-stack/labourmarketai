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

describe("Guard: typography decision lock (DI, 2026-06-12)", () => {
  // The lock: Bricolage Grotesque = display, Inter = body/UI, JetBrains Mono =
  // numbers/labels, Instrument Serif = accent ONLY (hero headlines, pull
  // quotes, founder-moment empty states, min ~28px — never body/UI).
  // Components reference font CSS vars; only these two files may name a
  // typeface. If a legitimate accent surface ships later, wire Instrument
  // Serif as `--font-accent` in layout.tsx, declare the accent role in
  // tokens/typography.ts, and add the accent component file(s) here.
  const WIRING_FILES = ["tokens/typography.ts", "app/[locale]/layout.tsx"];
  const ACCENT_ALLOWED: string[] = [];

  const SCAN_ROOTS = ["app", "components", "content", "lib", "tokens"];
  const SCAN_EXT = /\.(ts|tsx|css)$/;
  const sourceFiles = (): string[] => {
    const out: string[] = [];
    const walk = (rel: string) => {
      for (const entry of readdirSync(join(APP, rel), { withFileTypes: true })) {
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(childRel);
        else if (SCAN_EXT.test(entry.name)) out.push(childRel);
      }
    };
    for (const root of SCAN_ROOTS) walk(root);
    return out.filter((f) => f !== "lib/guards/design-tokens.test.ts");
  };

  it("tokens/typography.ts pins the four-role decision block", () => {
    const t = read("tokens/typography.ts");
    expect(t).toMatch(/TYPOGRAPHY DECISION LOCK \(DI approved, research-backed,\s*\/\/ 2026-06-12/);
    expect(t).toMatch(/Bricolage Grotesque/);
    expect(t).toMatch(/Instrument Serif\s+ACCENT ONLY/);
    expect(t).toMatch(/NEVER body or UI text/);
  });

  it("body/UI font stays Inter, wired as --font-sans in the locale layout", () => {
    const layout = read("app/[locale]/layout.tsx");
    expect(layout).toMatch(/const sans = Inter\(\{[^}]*variable: "--font-sans"/);
  });

  it("no raw typeface name outside the typography wiring files", () => {
    const allowed = new Set([...WIRING_FILES, ...ACCENT_ALLOWED]);
    // Quoted/next-font usages only — bare "Inter"/"instrument" prose (LT
    // "instrumentas", "Interview", …) must not false-positive.
    const RAW_TYPEFACE =
      /Bricolage|JetBrains|Instrument[_\s]?Serif|["'`]Inter["'`]|\bInter\(\{|from "next\/font/i;
    const offenders = sourceFiles().filter(
      (f) => !allowed.has(f) && RAW_TYPEFACE.test(read(f)),
    );
    expect(
      offenders,
      `raw typeface name(s) found outside ${[...allowed].join(", ")} — use var(--font-display|sans|mono) tokens instead: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("Instrument Serif is never applied to body/paragraph/UI-control styles", () => {
    // Accent-only: the font may exist solely behind a --font-accent var in
    // the wiring files plus the explicitly whitelisted accent components.
    const allowed = new Set([...WIRING_FILES, ...ACCENT_ALLOWED]);
    const offenders = sourceFiles().filter(
      (f) => !allowed.has(f) && /Instrument[_\s]?Serif|--font-accent|font-accent/i.test(read(f)),
    );
    expect(
      offenders,
      `Instrument Serif / --font-accent used outside whitelisted accent contexts: ${offenders.join(", ")}`,
    ).toEqual([]);
    // And the global body rule must never pick up the accent face.
    const css = read("app/globals.css");
    const bodyRule = css.match(/(^|\n)body\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(bodyRule).not.toMatch(/Instrument|--font-accent/i);
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
