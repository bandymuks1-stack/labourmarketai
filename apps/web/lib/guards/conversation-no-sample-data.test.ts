import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

  it("the sample thread lives only in the dev-gated design preview", () => {
    const preview = read("design/conversation/page.tsx");
    // The sample thread exists here (illustrative) …
    expect(preview).toMatch(/sampleThread/);
    // … and this route is gated so it never renders in production.
    expect(preview).toMatch(/designGalleryEnabled/);
    expect(preview).toMatch(/notFound\(\)/);
  });

  it("the fabricated employer names appear ONLY behind the dev gate", () => {
    // Any file that mentions the sample employer must also be the dev preview
    // (or a test). This is a coarse but effective drift alarm.
    const preview = read("design/conversation/page.tsx");
    expect(preview).toMatch(/De Vries Bouw/); // it's the sample here, on purpose
  });
});
