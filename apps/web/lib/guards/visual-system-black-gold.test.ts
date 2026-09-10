import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * BLACK + METALLIC GOLD — the visual-system contract.
 *
 * REPLACES `ux-2-0-light-first.test.ts`. That guard froze the PREVIOUS owner
 * decision (light is the default); the owner-approved final visual direction of
 * 2026-09-09 supersedes it with a black ground and a #D4AF37 metallic-gold
 * brand, applied to the WHOLE product rather than a landing page. A guard that
 * pins a superseded decision has to be re-anchored, not deleted — so every
 * check the old file made is still made here, in its inverted form, and the new
 * contract is added on top. Nothing was dropped to make the redesign pass.
 *
 * Carried over from the old guard (the three ways a default swap goes wrong):
 *   • the default silently reverts to the other palette;
 *   • a user's DELIBERATE choice gets overwritten (worse than the bug);
 *   • a palette ships below WCAG AA because nobody measured the one that is
 *     not the default — four light values really were failing when light was
 *     the unmeasured one.
 *
 * Added by this file:
 *   • the ink ladder is the owner's tonal depth, not "some dark";
 *   • the brand accent is GOLD in both palettes;
 *   • gold did NOT eat the semantic colours (owner §18), and specifically
 *     BRAND ≠ CONFIRMATION, which is product-truth SEP-3
 *     (EVIDENCE ≠ VERIFICATION) expressed in colour.
 */

const APP_ROOT = join(__dirname, "..", "..");
// Normalize CRLF → LF: the guard matches multi-line selector strings with \n,
// which spuriously failed on Windows checkouts where git materialises CRLF.
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const css = read("app/globals.css");

/** Pull one `--c-*` triplet out of a selector block. */
function tokenIn(selector: string, name: string): [number, number, number] {
  const start = css.indexOf(selector);
  expect(start, `selector ${selector} must exist`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("}", start));
  const m = new RegExp(`--c-${name}:\\s*([0-9]+)\\s+([0-9]+)\\s+([0-9]+)`).exec(block);
  expect(m, `--c-${name} must be defined in ${selector}`).not.toBeNull();
  return [Number(m![1]), Number(m![2]), Number(m![3])];
}

const relLum = ([r, g, b]: number[]): number => {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number[], b: number[]): number => {
  const [x, y] = [relLum(a), relLum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const eq = (a: number[], b: number[]): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

const DARK = ':root,\n:root[data-theme="dark"]';
const LIGHT = ':root[data-theme="light"]';

describe("black + gold is the product default", () => {
  it("the bare :root selector carries the DARK palette", () => {
    // A black page is the whole point — if this triplet goes light again, the
    // signed-in product silently reverts to the old white application and the
    // landing becomes a different product again.
    const page = tokenIn(DARK, "ink-900");
    expect(relLum(page), "default page background must be black").toBeLessThan(0.02);
    expect(css.slice(css.indexOf(DARK))).toMatch(/color-scheme:\s*dark/);
  });

  it("light is reachable only through an explicit attribute", () => {
    const page = tokenIn(LIGHT, "ink-900");
    expect(relLum(page), "light page background must be light").toBeGreaterThan(0.5);
  });

  it("the pre-paint bootstrap resolves a definite theme, defaulting to dark", () => {
    for (const file of ["app/[locale]/layout.tsx", "app/[locale]/not-found.tsx"]) {
      const src = read(file);
      expect(src, `${file}: reads the shared key`).toMatch(/localStorage\.getItem\('theme'\)/);
      // Resolve-then-stamp: never "stamp only if stored", which left the
      // attribute absent and every reader guessing.
      expect(src, `${file}: resolves light-or-dark`).toMatch(
        /s\s*===\s*'light'\s*\?\s*'light'\s*:\s*'dark'/,
      );
      expect(src, `${file}: stamps before paint`).toMatch(
        /document\.documentElement\.dataset\.theme=t/,
      );
      // The catch path must also land on the product default, not on light.
      expect(src, `${file}: storage failure still lands on dark`).toMatch(
        /catch\(e\)\{document\.documentElement\.dataset\.theme='dark'/,
      );
    }
  });

  it("a stored LIGHT preference is never overwritten", () => {
    // The one regression worse than the original bug: a dark-first default
    // that stomps on a deliberate choice. (Inverted twin of the old check.)
    const reapply = read("components/app/theme-reapply.tsx");
    expect(reapply).toMatch(/localStorage\.getItem\("theme"\) === "light"/);
    // The watcher must still only act when the attribute was STRIPPED.
    expect(reapply).toMatch(/hasAttribute\("data-theme"\)/);
  });

  it("every theme reader treats an absent attribute as dark, not light", () => {
    for (const file of [
      "components/ui/theme-toggle-icon.tsx",
      "components/app/account-menu.tsx",
    ]) {
      const src = read(file);
      expect(src, `${file}: initial state`).toMatch(/useState<"dark" \| "light">\("dark"\)/);
      expect(src, `${file}: absent means dark`).toMatch(/current === "light" \? "light" : "dark"/);
    }
  });

  it("the browser chrome colour follows the black ground", () => {
    // A #06070D status bar over a #000000 page is a visible seam on mobile.
    expect(read("app/[locale]/layout.tsx")).toMatch(
      /prefers-color-scheme: dark\)",\s*color: "#000000"/,
    );
  });
});

describe("the switch is discoverable", () => {
  // Owner audit §4.4 put the toggle in the ONE avatar menu — still on every
  // authenticated screen (the menu is always in the header), and the storage
  // contract is unchanged by the default swap.
  it("the account menu (mounted in the conversation header) carries the toggle", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).toMatch(/AccountMenu/);
    const menu = read("components/app/account-menu.tsx");
    expect(menu).toMatch(/account-menu-theme-toggle/);
  });

  it("the menu toggle keeps the ONE storage contract", () => {
    const menu = read("components/app/account-menu.tsx");
    expect(menu).toMatch(/dataset\.theme/);
    expect(menu).toMatch(/localStorage\.setItem\("theme"/);
    // The bar itself stays free of theme logic.
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).not.toMatch(/localStorage/);
    expect(header).not.toMatch(/dataset\.theme/);
  });

  it("it reuses existing localized copy — no new i18n keys for a toggle", () => {
    const header = read("components/app/account-menu.tsx");
    expect(header).toMatch(/account\.theme/);
    for (const locale of ["lt", "en", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}.json`)) as Record<string, never>;
      const theme = (
        msgs as unknown as {
          auth: { dashboard: { account: { theme: Record<string, string> } } };
        }
      ).auth.dashboard.account.theme;
      expect(theme.toDark, `${locale}.toDark`).toBeTruthy();
      expect(theme.toLight, `${locale}.toLight`).toBeTruthy();
    }
  });
});

describe("the owner's black + gold palette", () => {
  it("the dark ink ladder is the canonical OBSIDIAN → GRAPHITE depth", () => {
    // OBSIDIAN #070706 → GRAPHITE #151513 → #1D1D1A → #2A2A26. A black ground
    // does not mean every surface is the same black: without the ladder, cards,
    // panels and dialogs stop being separable and the product reads as one flat
    // void (owner §7: obsidian = environment, graphite = structure).
    expect(tokenIn(DARK, "ink-900")).toEqual([7, 7, 6]); // #070706
    expect(tokenIn(DARK, "ink-800")).toEqual([21, 21, 19]); // #151513
    expect(tokenIn(DARK, "ink-700")).toEqual([29, 29, 26]);
    expect(tokenIn(DARK, "ink-600")).toEqual([42, 42, 38]);
  });

  it("the ground is WARM — never cool-tinted against the gold", () => {
    // The pre-rebrand dark theme was cool (6 7 13 / 11 13 23), which turned the
    // gold green-ish. The canonical ground is warm black: blue must never
    // exceed red, and it must stay near-achromatic (a *tinted* ground would be
    // its own colour competing with the brand).
    for (const t of ["ink-900", "ink-800", "ink-700", "ink-600", "ink-500"]) {
      const [r, g, b] = tokenIn(DARK, t);
      expect(b, `${t} must not be cool (blue over red)`).toBeLessThanOrEqual(r);
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${t} stays near-achromatic`).toBeLessThanOrEqual(20);
    }
    // Warm ivory, not pure white, for the same reason.
    const [tr, , tb] = tokenIn(DARK, "text-primary");
    expect(tb, "primary text is warm ivory").toBeLessThan(tr);
  });

  it("the primary CTA is METALLIC gold, never mustard/bronze", () => {
    // The owner's correction: the first ramp ended on #A8842B and read as muddy
    // mustard on a phone. Deep gold is a DEPTH stop, not a fill — metallic gold
    // and champagne must dominate the sweep, and the label must clear AA on
    // EVERY stop (a ramp is not one colour; the darkest stop is the real test).
    const block = css.slice(css.indexOf(DARK), css.indexOf(LIGHT));
    const cta = /--gradient-cta:\s*linear-gradient\(([\s\S]*?)\);/.exec(block);
    expect(cta, "the dark CTA ramp must exist").not.toBeNull();
    const stops = [...cta![1].matchAll(/#([0-9a-f]{6})\s+(\d+)%/gi)].map((m) => ({
      rgb: [
        parseInt(m[1].slice(0, 2), 16),
        parseInt(m[1].slice(2, 4), 16),
        parseInt(m[1].slice(4, 6), 16),
      ],
      at: Number(m[2]),
    }));
    expect(stops.length, "the ramp is defined by explicit stops").toBeGreaterThanOrEqual(3);

    const onBrand = tokenIn(DARK, "text-on-brand");
    for (const s of stops) {
      expect(
        ratio(onBrand, s.rgb),
        `CTA label on stop at ${s.at}% (rgb ${s.rgb.join(",")})`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    // Metallic/champagne must OWN the middle of the sweep — the part a person
    // actually sees. Anything dimmer than #D4AF37 is depth and belongs at the
    // edges only.
    const goldLum = relLum([212, 175, 55]);
    const middle = stops.filter((s) => s.at >= 20 && s.at <= 80);
    expect(middle.length, "the ramp has a middle").toBeGreaterThan(0);
    for (const s of middle) {
      expect(
        relLum(s.rgb),
        `stop at ${s.at}% must be metallic gold or brighter, not bronze`,
      ).toBeGreaterThanOrEqual(goldLum - 0.001);
    }
  });

  it("the brand accent is GOLD in both palettes", () => {
    // `brand-blue` keeps its token NAME (358 files reference it); what matters
    // is the value it resolves to. Gold = red channel clearly above blue.
    for (const [name, selector] of [
      ["dark", DARK],
      ["light", LIGHT],
    ] as const) {
      const [r, g, b] = tokenIn(selector, "brand-blue");
      expect(r, `${name} brand: red > green`).toBeGreaterThan(g);
      expect(g, `${name} brand: green > blue`).toBeGreaterThan(b);
      expect(r - b, `${name} brand must be unmistakably warm`).toBeGreaterThan(60);
    }
    // The dark palette carries the owner's exact primary.
    expect(tokenIn(DARK, "brand-blue")).toEqual([212, 175, 55]);
  });

  it("gold did NOT replace the semantic colours (owner §18)", () => {
    // Success/warning/danger keep their hues; a redesign that paints every
    // state gold destroys meaning while passing every contrast check.
    for (const selector of [DARK, LIGHT]) {
      const success = tokenIn(selector, "state-success");
      const danger = tokenIn(selector, "state-danger");
      expect(success[1], "success stays green").toBeGreaterThan(success[0]);
      expect(danger[0], "danger stays red").toBeGreaterThan(danger[1]);
    }
  });

  it("BRAND is not CONFIRMATION — product-truth SEP-3, in colour", () => {
    // Gold used to MEAN "an employer really confirmed this" (the provenance
    // ladder's EMPLOYER_CONFIRMED, DESIGN_SOUL §1). Gold is now the brand, so
    // confirmation had to move: if the two were equal, every primary button on
    // the product would read as a verification claim.
    for (const [name, selector] of [
      ["dark", DARK],
      ["light", LIGHT],
    ] as const) {
      const brand = tokenIn(selector, "brand-blue");
      const trust = tokenIn(selector, "trust-accent");
      const evidence = tokenIn(selector, "brand-cyan");
      expect(eq(brand, trust), `${name}: brand must differ from the trust accent`).toBe(false);
      expect(eq(trust, evidence), `${name}: confirmation must differ from evidence`).toBe(false);
    }
  });

  it("nothing puts WHITE text on a brand fill", () => {
    // The rebrand's worst readability trap, and one no page-level contrast
    // check can see: the brand went from a dark blue to a LIGHT gold, so every
    // `bg-brand-blue text-white` primary action silently dropped to 2.10:1.
    // 38 of them existed. `text-text-on-brand` is near-black on gold (9.42:1)
    // and white on the light theme's deep gold (5.06:1).
    const BRAND_BG = /bg-brand-blue|bg-gradient-cta|bg-gradient-metallic/;
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(APP_ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        if (entry.isDirectory()) walk(rel);
        else if (rel.endsWith(".tsx")) {
          const src = read(rel);
          if (!BRAND_BG.test(src)) continue;
          // Scoped PER STRING LITERAL: `text-white` elsewhere in the file (on a
          // photo, an overlay, a semantic state fill) is legitimate.
          for (const [, , body] of src.matchAll(/(["'`])((?:[^"'`\\\n]|\\.)*)\1/g)) {
            if (BRAND_BG.test(body) && /\btext-white\b/.test(body)) offenders.push(rel);
          }
        }
      }
    };
    walk("components");
    walk("app");
    expect([...new Set(offenders)], "white text on a gold fill is unreadable").toEqual([]);
  });

  it("a disabled brand control is graphite, never dimmed gold", () => {
    // THE ACTUAL CAUSE of the "muddy mustard CTA": not the gold, but
    // `disabled:opacity-50`. Metallic gold at 50% over the obsidian ground
    // composites to rgb(119,100,37) — measured off the landing's real painted
    // pixels, on a control that sits disabled until you type. Dimming reads as
    // "pale" on a light UI and as "dirty" on black.
    //
    // The correction is one shared rule (the utility appears beside a brand
    // fill in ~60 components plus <Button>), and it must stay UNLAYERED and
    // AFTER `@tailwind utilities` to beat the equal-specificity
    // `.disabled\:opacity-50:disabled`.
    const rule = /\.bg-brand-blue:disabled[\s\S]{0,200}?\{[\s\S]*?\}/.exec(css);
    expect(rule, "the disabled-brand-control rule must exist").not.toBeNull();
    const body = rule![0];
    expect(body, "it restores full opacity").toMatch(/opacity:\s*1/);
    expect(body, "it drops to a graphite surface").toMatch(/background-color:\s*rgb\(var\(--c-ink-700\)\)/);
    expect(body, "it keeps the label legible").toMatch(/color:\s*rgb\(var\(--c-text-muted\)\)/);
    expect(body, "the gradient CTA is covered too").toMatch(/background-image:\s*none/);
    expect(css, "the gradient variant is selected as well").toMatch(/\.bg-gradient-cta:disabled/);
    // It has to come AFTER the utilities are emitted, or the cascade keeps the
    // dimmed fill and the whole rule is dead CSS.
    expect(css.indexOf(".bg-brand-blue:disabled")).toBeGreaterThan(
      css.indexOf("@tailwind utilities"),
    );
  });

  it("the metallic ramp is reserved, not a gold palette", () => {
    const gradients = read("tokens/gradients.ts");
    expect(gradients, "the owner's five-stop ramp exists").toMatch(/#8A6A12/);
    expect(gradients).toMatch(/#FFD966/);
    // Body/ordinary chrome must not be gradient-filled (brief §2): the ramp is
    // exposed as ONE named token, so a reviewer can see every use of it.
    expect(gradients).toMatch(/metallic:/);
  });
});

describe("both palettes meet WCAG AA", () => {
  const TEXT = 4.5;
  const BOUNDARY = 3;

  for (const [name, selector] of [
    ["dark", DARK],
    ["light", LIGHT],
  ] as const) {
    describe(name, () => {
      const page = () => tokenIn(selector, "ink-900");
      const card = () => tokenIn(selector, "ink-800");

      it("body and secondary text clear 4.5:1 on page and card", () => {
        for (const token of ["text-primary", "text-secondary", "text-muted"]) {
          const c = tokenIn(selector, token);
          expect(ratio(c, page()), `${name}/${token} on page`).toBeGreaterThanOrEqual(TEXT);
          expect(ratio(c, card()), `${name}/${token} on card`).toBeGreaterThanOrEqual(TEXT);
        }
      });

      it("the accent and every semantic colour clear 4.5:1 on a card", () => {
        for (const token of [
          "brand-blue",
          "state-success",
          "state-warning",
          "state-danger",
          "trust-accent",
        ]) {
          const c = tokenIn(selector, token);
          expect(ratio(c, card()), `${name}/${token} on card`).toBeGreaterThanOrEqual(TEXT);
        }
      });

      it("the accent clears 4.5:1 on the page too", () => {
        expect(ratio(tokenIn(selector, "brand-blue"), page())).toBeGreaterThanOrEqual(TEXT);
      });

      it("control boundaries clear 3:1 (WCAG 1.4.11)", () => {
        // `ink-500` outlines inputs, chips and buttons — including the
        // composer. This is deliberately NOT the #2A2A2A decorative border:
        // a control whose boundary is its only affordance needs 3:1.
        const c = tokenIn(selector, "ink-500");
        expect(ratio(c, card()), `${name}/ink-500 on card`).toBeGreaterThanOrEqual(BOUNDARY);
        expect(ratio(c, page()), `${name}/ink-500 on page`).toBeGreaterThanOrEqual(BOUNDARY);
      });

      it("cards are distinguishable from the page", () => {
        expect(ratio(card(), page()), `${name} surface separation`).toBeGreaterThan(1.0);
      });
    });
  }
});

describe("the LM mark is the owner's original geometry", () => {
  // The product shipped for months with three generic ascending bars as its
  // "logo". The real mark now ships — and must stay the ORIGINAL vector, not a
  // redraw. These four coordinates come from the owner's CorelDRAW source
  // (docs/brand/source/LM_Color Single.svg); if someone re-traces the mark,
  // they change.
  const MARK_ANCHORS = [
    "158.18,123.09 89.02,123.09 89.02,533.46",
    "326.49,414.25 208.23,256.78 208.23,414.25",
  ];

  for (const file of [
    "public/brand/lm-mark.svg",
    "app/icon.svg",
    "public/app-icon.svg",
    "components/ui/lm-logo.tsx",
  ]) {
    it(`${file} carries the untouched LM geometry`, () => {
      const src = read(file);
      for (const anchor of MARK_ANCHORS) {
        expect(src, `${file} must keep the original coordinates`).toContain(anchor);
      }
      expect(src, `${file}: the ".ai" dot`).toMatch(/cx="614\.05"/);
      expect(src, `${file}: the original viewBox or its exact scale`).toMatch(
        /700\.27|0\.04254/,
      );
    });
  }

  it("the orange original is gone from every production asset", () => {
    // A WHOLE-FILE check, deliberately. This used to strip comments first,
    // because each asset's provenance note quoted the source colour literally
    // and tripped its own guard. CodeQL flagged that stripper as incomplete
    // multi-character sanitisation (js/incomplete-multi-character-sanitization,
    // high) — correctly: removing `<!--…-->` in one pass can reintroduce `<!--`.
    // It was only ever reading files off disk in a test, so it was not
    // exploitable, but the fix is better than a suppression: the asset comments
    // now describe the original colour in words instead of quoting the hex, so
    // no sanitising is needed and the guard is STRICTER — the literal may not
    // appear anywhere in a production asset, prose included.
    for (const file of ["public/brand/lm-mark.svg", "app/icon.svg", "public/app-icon.svg"]) {
      expect(read(file), `${file} must not carry the legacy orange`).not.toMatch(/#FFA100/i);
    }
  });

  it("the untouched owner source stays archived beside the derived asset", () => {
    const source = readFileSync(
      join(APP_ROOT, "..", "..", "docs/brand/source/LM_Color Single.svg"),
      "utf8",
    );
    // The archive is the PROOF the production asset was derived, not drawn.
    expect(source).toContain("#FFA100");
    expect(source).toContain("158.18,123.09 89.02,123.09 89.02,533.46");
  });
});

/**
 * THE BRAND REACHES EXTERNAL CLIENTS TOO.
 *
 * The LabourMarket.ai app inside ChatGPT was showing a generic letter avatar,
 * because the MCP server declared a bare machine name and no identity. That is
 * the host's fallback, not our mark. The server now declares the CANONICAL
 * asset — the same files these tests already pin to the owner's original
 * geometry — so a host that renders a server-supplied icon renders ours.
 *
 * What this cannot do, and does not pretend to: whether a given host actually
 * uses a server-declared icon is the HOST's decision. This guard proves we
 * declare the right asset, never that ChatGPT drew it.
 */
describe("the ChatGPT / MCP surface carries the canonical brand", () => {
  const MCP_ROUTE = read("app/api/mcp/route.ts");

  it("declares the canonical mark, not a new or placeholder one", () => {
    expect(MCP_ROUTE, "the MCP server declares no identity").toContain("title:");
    expect(MCP_ROUTE).toContain("LabourMarket.ai");
    expect(MCP_ROUTE).toContain("icons");
    // The EXACT canonical assets, both of which the geometry guard above pins
    // to the owner's original vector.
    expect(MCP_ROUTE).toContain("/brand/lm-mark.svg");
    expect(MCP_ROUTE).toContain("/app-icon.svg");
  });

  it("introduces no second logo asset for the integration to use", () => {
    // A "ChatGPT-sized" copy is how a brand quietly forks. Every mark the
    // product serves is one of these, and each is checked above for the
    // owner's untouched geometry.
    const CANONICAL_MARKS = new Set([
      "lm-mark.svg",
      "app-icon.svg",
      "icon.svg",
      "favicon.ico",
      "logo-mark.svg", // the explicitly-labelled placeholder set
    ]);
    const svgsIn = (dir: string): string[] => {
      try {
        return readdirSync(join(APP_ROOT, dir), { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => e.name)
          .filter((n) => /\.(svg|ico|png)$/i.test(n));
      } catch {
        return [];
      }
    };
    for (const dir of ["public/brand", "public", "app"]) {
      for (const file of svgsIn(dir)) {
        expect(
          CANONICAL_MARKS.has(file) || !/logo|mark|icon|brand/i.test(file),
          `${dir}/${file} looks like a second logo asset — the ChatGPT app must ` +
            "reuse the canonical mark, never a new or resized copy of it",
        ).toBe(true);
      }
    }
  });

  it("the declared icon paths resolve to real assets carrying the original geometry", () => {
    // A declared URL that 404s brands nothing. Both paths must exist AND be
    // the owner's mark — a broken or substituted asset fails here, not in a
    // screenshot somebody takes weeks later.
    for (const [declared, onDisk] of [
      ["/brand/lm-mark.svg", "public/brand/lm-mark.svg"],
      ["/app-icon.svg", "public/app-icon.svg"],
    ] as const) {
      expect(MCP_ROUTE, `${declared} is not declared`).toContain(declared);
      const src = read(onDisk);
      expect(src, `${onDisk}: the original LM geometry`).toContain(
        "158.18,123.09 89.02,123.09 89.02,533.46",
      );
      expect(src, `${onDisk}: the ".ai" dot`).toMatch(/cx="614\.05"/);
    }
  });
});
