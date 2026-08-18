import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PUBLIC JOB FUNNEL GUARD.
 *
 * The public job board was made discoverable, and then dead-ended: the detail
 * page was AUTH-BLIND, so a visitor who clicked "Create a free account",
 * registered, and was returned to the same URL saw the identical "create an
 * account" card. This guard locks the funnel closed-loop AND the two properties
 * that make the unlock safe.
 */
const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

const PAGE = "app/[locale]/(marketing)/jobs/[id]/page.tsx";

describe("the public job page unlocks for a member", () => {
  const page = read(PAGE);

  it("consults the session", () => {
    expect(page).toContain("auth.getUser()");
  });

  it("reads the member projection only when a user exists", () => {
    // The ternary is the contract: no session → no member read at all.
    expect(page).toMatch(/const member = user\s*\n?\s*\?\s*await getPublicVacancyById/);
  });

  it("offers a real next action instead of a second signup prompt", () => {
    expect(page).toContain('href="/dashboard/opportunities"');
    expect(page).toContain('href="/dashboard/profile"');
  });

  it("still offers signup/login to anonymous visitors, with the return path", () => {
    expect(page).toContain("/auth/signup?next=");
    expect(page).toContain("/auth/login?next=");
  });
});

describe("cache isolation — a session-dependent page must never be shared", () => {
  const page = read(PAGE);

  /**
   * THE ONE THAT MATTERS. This page renders different CONTENT per caller. A
   * shared cache entry could replay a member's employer / location / apply URL
   * to an anonymous visitor — the exact leak the projection design prevents at
   * the database layer. `revalidate` and this page are mutually exclusive.
   */
  it("is force-dynamic", () => {
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("carries no revalidate window", () => {
    // Anchored to line start: the header comment explains why `revalidate` was
    // removed, and a substring match would fire on that explanation instead of
    // on a real re-introduction.
    expect(page).not.toMatch(/^export const revalidate/m);
  });
});

describe("the anonymous surface is unchanged by the unlock", () => {
  const page = read(PAGE);

  it("metadata is built from the anonymous projection for every caller", () => {
    const meta = page.slice(
      page.indexOf("export async function generateMetadata"),
      page.indexOf("type L = Record"),
    );
    expect(meta).toContain("getPublicVacancyPreview");
    // A member-only reader inside <head> would publish the employer into a
    // shared, scraped, link-previewed surface.
    expect(meta).not.toContain("getPublicVacancyById");
    expect(meta).not.toContain("auth.getUser");
  });

  it("the member reader is never called at module or metadata scope", () => {
    const beforeComponent = page.slice(0, page.indexOf("export default async function"));
    const calls = beforeComponent.match(/getPublicVacancyById\(/g) ?? [];
    expect(calls, "member reader called outside the component").toHaveLength(0);
  });

  it("the outbound application link cannot leak the referrer or opener", () => {
    expect(page).toMatch(/rel="noopener noreferrer nofollow"/);
  });
});

describe("the member read is authorised by the database, not the component", () => {
  const reader = read("lib/vacancy-store/vacancy-read.ts");
  const body = reader.slice(reader.indexOf("export async function getPublicVacancyById"));

  it("uses the caller's own client — no SECURITY DEFINER, no service role", () => {
    const fn = body.slice(0, body.indexOf("\n}"));
    expect(fn).not.toMatch(/service_role|SERVICE_ROLE|rpc\(/);
  });

  it("applies the same liveness rule as the anonymous projection", () => {
    const fn = body.slice(0, body.indexOf("\n}"));
    expect(fn).toContain('.eq("is_active", true)');
    expect(fn).toContain("expires_at.is.null,expires_at.gt.");
  });
});

describe("no raw English leaks into a declared locale", () => {
  const page = read(PAGE);
  const blocks = [...page.matchAll(/const (\w+): L = \{([\s\S]*?)\};/g)];

  it("finds the locale string blocks", () => {
    expect(blocks.length).toBeGreaterThan(10);
  });

  for (const [, name, body] of blocks) {
    it(`${name} is translated in every active locale`, () => {
      const values = Object.fromEntries(
        [...body.matchAll(/(\w+):\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]]),
      );
      for (const locale of ["lt", "ru", "nl", "de"]) {
        expect(values[locale], `${name}.${locale} missing`).toBeTruthy();
        expect(
          values[locale],
          `${name}.${locale} is byte-identical to English`,
        ).not.toBe(values.en);
      }
    });
  }
});
