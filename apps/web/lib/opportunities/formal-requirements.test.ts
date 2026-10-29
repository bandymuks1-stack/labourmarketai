import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { formalRequirementsFor } from "./formal-requirements";
import type { StructuredDemandV2 } from "@/lib/demand/structured-demand-v2";

const licenceNeed = { transport: { licence_categories: ["C"] } } as unknown as StructuredDemandV2;

describe("formalRequirementsFor — the formal layer, apart from skill fit (SEP-6)", () => {
  it("a need requiring a licence shows it as a missing formal requirement when none is stated", () => {
    expect(
      formalRequirementsFor({ structuredV2: licenceNeed, professionSlug: "driver", statedLicenceCategories: null }),
    ).toEqual([{ kind: "driving_licence", categories: ["C"], standing: "missing_requirement" }]);
  });

  it("a stated licence that does not cover the category is still missing", () => {
    expect(
      formalRequirementsFor({ structuredV2: licenceNeed, professionSlug: null, statedLicenceCategories: ["B"] })[0]?.standing,
    ).toBe("missing_requirement");
  });

  it("a stated licence that covers it reads 'stated', never 'verified'", () => {
    expect(
      formalRequirementsFor({ structuredV2: licenceNeed, professionSlug: null, statedLicenceCategories: ["b", "c"] })[0]?.standing,
    ).toBe("stated_held");
  });

  it("a commonly regulated profession carries a qualification requirement that recorded work cannot meet", () => {
    expect(formalRequirementsFor({ structuredV2: null, professionSlug: "electrician", statedLicenceCategories: null })).toEqual([
      { kind: "professional_qualification", professionSlug: "electrician", standing: "missing_requirement" },
    ]);
    expect(formalRequirementsFor({ structuredV2: null, professionSlug: "tiler", statedLicenceCategories: null })).toEqual([]);
  });

  it("is structurally unable to read work evidence (no skills / journal / hours input)", () => {
    const src = readFileSync(join(__dirname, "formal-requirements.ts"), "utf8");
    const iface = src.slice(src.indexOf("export interface FormalRequirementInput"), src.indexOf("export function formalRequirementsFor"));
    expect(iface).not.toMatch(/skill|journal|hours|evidence|recogni/i);
  });
});
