import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IdentityFamilyProvider } from "@/components/app/identity/identity-family-context";
import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { PersonPresence } from "@/components/app/work-world/primitives";

/**
 * THE PUBLIC LANDING KEEPS ITS LOOK (owner decision 2026-10-14).
 *
 * D2's identity-family plate is opt-in: `PersonPortrait` draws it only
 * beneath `IdentityFamilyProvider`, which only the signed-in dashboard layout
 * mounts. The frozen public landing (`/`, `(marketing)/**`, focus-landing)
 * renders `PersonPresence` / the lifecycle graph through the same portrait and
 * must keep main's legacy monogram tile until a separate approval.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

function filesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(WEB, dir))) {
      const r = join(dir, name);
      if (statSync(join(WEB, r)).isDirectory()) walk(r);
      else if (/\.(tsx?|jsx?)$/.test(name)) out.push(r);
    }
  };
  walk(rel);
  return out;
}

const PORTRAIT_PROPS = { name: "Ona Kazlauskienė", avatarUrl: null, initials: "OK", width: "40px" };

describe("the identity-family plate is opt-in and never reaches the public landing", () => {
  it("only the signed-in dashboard layout mounts the provider", () => {
    const mounts = filesUnder("app")
      .filter((f) => /<IdentityFamilyProvider\b/.test(read(f)))
      .map((f) => relative(WEB, join(WEB, f)).replace(/\\/g, "/"));
    expect(mounts).toEqual(["app/[locale]/dashboard/layout.tsx"]);
  });

  it("public routes and root layouts never mount it", () => {
    const publicFiles = [
      "app/layout.tsx",
      "app/[locale]/layout.tsx",
      "app/[locale]/page.tsx",
      ...filesUnder("app/[locale]/(marketing)"),
      ...filesUnder("app/[locale]/focus-landing"),
    ].filter((f) => {
      try {
        return statSync(join(WEB, f)).isFile();
      } catch {
        return false;
      }
    });
    expect(publicFiles.length).toBeGreaterThan(3);
    for (const f of publicFiles) {
      expect(read(f), f).not.toMatch(/IdentityFamilyProvider|identity-family-context/);
    }
  });

  it("without the provider, PersonPortrait renders main's legacy monogram tile", () => {
    const html = renderToStaticMarkup(createElement(PersonPortrait, PORTRAIT_PROPS));
    expect(html).toContain(
      'class="flex h-full w-full items-center justify-center rounded-xl font-display font-bold tracking-tightest bg-ink-700 text-text-primary border border-ink-500"',
    );
    expect(html).toContain("font-size:calc(40px * 0.36)");
    expect(html).not.toMatch(/data-identity|linear-gradient|--c-identity/);
  });

  it("beneath the provider, the same portrait draws the identity-family plate", () => {
    const html = renderToStaticMarkup(
      createElement(IdentityFamilyProvider, null, createElement(PersonPortrait, PORTRAIT_PROPS)),
    );
    expect(html).toContain('data-identity="person-fallback"');
    expect(html).toMatch(/linear-gradient\(160deg, rgb\(var\(--c-identity-\d+a\)\)/);
  });

  it("the landing's PersonPresence (frozen file) still renders the legacy tile", () => {
    const html = renderToStaticMarkup(createElement(PersonPresence, { name: "Jonas Petraitis", role: "Elektrikas" }));
    expect(html).toContain("font-display font-bold tracking-tightest bg-ink-700 text-text-primary");
    expect(html).not.toMatch(/data-identity|linear-gradient/);
  });
});
