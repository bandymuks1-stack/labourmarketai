import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The first screen must not wait for the animation library.
 *
 * Every client component of a page shares one list of chunks; nothing on the
 * page answers a tap until the whole list has arrived. Measured 2026-11-13 on
 * a slow phone connection: with the animated wrappers imported directly, the
 * goal cards answered about 0.4 s after the header because the animation
 * library (the largest file on the list) was on it. They are therefore loaded
 * as their own chunk through `components/marketing/lazy-motion.tsx`.
 */
const MARKETING = join(process.cwd(), "components", "marketing");
const read = (f: string) => readFileSync(join(MARKETING, f), "utf8");

describe("the landing's first screen does not wait for the animation library", () => {
  it("the animated wrappers are loaded as their own chunk", () => {
    const lazy = read("lazy-motion.tsx");
    expect(lazy).toMatch(/^"use client";/);
    expect(lazy).toMatch(/export const Reveal = dynamic\(\(\) => import\("\.\/reveal"\)/);
    expect(lazy).toMatch(/export const TwoSidesLifecycle = dynamic\(\(\) =>\s*import\("\.\/two-sides-lifecycle"\)/);
    // Rendered on the server as before — never switched off there.
    expect(lazy).not.toMatch(/ssr:\s*false/);
  });

  it("no other marketing file imports them directly", () => {
    const direct = /from "(?:@\/components\/marketing|\.)\/(?:reveal|two-sides-lifecycle)"/;
    const offenders = readdirSync(MARKETING)
      .filter((f) => f.endsWith(".tsx") && f !== "lazy-motion.tsx")
      .filter((f) => direct.test(read(f).replace(/import type [^;]+;/g, "")));
    expect(offenders).toEqual([]);
  });
});
