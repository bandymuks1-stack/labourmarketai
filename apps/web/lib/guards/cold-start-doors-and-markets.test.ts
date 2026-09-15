import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENCY_DOOR_NEXT,
  INSTITUTION_DOOR_NEXT,
  STARTING_CONTEXTS,
} from "@/lib/marketing/public-doors";
import {
  doorIntentsFromReturnPath,
  readLandingHandoff,
} from "@/lib/onboarding/landing-handoff";
import { nextPathForIntents } from "@/lib/onboarding/first-run-intent";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import { READINESS_COUNTRIES } from "@/lib/country-readiness/types";
import { coverageCountryCount } from "@/lib/market-map/public-coverage";

/**
 * COLD START — what the landing promises, and what the very next click can do.
 *
 * Owner readiness window, 2026-09-09. The directive's §32 test is whether a
 * real worker, employer, agency or institution can arrive with no one beside
 * them and reach a meaningful action. Walked on production today, two of the
 * four doors failed that test in the same way — the landing made a claim and
 * the first real surface behind it could not honour the claim (§33's
 * release-defect class, "landing says capability exists but the surface
 * cannot reach it").
 *
 *   1. THE AGENCY DOOR WAS UNNAMED. The institution's door was named in
 *      window 6 (gap G-C1) so a lecturer would not have to guess which
 *      first-run card was theirs. The agency's door was left pointing at a
 *      BARE `/auth/signup`, so a staffing agency that had just told us what
 *      it was, by choosing that door, had to say it again — and the nearest
 *      wrong answer on that screen ("hire") produces a plain employer, not a
 *      `company_type = 'staffing_agency'`. That is SEP-4/DEMAND≠SUPPLY
 *      arriving through onboarding.
 *
 *   2. THE EMPLOYER'S FORM KNEW TEN OF SEVENTEEN MARKETS. The map band names
 *      17 markets, Belgium/France/Spain/Austria/Switzerland/Georgia/US among
 *      them. `/company-need` — the employer door, one click later — offered
 *      `READINESS_COUNTRIES`, which answers a different question (where
 *      researched document guidance exists). A company in seven of the named
 *      markets could not say where it needed people.
 *
 * Both fixes are derivations, not new tables: the agency door reads the same
 * router the institution door reads, and the form reads the same market set
 * the signed-in company workspace already read.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const needPage = read("app", "[locale]", "(marketing)", "company-need", "page.tsx");

describe("1. the agency door carries the context the visitor already chose", () => {
  const agency = STARTING_CONTEXTS.find((c) => c.key === "agency");

  it("the door exists and is a starting context, not a partner enquiry", () => {
    expect(agency, "the agency starting context disappeared").toBeDefined();
  });

  it("its destination is DERIVED from the first-run router, never retyped", () => {
    expect(AGENCY_DOOR_NEXT).toBe(nextPathForIntents(["agency"]));
    // And what that router actually produces: the ONE canonical organisation
    // setup with the agency company TYPE pre-selected. An agency is a company
    // type, never a root role (first-run-intent.ts) — so if this ever routes
    // to a separate agency product, this pin fails.
    expect(AGENCY_DOOR_NEXT).toContain("/dashboard/start/company");
    expect(AGENCY_DOOR_NEXT).toContain("staffing_agency");
  });

  it("the href carries it through signup", () => {
    expect(agency!.href).toBe(
      `/auth/signup?next=${encodeURIComponent(AGENCY_DOOR_NEXT)}`,
    );
  });

  it("onboarding reads the door BACK as the agency intent — the round trip", () => {
    // This is the assertion that would have caught the original defect: not
    // "the link changed" but "the far end understands it".
    expect(doorIntentsFromReturnPath(AGENCY_DOOR_NEXT)).toEqual(["agency"]);
    expect(readLandingHandoff(AGENCY_DOOR_NEXT).intents).toEqual(["agency"]);
    // Locale-prefixed, as the browser actually sends it.
    expect(doorIntentsFromReturnPath(`/lt${AGENCY_DOOR_NEXT}`)).toEqual(["agency"]);
  });

  /** NEGATIVE CONTROL — the nearest opposite meaning (§28, SEP-4).
   *  An agency door that resolved to `hire` would look identical in the UI
   *  and would silently make a plain employer out of a supplier. */
  it("the agency door is NOT read as a plain employer, and vice versa", () => {
    expect(doorIntentsFromReturnPath(AGENCY_DOOR_NEXT)).not.toContain("hire");
    expect(doorIntentsFromReturnPath(AGENCY_DOOR_NEXT)).not.toContain("education");
    // The institution's door must not have been collapsed into the agency's
    // while making them symmetric.
    expect(AGENCY_DOOR_NEXT).not.toBe(INSTITUTION_DOOR_NEXT);
    expect(doorIntentsFromReturnPath(INSTITUTION_DOOR_NEXT)).toEqual(["education"]);
    // A bare signup is not a door: nothing may be pre-ticked from it.
    expect(doorIntentsFromReturnPath("/auth/signup")).toEqual([]);
  });

  /**
   * THE WHOLE PATH, not just the landing tile. `/for-agencies` is the page
   * the landing's own "I represent an agency" learn-more link points at, and
   * its two CTAs read "Create an AGENCY account" — then dropped the visitor
   * at the same bare signup. A door is only named if every entrance to it is.
   */
  it("the /for-agencies page's CTAs carry the same destination", () => {
    const p = read(
      "app", "[locale]", "(marketing)", "for-agencies", "page.tsx",
    );
    expect(p).toContain("AGENCY_DOOR_NEXT");
    // Both of them — the hero and the closing band.
    expect(p.match(/ctaNext=\{AGENCY_DOOR_NEXT\}/g)?.length).toBe(2);
    // Derived from the registry, never a literal path retyped on the page.
    expect(p).not.toMatch(/ctaNext="\/dashboard/);
  });

  it("the worker and employer doors are untouched", () => {
    const worker = STARTING_CONTEXTS.find((c) => c.key === "worker");
    const employer = STARTING_CONTEXTS.find((c) => c.key === "employer");
    expect(worker!.href).toBe("/auth/signup");
    expect(employer!.href).toBe("/company-need");
  });
});

describe("2. the employer's first form knows every market the landing names", () => {
  it("it reads the canonical market set, not the readiness set", () => {
    expect(needPage).toContain("MARKET_COUNTRIES");
    expect(needPage).not.toMatch(/READINESS_COUNTRIES\.map/);
  });

  it("the country labels come from the shared catalogue that has all of them", () => {
    // `companyNeed.countries` carries only the ten; reading it for the other
    // seven would print raw message keys at a visitor (the leak class from
    // `raw-message-key-leak-class`).
    expect(needPage).toContain('tCountries(`countryNames.${code}`)');
    expect(needPage).not.toMatch(/t\(`countries\.\$\{code\}`\)/);
  });

  it("every market the map band draws can be chosen in the form", () => {
    // The two numbers the visitor sees one click apart. This is the whole
    // defect, stated as one assertion.
    expect(MARKET_COUNTRIES.length).toBe(coverageCountryCount());
  });

  /** NEGATIVE CONTROL — the two lists must stay DIFFERENT questions (§28).
   *  Widening the form must not have been done by widening readiness, which
   *  would have invented legal guidance for seven countries nobody
   *  researched. `READINESS_COUNTRIES` is a strict subset and stays one. */
  it("researched-guidance countries were NOT invented to match the markets", () => {
    expect(READINESS_COUNTRIES.length).toBe(10);
    expect(READINESS_COUNTRIES.length).toBeLessThan(MARKET_COUNTRIES.length);
    for (const c of READINESS_COUNTRIES) {
      expect(MARKET_COUNTRIES as readonly string[]).toContain(c);
    }
  });
});
