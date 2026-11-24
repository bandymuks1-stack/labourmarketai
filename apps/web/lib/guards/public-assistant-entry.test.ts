import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The assistant is visible in the public header at every width it has room
 * (owner P0 2026-11-23: "AI asistentas aiškiai matomas ir pasiekiamas";
 * CAROUSEL_NAVIGATION_SPEC N2). From `lg` the intent bar carries it; between
 * `md` and `lg` an icon in the header row does, in the room the language
 * code frees. Same destinations as the bar: the conversation home signed in,
 * the landing's question box signed out.
 */
const nav = readFileSync(join(__dirname, "..", "..", "components/layouts/site-nav.tsx"), "utf8");
const bar = readFileSync(join(__dirname, "..", "..", "components/layouts/intent-mega-menu.tsx"), "utf8");

describe("the public assistant entry", () => {
  it("the bar carries it from lg", () => {
    expect(nav).toMatch(/<IntentMegaMenu\s+className="hidden lg:block"/);
    expect(bar).toMatch(/data-testid="intent-bar-assistant"/);
  });

  it("between md and lg the header row carries it, to the same two destinations", () => {
    expect(nav).toMatch(/<span className="hidden md:inline-flex lg:hidden">\s*<NavAuthCtas guest=\{assistantIcon\(ASSISTANT_GUEST_HREF\)\} member=\{assistantIcon\(ASSISTANT_HREF\)\} \/>/);
    expect(nav).toMatch(/data-testid="header-assistant"/);
    expect(nav).toMatch(/aria-label=\{assistant\.label\}/);
    expect(nav).toMatch(/inline-flex size-11/);
  });

  it("the language control shows its code until lg, which is what makes the room", () => {
    expect(nav).toMatch(/<LocaleSwitcher className="flex" compactBelowSm compactBelowLg \/>/);
  });
});
