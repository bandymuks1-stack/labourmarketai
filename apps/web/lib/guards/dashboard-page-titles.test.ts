import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

/**
 * Production audit 2026-10-25: every /dashboard page rendered the one generic
 * site <title> (WCAG 2.2 SC 2.4.2). Each page now names itself through
 * `dashboardPageMetadata` (lib/navigation/dashboard-metadata.ts). This guard
 * keeps every page wired, its route honest, and every title translated.
 */
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));

const { dashboardTitleKey } = await import("@/lib/navigation/dashboard-metadata");

const WEB = resolve(__dirname, "../..");
const DASH = join(WEB, "app/[locale]/dashboard");
const ACTIVE = ["lt", "en", "ru", "nl", "de", "pl"] as const;

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === "page.tsx" ? [p] : [];
  });
}

function catalogue(locale: string): Record<string, unknown> {
  const read = (f: string) => JSON.parse(readFileSync(join(WEB, "messages", f), "utf8"));
  return {
    ...read(`${locale}.json`),
    journal: read(`${locale}/journal.json`),
    labourMarket: read(`${locale}/labour-market.json`),
  };
}

function lookup(messages: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), messages);
}

const WIRED = /export const generateMetadata = dashboardPageMetadata\("([^"]+)"(?:, "([^"]+)")?\);/;

const all = pages(DASH).map((file) => {
  const route = "/" + relative(join(WEB, "app/[locale]"), file).replace(/\\/g, "/").replace(/\/page\.tsx$/, "");
  const m = readFileSync(file, "utf8").match(WIRED);
  return { file, route, wired: m?.[1] ?? null, heading: m?.[2] };
});

describe("every dashboard page names itself in the document title", () => {
  it("finds the dashboard pages", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it.each(all.map((p) => [p.route, p] as const))("%s is wired with its own route", (_route, p) => {
    expect(p.wired, `${p.route} does not export generateMetadata via dashboardPageMetadata`).not.toBeNull();
    expect(p.wired).toBe(p.route);
  });

  it.each(ACTIVE.map((l) => [l] as const))("every title resolves to real copy in %s", (locale) => {
    const messages = catalogue(locale);
    for (const p of all) {
      const key = dashboardTitleKey(p.route, p.heading);
      const value = lookup(messages, key);
      expect(typeof value, `${locale}: ${p.route} → ${key}`).toBe("string");
      expect((value as string).trim(), `${locale}: ${p.route} → ${key}`).not.toBe("");
      expect(value as string, `${locale}: ${p.route} → ${key} has a placeholder`).not.toMatch(/[{}]|\[EN\]/);
    }
  });

  it("the main surfaces get distinct titles", () => {
    for (const locale of ["lt", "en"]) {
      const messages = catalogue(locale);
      const titles = ["/dashboard/journal", "/dashboard/planning", "/dashboard/communication", "/dashboard/profile"].map(
        (r) => lookup(messages, dashboardTitleKey(r, all.find((p) => p.route === r)?.heading)),
      );
      expect(new Set(titles).size, `${locale}: ${titles.join(" | ")}`).toBe(4);
    }
  });
});
