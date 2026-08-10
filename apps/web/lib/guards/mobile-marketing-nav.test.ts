import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * MOBILE MARKETING NAV — beta foundation audit M1.
 *
 * The defect: the six primary marketing links lived ONLY inside the
 * `hidden lg:flex` desktop nav and there was no mobile menu component at
 * all ("mobile has no separate menu" was a literal comment in the file).
 * Below `lg` the public header was logo + Sign in + Start now + theme +
 * locale, so a phone visitor could not reach /for-workers, /for-companies,
 * /for-agencies, /#how-it-works, /pricing or /about from the header.
 *
 * What is proven here:
 *  1. the mobile mount's breakpoint is the exact COMPLEMENT of the desktop
 *     nav's — DERIVED from both class strings, not pinned as a literal, so
 *     moving the desktop nav to `xl:flex` fails here instead of re-opening
 *     a silent dead zone between the two breakpoints;
 *  2. the menu is handed the SAME link list the desktop nav renders (the
 *     server component stays the single source of truth, incl. the /vision
 *     publication gate) and hardcodes no href of its own;
 *  3. a REAL render of the closed component: a labelled 44px disclosure
 *     button, correct ARIA wiring, and no panel in the DOM until opened;
 *  4. the panel closes on navigation and on Escape;
 *  5. every one of the 11 locale catalogues carries real menu labels — no
 *     missing key (raw-key leak) and no `[EN]` placeholder.
 *
 * Open/close INTERACTION at 320/375/768 is proven in the browser by
 * tests/e2e/mobile-marketing-nav.spec.ts — this file proves the contract
 * that survives refactors.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

const navSrc = read("components/layouts/site-nav.tsx");
const menuSrc = read("components/layouts/mobile-nav-menu.tsx");

describe("the mobile menu covers exactly the viewports the desktop nav hides", () => {
  it("desktop nav is still breakpoint-gated (the condition that creates the need)", () => {
    expect(navSrc).toMatch(/className="hidden [^"]*\b(sm|md|lg|xl):flex\b/);
  });

  it("the mobile mount's breakpoint is the complement of the desktop nav's", () => {
    // DERIVED from the source on both sides. A future PR that moves the
    // desktop nav to another breakpoint without moving the mobile menu
    // re-opens the dead zone — and fails here.
    const desktop = navSrc.match(/className="hidden [^"]*\b(sm|md|lg|xl):flex\b/);
    const mobile = navSrc.match(/<MobileNavMenu[\s\S]*?className="([^"]*)"/);
    expect(desktop?.[1], "desktop nav reveal breakpoint").toBeTruthy();
    expect(mobile?.[1], "MobileNavMenu className").toBeTruthy();
    expect(
      mobile?.[1],
      `MobileNavMenu must hide at exactly ${desktop?.[1]} (where the desktop nav appears)`,
    ).toContain(`${desktop?.[1]}:hidden`);
  });

  it("the header row fits a 320px phone: mobile gap/padding are tightened", () => {
    // MEASURED 2026-08-08: with the desktop gap-6/px-6 and the auth CTAs
    // always in the row, the header's contents were 545px wide at 320px and
    // `html { overflow-x: hidden }` clipped the excess — the theme toggle and
    // locale switcher were off-screen, and a menu button added there would
    // have been unreachable too. Proven live by tests/e2e/mobile-marketing-nav.
    expect(navSrc).toMatch(/gap-2[^"]*sm:gap-6/);
    expect(navSrc).toMatch(/px-4[^"]*sm:px-12/);
    // The logo yields space instead of pushing the controls off-screen.
    expect(navSrc).toMatch(/min-w-0 shrink truncate/);
    // The locale switcher shows the CODE below sm here, and ONLY here.
    expect(navSrc).toMatch(/<LocaleSwitcher[^/]*compactBelowSm/);
  });

  it("the locale compaction is opt-in, so roomier hosts keep the native name", () => {
    // The footer and the account page render the same switcher with space to
    // spare; a global compaction would have downgraded their label too.
    const switcher = read("components/marketing/locale-switcher.tsx");
    expect(switcher).toMatch(/compactBelowSm = false/);
    for (const host of [
      "components/layouts/site-footer.tsx",
      "app/[locale]/dashboard/account/page.tsx",
    ]) {
      expect(read(host), `${host} must not opt into the compact label`).not.toMatch(
        /compactBelowSm/,
      );
    }
  });

  it("the auth CTAs move into the panel below sm, and are defined ONCE", () => {
    // A second literal would be free to drift to a different destination.
    expect(navSrc.match(/relPath=\{`\/\$\{locale\}\/auth\/login`\}/g)).toHaveLength(1);
    expect(navSrc.match(/relPath=\{`\/\$\{locale\}\/auth\/signup`\}/g)).toHaveLength(1);
    // Header mount: hidden below sm. Panel mount: hidden from sm up. Exactly
    // one of the two is live at any width, so the CTAs are never duplicated
    // to a sighted user and never absent.
    expect(navSrc).toMatch(/className="hidden items-center gap-3 sm:flex[^"]*">\{authCtas\}/);
    expect(navSrc).toMatch(/data-testid="mobile-nav-auth"[\s\S]{0,200}sm:hidden/);
  });

  it("the auth slot element carries a key (RSC Flight elements cannot be validated)", () => {
    // The dev JSX runtime cannot mark a server→client deserialized element as
    // validated, so a keyless slot rendered beside {items.map(...)} logs a
    // "unique key prop" warning on every public page. It did, before this key.
    expect(navSrc).toMatch(/key="mobile-nav-auth"/);
  });

  it("the theme toggle and locale switcher stay OUT of the menu (F1 + ad-locale rules)", () => {
    // Both must remain directly in the header at every viewport; folding
    // them into a disclosure would regress two earlier fixes. Checked as JSX
    // USAGE (`<Name`), not as a mention — a doc comment naming either
    // component is not a regression, rendering one inside the menu is.
    expect(menuSrc).not.toMatch(/<ThemeToggleIcon\b/);
    expect(menuSrc).not.toMatch(/<LocaleSwitcher\b/);
    // In the header the two controls are SIBLINGS of the menu, never
    // children of it — the mount must be a self-closing element.
    const mount = navSrc.match(/<MobileNavMenu[\s\S]*?\/>/);
    expect(mount?.[0], "MobileNavMenu mount").toBeTruthy();
    expect(mount?.[0]).not.toMatch(/<ThemeToggleIcon\b/);
    expect(mount?.[0]).not.toMatch(/<LocaleSwitcher\b/);
    expect(navSrc).toMatch(/<ThemeToggleIcon\b/);
    expect(navSrc).toMatch(/<LocaleSwitcher\b/);
  });
});

describe("the menu renders the SAME links as the desktop nav", () => {
  it("items are mapped from the shared `links` list, not a second literal", () => {
    expect(navSrc).toMatch(/<MobileNavMenu[\s\S]*?items=\{links\.map\(/);
  });

  it("the menu component hardcodes no href of its own", () => {
    // Every href it renders arrives as data. A literal marketing path here
    // would be a second source of truth that can drift from the desktop nav
    // and would bypass the /vision publication gate.
    expect(menuSrc).not.toMatch(/href[=:]\s*["'`]\//);
    expect(menuSrc).toMatch(/href=\{item\.href\}/);
  });

  it("labels reuse the existing nav translations (no new label vocabulary)", () => {
    expect(navSrc).toMatch(/label:\s*t\(l\.key\)/);
  });
});

describe("the disclosure button is accessible and 44px (real render)", () => {
  // Real component, real markup — the closed state is what every visitor
  // gets on first paint.
  async function renderClosed(): Promise<string> {
    vi.doMock("@/lib/i18n/navigation", () => ({
      Link: ({ href, children }: { href: string; children: unknown }) =>
        createElement("a", { href }, children as never),
    }));
    const { MobileNavMenu } = await import("@/components/layouts/mobile-nav-menu");
    return renderToStaticMarkup(
      createElement(MobileNavMenu, {
        items: [
          { key: "workers", href: "/for-workers", label: "Darbuotojams" },
          { key: "pricing", href: "/pricing", label: "Kainos" },
        ],
        openLabel: "Meniu",
        closeLabel: "Uždaryti meniu",
        className: "lg:hidden",
      }),
    );
  }

  it("renders ONE labelled toggle, collapsed, with no panel in the DOM", async () => {
    const html = await renderClosed();
    expect(html.match(/data-testid="mobile-nav-toggle"/g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Meniu"');
    expect(html).toContain('aria-controls="mobile-nav-menu"');
    // Collapsed means the links are genuinely absent, not merely hidden.
    expect(html).not.toContain('data-testid="mobile-nav-menu"');
    expect(html).not.toContain("/for-workers");
  });

  it("the toggle is a >=44px touch target (h-11 w-11 = 44px at the default scale)", async () => {
    const html = await renderClosed();
    const button = html.slice(html.indexOf("<button"), html.indexOf("</button>"));
    expect(button).toMatch(/\bh-11\b/);
    expect(button).toMatch(/\bw-11\b/);
  });

  it("panel rows are also >=44px tall", () => {
    expect(menuSrc).toMatch(/min-h-11/);
    // The panel's Sign in link is a bare text link, so it needs the floor
    // stated explicitly — the button below it is already tall enough.
    expect(navSrc).toMatch(/min-h-11 items-center text-sm/);
  });
});

describe("the panel closes on navigation and on Escape", () => {
  it("every link click closes the panel", () => {
    // A #how-it-works item is same-page, so a route change is NOT a reliable
    // close signal — the click handler is.
    expect(menuSrc).toMatch(/onClick=\{\(\)\s*=>\s*setOpen\(false\)\}/);
  });

  it("Escape closes it and returns focus to the trigger", () => {
    expect(menuSrc).toMatch(/e\.key === "Escape"/);
    expect(menuSrc).toMatch(/buttonRef\.current\?\.focus\(\)/);
  });

  it("an outside click closes it", () => {
    expect(menuSrc).toMatch(/mousedown/);
  });
});

describe("menu labels exist and are translated in all 11 locales", () => {
  const LOCALES = readdirSync(join(APP_ROOT, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("all 11 locale catalogues are covered", () => {
    expect(LOCALES).toHaveLength(11);
  });

  it.each(["menuOpen", "menuClose"])(
    "nav.%s is a real translated string in every locale",
    (key) => {
      for (const loc of LOCALES) {
        const nav = (
          JSON.parse(read(`messages/${loc}.json`)) as {
            nav: Record<string, string>;
          }
        ).nav;
        const value = nav[key];
        expect(typeof value, `${loc} nav.${key} missing (raw key would leak)`).toBe(
          "string",
        );
        expect(value.trim(), `${loc} nav.${key} empty`).not.toBe("");
        expect(value, `${loc} nav.${key} is an untranslated placeholder`).not.toContain(
          "[EN]",
        );
      }
    },
  );
});
