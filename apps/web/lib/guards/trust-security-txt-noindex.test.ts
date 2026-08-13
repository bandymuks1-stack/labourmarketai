import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * V8 trust slice — two publicly-verifiable security signals, pinned.
 *
 * 1. `/.well-known/security.txt` (RFC 9116): an outside researcher must have
 *    a stated, machine-findable way to report a vulnerability. The audit of
 *    2026-08-13 found none — the only public contact was a legal-notice
 *    mailto. The file must stay valid: a Contact line, and an Expires that
 *    has not passed (an expired security.txt reads as an unmaintained one).
 *
 * 2. Private routes carry explicit `noindex`. robots.txt disallows crawling
 *    them, but a disallow does NOT stop URL-only indexing from inbound
 *    links; the locale layout's `index: true` used to be inherited by every
 *    authenticated tree. Each private layout/page must override it.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("security.txt — the disclosure channel exists and is maintained", () => {
  const PATH = join(WEB, "public", ".well-known", "security.txt");

  it("is published at /.well-known/security.txt", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  it("carries a Contact and an unexpired Expires (RFC 9116 both REQUIRED)", () => {
    const txt = readFileSync(PATH, "utf8");
    expect(txt).toMatch(/^Contact: mailto:.+@.+$/m);
    const expires = txt.match(/^Expires: (.+)$/m);
    expect(expires).not.toBeNull();
    const at = new Date((expires as RegExpMatchArray)[1].trim());
    expect(Number.isNaN(at.getTime())).toBe(false);
    // Not yet expired — when this goes RED, renew the file, don't delete it.
    expect(at.getTime()).toBeGreaterThan(Date.now());
  });

  it("claims no bounty and points only at surfaces we control", () => {
    const txt = readFileSync(PATH, "utf8");
    // No fake reward program (V8 §21): the words must not appear.
    expect(txt).not.toMatch(/bounty|reward/i);
    for (const url of txt.match(/https?:\/\/\S+/g) ?? []) {
      expect(url.startsWith("https://labourmarket.ai/")).toBe(true);
    }
  });
});

describe("private routes carry explicit noindex", () => {
  const PRIVATE_SURFACES = [
    "app/[locale]/dashboard/layout.tsx",
    "app/[locale]/auth/layout.tsx",
    "app/[locale]/onboarding/layout.tsx",
    "app/[locale]/cv/page.tsx",
  ] as const;

  for (const file of PRIVATE_SURFACES) {
    it(`${file} exports robots noindex metadata`, () => {
      const src = read(...file.split("/"));
      expect(src).toMatch(/export const metadata[\s\S]{0,200}index: false/);
      expect(src).toMatch(/follow: false/);
    });
  }
});
