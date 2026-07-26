import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * UX 2.0 — light-first theme contract.
 *
 * The audit found the light palette fully built, complete with AA-corrected
 * semantics, and completely unreachable: `:root` carried dark, light hid behind
 * `[data-theme="light"]`, and the only switch lived two clicks deep in an
 * avatar menu. The owner's direction is light-first, so the two blocks swapped
 * roles. That swap has three ways to go wrong and this guard covers all three:
 *
 *   • the default silently reverts to dark;
 *   • a user's DELIBERATE dark choice gets overwritten (worse than the bug);
 *   • the light palette ships below WCAG AA because it was never the theme
 *     anyone actually measured — four of its values really were failing.
 *
 * Negative controls (audit list items 4, 5, 16): light-theme flash, ignored
 * stored dark preference, dark-theme regression.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");

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

const LIGHT = ":root,\n:root[data-theme=\"light\"]";
const DARK = ':root[data-theme="dark"]';

describe("light is the product default", () => {
  it("the bare :root selector carries the LIGHT palette", () => {
    // A light page background is the whole point — if this triplet goes dark
    // again, every new user lands on #06070D.
    const page = tokenIn(LIGHT, "ink-900");
    expect(relLum(page), "default page background must be light").toBeGreaterThan(0.5);
    expect(css.slice(css.indexOf(LIGHT))).toMatch(/color-scheme:\s*light/);
  });

  it("dark is reachable only through an explicit attribute", () => {
    const page = tokenIn(DARK, "ink-900");
    expect(relLum(page), "dark page background must be dark").toBeLessThan(0.05);
  });

  it("the pre-paint bootstrap resolves a definite theme, defaulting to light", () => {
    for (const file of ["app/[locale]/layout.tsx", "app/[locale]/not-found.tsx"]) {
      const src = read(file);
      expect(src, `${file}: reads the shared key`).toMatch(/localStorage\.getItem\('theme'\)/);
      // Resolve-then-stamp: never "stamp only if stored", which left the
      // attribute absent and every reader guessing.
      expect(src, `${file}: resolves dark-or-light`).toMatch(/s===''?'?dark'?'?\s*\?\s*'dark'\s*:\s*'light'/);
      expect(src, `${file}: stamps before paint`).toMatch(/document\.documentElement\.dataset\.theme=t/);
    }
  });

  it("a stored DARK preference is never overwritten", () => {
    // The one regression worse than the original bug: a light-first default
    // that stomps on a deliberate choice.
    const layout = read("app/[locale]/layout.tsx");
    expect(layout).toMatch(/'dark'/);
    const reapply = read("components/app/theme-reapply.tsx");
    expect(reapply).toMatch(/localStorage\.getItem\("theme"\) === "dark"/);
    // The watcher must still only act when the attribute was STRIPPED.
    expect(reapply).toMatch(/hasAttribute\("data-theme"\)/);
  });

  it("every theme reader treats an absent attribute as light, not dark", () => {
    for (const file of [
      "components/ui/theme-toggle-icon.tsx",
      "components/app/account-menu.tsx",
    ]) {
      const src = read(file);
      expect(src, `${file}: initial state`).toMatch(/useState<"dark" \| "light">\("light"\)/);
      expect(src, `${file}: absent means light`).toMatch(/current === "dark" \? "dark" : "light"/);
    }
  });
});

describe("the switch is discoverable", () => {
  it("the conversation header mounts the shared toggle", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).toMatch(/ThemeToggleIcon/);
    expect(header).toMatch(/testId="chat-theme-toggle"/);
  });

  it("it is ONE toggle reused, not a second implementation", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).toMatch(/from "@\/components\/ui\/theme-toggle-icon"/);
    // No local storage writing / attribute flipping in the header itself.
    expect(header).not.toMatch(/localStorage/);
    expect(header).not.toMatch(/dataset\.theme/);
  });

  it("it reuses existing localized copy — no new i18n keys for a toggle", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).toMatch(/auth\.dashboard\.account\.theme/);
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

  it("the account menu keeps its own entry — a second door, not a move", () => {
    expect(read("components/app/account-menu.tsx")).toMatch(/account-menu-theme-toggle/);
  });
});

describe("both palettes meet WCAG AA", () => {
  const TEXT = 4.5;
  const BOUNDARY = 3;

  for (const [name, selector] of [
    ["light", LIGHT],
    ["dark", DARK],
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
        // composer. In light it measured 1.75:1, so the composer had no
        // visible edge at all until this was corrected.
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
