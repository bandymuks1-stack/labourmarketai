/**
 * Company need model — validation, AI-input mapping, full need → mock draft.
 * No server-only, no key, no network.
 */
import { describe, it, expect } from "vitest";
import {
  companyNeedSchema,
  buildCompanyNeedAgentInput,
  ENGAGEMENT_MODELS,
  ACCOMMODATION_OFFERS,
} from "./company-need";
import { companyNeedInputSchema, companyNeedEntry } from "../ai/registry/agents/company-need";
import { runAiAgentCore } from "../ai/run-agent";
import { resolveAiRuntimeConfig } from "../ai/runtime/config-core";

const MOCK = resolveAiRuntimeConfig({
  mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: undefined,
});

const baseNeed = {
  companyName: "BouwNL B.V.",
  contactPerson: "Jan",
  country: "NL",
  cityRegion: "Rotterdam",
  profession: "tiler",
  numberOfWorkers: 3,
  teamShape: "team",
  startDate: "2026-07-15",
  expectedDuration: "3 months",
  engagementModel: "subcontracting",
  accommodationOffer: "provided_deducted",
  transportProvided: true,
  languageRequirements: ["en"],
  requiredDocuments: ["A1 certificate"],
  description: "We need 3 tilers for a renovation project near Rotterdam.",
};

describe("companyNeedSchema", () => {
  it("parses a full need and applies defaults", () => {
    const r = companyNeedSchema.safeParse(baseNeed);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.urgency).toBe("flexible");
      expect(r.data.acceptsNonEnglish).toBe(true);
    }
  });

  it("requires company name, country, profession, description", () => {
    expect(companyNeedSchema.safeParse({ ...baseNeed, companyName: "" }).success).toBe(false);
    expect(companyNeedSchema.safeParse({ ...baseNeed, country: "Netherlands" }).success).toBe(false);
    expect(companyNeedSchema.safeParse({ ...baseNeed, description: "" }).success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    expect(companyNeedSchema.safeParse({ ...baseNeed, legally_ready: true }).success).toBe(false);
  });

  it("exposes engagement models + accommodation offers", () => {
    expect(ENGAGEMENT_MODELS).toContain("agency_supply");
    expect(ACCOMMODATION_OFFERS).toContain("provided_deducted");
  });
});

describe("buildCompanyNeedAgentInput", () => {
  it("maps need to a valid company_need agent input (no invented pay)", () => {
    const need = companyNeedSchema.parse(baseNeed);
    const agentInput = buildCompanyNeedAgentInput(need);
    expect(companyNeedInputSchema.safeParse(agentInput).success).toBe(true);
    expect(agentInput.numberOfPeople).toBe(3);
    // the mapping never sends a rate/pay figure to the model.
    expect(JSON.stringify(agentInput)).not.toMatch(/rate|salary|\beur\b/i);
  });
});

describe("need → AI vacancy draft (mock pipeline)", () => {
  it("produces a labelled vacancy suggestion to review before publishing", async () => {
    const need = companyNeedSchema.parse(baseNeed);
    const agentInput = buildCompanyNeedAgentInput(need);
    const mockDraft = {
      suggestion: true,
      agent: "company_need",
      confidence: "medium",
      evidence_refs: [{ source: "company_free_text", ref: "need" }],
      missing_information: [],
      needs_human_review: true,
      blocked_claims: [],
      data: {
        normalized_role: "Tiler",
        required_skills: ["tiling"],
        required_documents: ["A1 certificate"],
        country_readiness_blockers: ["posting registration"],
        missing_fields: [],
        risk_flags: [],
        suggested_public_copy: "Hiring experienced tilers near Rotterdam.",
        internal_matching_criteria: ["tiling experience", "available from 2026-07-15"],
      },
    };
    const out = await runAiAgentCore(companyNeedEntry, agentInput, MOCK, {
      locale: "en", mock: mockDraft,
    });
    expect(out.status).toBe("suggestion");
    if (out.status === "suggestion") {
      const v = out.value as { needs_human_review: boolean };
      expect(v.needs_human_review).toBe(true);
    }
  });

  it("fabricates no draft when the runtime is off", async () => {
    const off = resolveAiRuntimeConfig({
      mode: undefined, provider: undefined, apiKey: undefined, model: undefined,
      timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
      dailyRunBudget: undefined,
    });
    const need = companyNeedSchema.parse(baseNeed);
    const out = await runAiAgentCore(companyNeedEntry, buildCompanyNeedAgentInput(need), off, {
      locale: "en",
    });
    expect(out.status).toBe("disabled");
  });
});
