import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sign-in and sign-up pages ship no intent classifier (perf 2026-11-22).
 *
 * `components/app/auth-carried-intent.tsx` is a client component on both pages.
 * It only needs to read the visitor's sentence back out of `next`. Importing it
 * from `@/lib/marketing/public-entry` pulled that module's intent router and
 * its lexicons into the browser bundle of both pages: about 250 KiB of
 * JavaScript that never runs there. The carry half lives in
 * `public-entry-carry`, the same split the landing field already uses.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("auth pages import the carry half of the public entry only", () => {
  it("auth-carried-intent reads the sentence from public-entry-carry", () => {
    const src = read("components/app/auth-carried-intent.tsx");
    expect(src).toMatch(/from "@\/lib\/marketing\/public-entry-carry"/);
    expect(src).not.toMatch(/from "@\/lib\/marketing\/public-entry"/);
  });

  it("the carry module stays free of the classifier", () => {
    const src = read("lib/marketing/public-entry-carry.ts");
    expect(src).not.toMatch(/intent-router|intent-registry|structuring\//);
  });
});
