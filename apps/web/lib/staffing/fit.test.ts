/**
 * Staffing fit engine — deterministic, honest, mismatches never hidden.
 */
import { describe, it, expect } from "vitest";
import { computeStaffingFit } from "./fit";
import { workerIntakeSchema } from "./worker-intake";
import { companyNeedSchema } from "./company-need";

const worker = workerIntakeSchema.parse({
  fullName: "Jonas",
  profession: "tiler",
  targetCountries: ["NL"],
  availableFrom: "2026-07-01",
  transport: "has_transport",
  accommodation: "needs_accommodation",
  languages: ["lt", "en"],
});

const need = companyNeedSchema.parse({
  companyName: "BouwNL",
  country: "NL",
  profession: "tiler",
  startDate: "2026-07-15",
  accommodationOffer: "provided_free",
  transportProvided: false,
  languageRequirements: ["en"],
  description: "Need a tiler.",
});

describe("computeStaffingFit", () => {
  it("fits when trade, accommodation, transport, language and start all align", () => {
    const fit = computeStaffingFit(worker, need);
    expect(fit.noBlockers).toBe(true);
    expect(fit.blockers).toEqual([]);
    expect(fit.dimensions.find((d) => d.dimension === "profession")!.verdict).toBe("fit");
    expect(fit.dimensions.find((d) => d.dimension === "accommodation")!.verdict).toBe("fit");
  });

  it("flags a profession mismatch (never hidden)", () => {
    const w = { ...worker, profession: "welder" };
    const fit = computeStaffingFit(w, need);
    expect(fit.noBlockers).toBe(false);
    expect(fit.blockers.join(" ")).toMatch(/welder/);
  });

  it("flags accommodation mismatch when worker needs it and company provides none", () => {
    const n = { ...need, accommodationOffer: "not_provided" as const };
    const fit = computeStaffingFit(worker, n);
    expect(fit.dimensions.find((d) => d.dimension === "accommodation")!.verdict).toBe("mismatch");
    expect(fit.noBlockers).toBe(false);
  });

  it("flags a language mismatch only when company does not accept non-English", () => {
    const n = { ...need, languageRequirements: ["nl"], acceptsNonEnglish: false };
    const fit = computeStaffingFit(worker, n);
    expect(fit.dimensions.find((d) => d.dimension === "language")!.verdict).toBe("mismatch");
    const nAccepts = { ...need, languageRequirements: ["nl"], acceptsNonEnglish: true };
    const fit2 = computeStaffingFit(worker, nAccepts);
    expect(fit2.dimensions.find((d) => d.dimension === "language")!.verdict).toBe("unknown");
  });

  it("flags a start-date mismatch when the worker is available after the start", () => {
    const w = { ...worker, availableFrom: "2026-08-01" };
    const fit = computeStaffingFit(w, need);
    expect(fit.dimensions.find((d) => d.dimension === "start_date")!.verdict).toBe("mismatch");
  });

  it("returns 'unknown' (not 'fit') when a date is missing — never overstates readiness", () => {
    const w = { ...worker, availableFrom: undefined };
    const fit = computeStaffingFit(w, need);
    expect(fit.dimensions.find((d) => d.dimension === "start_date")!.verdict).toBe("unknown");
  });
});
