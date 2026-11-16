/**
 * Guard: a new school, college or university that opens "For education
 * providers" from the header or the phone menu reaches SIGN-UP, not sign-in
 * (owner P0 2026-11-15, finding F9).
 *
 * The header link used to point at INSTITUTION_DOOR_NEXT — the institution
 * setup inside the signed-in product. A visitor sent there is redirected to
 * sign-in, with no note, although they have no account yet. The landing's own
 * institution door already used sign-up with the setup as its return path; the
 * header now uses that same door and carries the same account note as every
 * goal link that needs an account (no new copy, decision 0032).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { INSTITUTION_DOOR_NEXT, STARTING_CONTEXTS } from "@/lib/marketing/public-doors";

const web = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("institution door in the header and phone menu", () => {
  it("the landing's institution door is sign-up carrying the institution setup as its return path", () => {
    expect(INSTITUTION_DOOR_NEXT.startsWith("/dashboard/"), "the setup itself is a signed-in path").toBe(true);
    const landing = STARTING_CONTEXTS.find((c) => c.key === "institution");
    const url = new URL(landing?.href ?? "", "http://internal.invalid");
    expect(url.pathname).toBe("/auth/signup");
    expect(url.searchParams.get("next")).toBe(INSTITUTION_DOOR_NEXT);
  });

  it("the header reads that same door (one door, two places), never retypes it", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/const INSTITUTION_DOOR: string =\s*STARTING_CONTEXTS\.find\(\(c\) => c\.key === "institution"\)\?\.href \?\? "\/auth\/signup";/);
  });

  it("the header hands the sign-up door to both menus, marked as needing an account", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/\{ key: "education", href: INSTITUTION_DOOR, label: tIntent\("education"\), account: true, accountNote: tIntent\("signUp"\) \}/);
    // Never the signed-in setup path as a visitor's link.
    expect(nav).not.toMatch(/href: INSTITUTION_DOOR_NEXT/);
    expect(nav).toMatch(/<MobileNavMenu[\s\S]*?items=\{moreLinks\}/);
    expect(nav).toMatch(/links: moreLinks,/);
  });

  it("both menus show the existing account note on such a link", () => {
    const mega = read("components/layouts/intent-mega-menu.tsx");
    const more = mega.slice(mega.indexOf('data-testid="intent-more-links"'));
    expect(more).toMatch(/\{link\.account && \([\s\S]*?\{link\.accountNote \?\? accountLabel\}/);
    const mobile = read("components/layouts/mobile-nav-menu.tsx");
    const items = mobile.slice(mobile.indexOf("{items.map((item) =>"));
    expect(items).toMatch(/\{item\.account && \([\s\S]*?\{item\.accountNote \?\? accountLabel\}/);
  });

  it("the institution door, a sign-UP link, carries the existing sign-up note", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/key: "education", href: INSTITUTION_DOOR,[^\n]*accountNote: tIntent\("signUp"\)/);
  });
});
