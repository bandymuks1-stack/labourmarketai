import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSafeReturnPath } from "@/lib/auth/redirect";

/**
 * CREATE-CV ACQUISITION INTENT (P1).
 *
 * `/create-cv` is the free-CV acquisition surface. It makes exactly ONE
 * promise — "Create a CV from scratch or import your existing PDF or DOCX …
 * download as PDF — free" — and its own file header has always claimed the CTA
 * "enters the EXISTING auth → onboarding → profile flow".
 *
 * It did not. Both CTAs pointed at a bare `/auth/signup`, so the visitor who
 * arrived to build a CV was signed up and dropped on the generic dashboard
 * with no reference to a CV at all. The whole `?next=` chain that would have
 * carried the intent (`signup-form` → `getSafeReturnPath` → `/onboarding?next=`)
 * was already built and already correct; the acquisition page simply never fed
 * it. This is the "promise made on the marketing surface, lost at the first
 * hop" defect class, and these guards fail RED if it returns.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

const CREATE_CV_PAGE = "app/[locale]/(marketing)/create-cv/page.tsx";
const PAGE_HERO = "components/marketing/page-hero.tsx";

/** The surface that actually mounts the CV import/review chain. */
const IMPORT_SURFACE = "/dashboard/profile";

describe("create-cv CTAs carry the visitor's intent through signup", () => {
  const page = () => read(CREATE_CV_PAGE);

  it("declares the destination once, as a named constant", () => {
    expect(page()).toMatch(
      new RegExp(`const CREATE_CV_NEXT = "${IMPORT_SURFACE}"`),
    );
  });

  it("has NO bare /auth/signup left — every CTA carries ?next=", () => {
    // A bare signup href on THIS page is the defect itself.
    expect(page()).not.toMatch(/href="\/auth\/signup"/);
  });

  it("passes the destination to the hero CTA", () => {
    expect(page()).toContain("ctaNext={CREATE_CV_NEXT}");
  });

  it("passes the SAME destination to the footer CTA (both agree)", () => {
    expect(page()).toContain(
      "href={`/auth/signup?next=${encodeURIComponent(CREATE_CV_NEXT)}`}",
    );
  });

  it("targets the IMPORT surface, not the finished print sheet", () => {
    // `/cv` renders the export-ready CV. A brand-new account sent there sees an
    // empty sheet and no way to fill it — the promise fails on arrival.
    const m = page().match(/const CREATE_CV_NEXT = "([^"]+)"/);
    expect(m?.[1]).toBe(IMPORT_SURFACE);
    expect(m?.[1]).not.toBe("/cv");
  });
});

describe("the destination really survives the auth sanitiser (behavioural)", () => {
  // Not a string assertion — this runs the REAL function the signup form runs.
  it("is accepted rather than silently replaced by the dashboard fallback", () => {
    for (const locale of ["en", "lt", "ru", "de", "nl"]) {
      const resolved = getSafeReturnPath(IMPORT_SURFACE, locale);
      expect(resolved, locale).toBe(`/${locale}${IMPORT_SURFACE}`);
      expect(resolved, locale).not.toBe(`/${locale}/dashboard`);
    }
  });

  it("survives the exact encoded form the CTA emits", () => {
    const emitted = `/auth/signup?next=${encodeURIComponent(IMPORT_SURFACE)}`;
    // What the form reads back out of the query string.
    const roundTripped = new URL(emitted, "https://labourmarket.ai").searchParams.get("next");
    expect(roundTripped).toBe(IMPORT_SURFACE);
    expect(getSafeReturnPath(roundTripped, "en")).toBe(`/en${IMPORT_SURFACE}`);
  });
});

describe("PageHero opts in — no other hero's CTA changed", () => {
  const hero = () => read(PAGE_HERO);

  it("keeps the bare signup href when no destination is given", () => {
    expect(hero()).toContain(': "/auth/signup"');
  });

  it("builds an encoded ?next= only when a destination IS given", () => {
    expect(hero()).toContain(
      "`/auth/signup?next=${encodeURIComponent(ctaNext)}`",
    );
  });

  it("ctaNext is optional, so every existing caller is untouched", () => {
    expect(hero()).toMatch(/ctaNext\?: string/);
  });

  it("create-cv is the ONLY marketing page passing ctaNext", () => {
    // A generic page has no single destination to promise; if another page
    // wants one it must add its own guard rather than inherit this silently.
    const root = join(APP_ROOT, "app", "[locale]", "(marketing)");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? walk(p) : e.name.endsWith(".tsx") ? [p] : [];
      });
    const withCtaNext = walk(root).filter((p) =>
      readFileSync(p, "utf8").includes("ctaNext"),
    );
    expect(withCtaNext).toHaveLength(1);
    expect(withCtaNext[0].replace(/\\/g, "/")).toContain("create-cv/page.tsx");
  });
});
