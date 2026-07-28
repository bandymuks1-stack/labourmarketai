import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * §18 / §11 — the PRODUCTION conversation surface must render only real data or
 * an honest empty state; illustrative sample cards (the "De Vries Bouw" employer
 * match, the sample work-log / translation) may live ONLY in the dev-only design
 * gallery, which is gated by `designGalleryEnabled` and never rendered in a
 * production build.
 *
 * This guard bites if anyone reintroduces a fabricated employer / sample thread
 * on the live `/dashboard` conversation route.
 */
const APP = join(process.cwd(), "app", "[locale]");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

describe("conversation: no sample data on the production route", () => {
  const prodPage = read("dashboard/page.tsx");

  it("the live /dashboard conversation passes NO scripted sample thread", () => {
    expect(prodPage).not.toMatch(/sampleThread/);
    expect(prodPage).not.toMatch(/script=\{/);
  });

  it("the live /dashboard conversation contains no fabricated employer name", () => {
    expect(prodPage).not.toMatch(/De Vries|Rotterdam Staal/i);
  });

  it("the sample thread has nowhere left to live (W1 deleted the preview)", () => {
    // The dev-gated preview used to be the ONE permitted home for the sample
    // thread. W1 deleted it, so the exception is gone entirely — a stronger
    // guarantee than "it is gated".
    expect(existsSync(join(APP, "design"))).toBe(false);
  });

  it("the fabricated employer names have no home left in the product", () => {
    // W1 deleted the dev preview that used to hold them; the scan above now
    // covers the whole tree with no permitted exception.
    expect(existsSync(join(APP, "design"))).toBe(false);
  });
});
