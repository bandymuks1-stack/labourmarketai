/**
 * Match preview core — honest deterministic score + matching_explanation input,
 * exercised through the mock agent. No DB, no key, no network, no persistence.
 */
import { describe, it, expect } from "vitest";
import { workerIntakeSchema } from "./worker-intake";
import { companyNeedSchema } from "./company-need";
import {
  matchFitScore,
  buildMatchPreview,
  buildMatchingExplanationInput,
} from "./match-preview";
import {
  matchingExplanationInputSchema,
  matchingExplanationEntry,
} from "../ai/registry/agents/matching-explanation";
import { runAiAgentCore } from "../ai/run-agent";
import { resolveAiRuntimeConfig } from "../ai/runtime/config-core";

const MOCK = resolveAiRuntimeConfig({
  mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: undefined,
});

const worker = workerIntakeSchema.parse({
  fullName: "preview",
  profession: "tiler",
  availableFrom: "2026-07-01",
  accommodation: "needs_accommodation",
  transport: "has_transport",
  languages: ["en"],
});

const fittingNeed = companyNeedSchema.parse({
  companyName: "preview",
  country: "NL",
  profession: "tiler",
  startDate: "2026-07-15",
  accommodationOffer: "provided_free",
  transportProvided: false,
  languageRequirements: ["en"],
  description: "preview",
});

const clashingNeed = companyNeedSchema.parse({
  companyName: "preview",
  country: "NL",
  profession: "welder",
  startDate: "2026-06-01",
  accommodationOffer: "not_provided",
  transportProvided: false,
  languageRequirements: ["nl"],
  acceptsNonEnglish: false,
  description: "preview",
});

describe("matchFitScore (honest dimension count, not a fake score)", () => {
  it("counts all five dimensions as fit when everything aligns", () => {
    const s = matchFitScore(buildMatchPreview(worker, fittingNeed).fit);
    expect(s.total).toBe(5);
    expect(s.fit).toBe(5);
    expect(s.mismatch).toBe(0);
  });

  it("surfaces mismatches as blockers, never hidden", () => {
    const p = buildMatchPreview(worker, clashingNeed);
    expect(p.score.mismatch).toBeGreaterThan(0);
    expect(p.blockers.length).toBe(p.score.mismatch);
    // profession + accommodation + start-date + language all clash here.
    expect(p.blockers.join(" ")).toMatch(/welder|accommodation|start|language/i);
  });
});

describe("buildMatchingExplanationInput", () => {
  it("produces a valid matching_explanation agent input", () => {
    const fit = buildMatchPreview(worker, fittingNeed).fit;
    const input = buildMatchingExplanationInput(worker, fittingNeed, fit);
    expect(matchingExplanationInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("preview → matching_explanation (mock, non-persisted)", () => {
  it("returns a labelled fit explanation suggestion", async () => {
    const fit = buildMatchPreview(worker, fittingNeed).fit;
    const input = buildMatchingExplanationInput(worker, fittingNeed, fit);
    const mock = {
      suggestion: true,
      agent: "matching_explanation",
      confidence: "medium",
      evidence_refs: [{ source: "worker_skills", ref: "preview" }],
      missing_information: [],
      needs_human_review: true,
      blocked_claims: [],
      data: {
        fit_summary: "Strong trade and logistics fit; review readiness before booking.",
        strong_matches: ["tiling trade"],
        gaps: [],
        blockers: [],
        suggested_next_action: "Confirm documents.",
        explanation_company: "Good fit on paper.",
        explanation_worker: "You match this need.",
      },
    };
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock,
    });
    expect(out.status).toBe("suggestion");
    if (out.status === "suggestion") {
      const v = out.value as { data: { fit_summary: string } };
      expect(v.data.fit_summary).toMatch(/fit/i);
    }
  });

  it("fabricates no explanation when the runtime is off", async () => {
    const off = resolveAiRuntimeConfig({
      mode: undefined, provider: undefined, apiKey: undefined, model: undefined,
      timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
      dailyRunBudget: undefined,
    });
    const fit = buildMatchPreview(worker, fittingNeed).fit;
    const out = await runAiAgentCore(
      matchingExplanationEntry,
      buildMatchingExplanationInput(worker, fittingNeed, fit),
      off,
      { locale: "en" },
    );
    expect(out.status).toBe("disabled");
  });
});
