/**
 * Guard: the two entry points a student and an education institution depend
 * on (owner instruction 2026-11-14, five user groups).
 *
 * 1. STUDENT — "search for practice". Internship / apprenticeship are
 *    canonical opportunity types and the board already parsed and applied
 *    `?opportunityType=…`, but it rendered no control for it and no locale
 *    carried the filter's heading: a student could narrow the board only by
 *    typing the address, and the "no results for these filters" sentence
 *    named the filter by a missing key. Pinned here: every filter dimension
 *    has a heading in every locale, and the board renders the type group.
 *
 * 2. INSTITUTION — "register as an organisation". The setup action reported
 *    the training-provider capability as declared without reading the
 *    declaration's answer, so a refused declaration hid the hint and left the
 *    new institution in a workspace without its education home.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EMPTY_DISCOVERY_FILTERS } from "@/lib/opportunities/discovery-filters";

const web = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BOARD = "app/[locale]/dashboard/opportunities/page.tsx";
const SETUP_ACTION = "lib/company/setup-actions.ts";
const SETUP_FORM = "components/app/company-setup-form.tsx";

describe("student: the board can be narrowed to internships", () => {
  const locales = readdirSync(resolve(web, "messages")).filter((f) => f.endsWith(".json"));

  it("every filter dimension has a heading in every locale file", () => {
    expect(locales.length).toBeGreaterThanOrEqual(6);
    const missing: string[] = [];
    for (const file of locales) {
      const filters = JSON.parse(read(`messages/${file}`)).opportunities?.discovery?.filters ?? {};
      for (const dim of Object.keys(EMPTY_DISCOVERY_FILTERS)) {
        if (typeof filters[dim] !== "string" || filters[dim].trim() === "") missing.push(`${file}:${dim}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the board renders a group for every filter dimension, the opportunity type included", () => {
    const src = strip(read(BOARD));
    const groups = src.slice(src.indexOf("const facetGroups"), src.indexOf("const showFilterControls"));
    for (const dim of Object.keys(EMPTY_DISCOVERY_FILTERS)) {
      expect(groups, `facet group for ${dim}`).toContain(`dim: "${dim}"`);
    }
    // The active value stays listed, so the filter can always be switched off.
    expect(groups).toMatch(/withValues\(facets\.opportunityTypes, \[\], filters\.opportunityType\)/);
  });
});

describe("institution: the capability is declared only when the declaration says so", () => {
  it("the setup action reads the declaration's answer", () => {
    const src = strip(read(SETUP_ACTION));
    expect(src).toMatch(/const declared = await declareOrganizationCapabilities\(orgId, \[capability\]\);/);
    expect(src).toMatch(/capabilityDeclared = declared\.ok;/);
    expect(src).not.toMatch(/capabilityDeclared = true;/);
  });

  it("after a confirmed declaration the next door is the education home", () => {
    const src = strip(read(SETUP_FORM));
    expect(src).toMatch(
      /const educationHome =\s*presetCapability === "training_provider" && state\?\.ok === true && state\.capabilityDeclared === true;/,
    );
    expect(src).toMatch(/href=\{educationHome \? "\/dashboard\/company\/education" : "\/dashboard\/company"\}/);
  });
});
