/**
 * Worker intake model — validation, AI-input mapping, and a full intake → mock
 * draft run (no server-only, no key, no network).
 */
import { describe, it, expect } from "vitest";
import {
  workerIntakeSchema,
  buildWorkerProfileAgentInput,
  PROFESSION_DIRECTIONS,
  WORKER_ENGAGEMENT_TYPES,
} from "./worker-intake";
import { workerProfileInputSchema } from "../ai/registry/agents/worker-profile";
import { workerProfileEntry } from "../ai/registry/agents/worker-profile";
import { runAiAgentCore } from "../ai/run-agent";
import { resolveAiRuntimeConfig } from "../ai/runtime/config-core";

const MOCK = resolveAiRuntimeConfig({
  mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: undefined,
});

const baseIntake = {
  fullName: "Jonas Petraitis",
  phone: "+37060000000",
  currentCountry: "LT",
  targetCountries: ["NL", "DE"],
  profession: "tiler",
  experienceYears: 5,
  availableFrom: "2026-07-01",
  languages: ["lt", "en"],
  worksWith: "solo",
  engagementType: "employee",
  documents: ["passport"],
  comment: "Klojau plyteles 5 metus, dirbu su klijais ir hidroizoliacija.",
};

describe("workerIntakeSchema", () => {
  it("parses a full intake and applies defaults", () => {
    const r = workerIntakeSchema.safeParse(baseIntake);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.transport).toBe("none"); // default
      expect(r.data.accommodation).toBe("needs_accommodation"); // default
      expect(r.data.contractPreference).toBe("any"); // default
      expect(r.data.hasCv).toBe(false);
    }
  });

  it("rejects unknown fields (strict) and a bad email", () => {
    expect(workerIntakeSchema.safeParse({ ...baseIntake, verified: true }).success).toBe(false);
    expect(workerIntakeSchema.safeParse({ ...baseIntake, email: "not-an-email" }).success).toBe(false);
  });

  it("requires a full name + profession", () => {
    expect(workerIntakeSchema.safeParse({ ...baseIntake, fullName: "" }).success).toBe(false);
    expect(workerIntakeSchema.safeParse({ ...baseIntake, profession: "" }).success).toBe(false);
  });

  it("exposes starter professions + worker segments (no hardcoded UI enums)", () => {
    expect(PROFESSION_DIRECTIONS.length).toBeGreaterThan(10);
    expect(PROFESSION_DIRECTIONS).toContain("tiler");
    expect(WORKER_ENGAGEMENT_TYPES).toContain("zzp_self_employed");
    expect(WORKER_ENGAGEMENT_TYPES).toContain("brigade");
  });
});

describe("buildWorkerProfileAgentInput", () => {
  it("maps intake to a valid worker_profile agent input (self-declared only)", () => {
    const intake = workerIntakeSchema.parse(baseIntake);
    const agentInput = buildWorkerProfileAgentInput(intake);
    // It must validate against the agent's own strict input schema.
    expect(workerProfileInputSchema.safeParse(agentInput).success).toBe(true);
    expect(agentInput.selectedCountries).toEqual(["NL", "DE"]);
    // No fact-asserting field is introduced by the mapping.
    expect(JSON.stringify(agentInput)).not.toMatch(/verified|confirmed/i);
  });
});

describe("intake → AI draft (mock pipeline, end-to-end)", () => {
  it("produces a labelled suggestion the worker can review", async () => {
    const intake = workerIntakeSchema.parse(baseIntake);
    const agentInput = buildWorkerProfileAgentInput(intake);
    const mockDraft = {
      suggestion: true,
      agent: "worker_profile",
      confidence: "medium",
      evidence_refs: [{ source: "worker_bio", ref: "intake" }],
      missing_information: ["pageidaujama vietovė"],
      needs_human_review: true,
      blocked_claims: [],
      data: {
        suggested_headline: "Plytelių klojėjas",
        suggested_skill_claims: ["plytelių klojimas"],
        suggested_roles: ["Plytelių klojėjas"],
        experience_categories: ["statybų apdaila"],
        missing_profile_fields: ["el. paštas"],
        country_readiness_questions: ["Ar turite galiojantį pasą?"],
      },
    };
    const out = await runAiAgentCore(workerProfileEntry, agentInput, MOCK, {
      locale: "lt", mock: mockDraft,
    });
    expect(out.status).toBe("suggestion");
    if (out.status === "suggestion") {
      const v = out.value as { suggestion: boolean; needs_human_review: boolean };
      expect(v.suggestion).toBe(true);
      expect(v.needs_human_review).toBe(true);
    }
  });

  it("returns disabled when the runtime is off (prod default) — no draft fabricated", async () => {
    const off = resolveAiRuntimeConfig({
      mode: undefined, provider: undefined, apiKey: undefined, model: undefined,
      timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
      dailyRunBudget: undefined,
    });
    const intake = workerIntakeSchema.parse(baseIntake);
    const out = await runAiAgentCore(
      workerProfileEntry,
      buildWorkerProfileAgentInput(intake),
      off,
      { locale: "lt" },
    );
    expect(out.status).toBe("disabled");
  });
});

describe("ZZP / brigade details (optional, PR5)", () => {
  it("a brigade intake parses with team/business details (defaults when omitted)", () => {
    const base = workerIntakeSchema.parse({
      fullName: "Brigada UAB",
      profession: "tiler",
      engagementType: "brigade",
      worksWith: "brigade",
    });
    expect(base.teamProfessions).toEqual([]);
    expect(base.tools).toEqual([]);
    expect(base.invoiceReady).toBe(false);
    expect(base.businessName).toBeUndefined();

    const zzp = workerIntakeSchema.parse({
      fullName: "Jonas",
      profession: "tiler",
      engagementType: "zzp_self_employed",
      businessName: "Jonas Tiling",
      vatNumber: "LT123456789",
      teamSize: 3,
      teamProfessions: ["tiler", "plasterer"],
      tools: ["tile cutter", "mixer"],
      insurance: "liability cover",
      invoiceReady: true,
    });
    expect(zzp.businessName).toBe("Jonas Tiling");
    expect(zzp.teamSize).toBe(3);
    expect(zzp.teamProfessions).toEqual(["tiler", "plasterer"]);
    expect(zzp.invoiceReady).toBe(true);
  });

  it("rejects an out-of-range team size", () => {
    expect(
      workerIntakeSchema.safeParse({
        fullName: "X",
        profession: "tiler",
        teamSize: 0,
      }).success,
    ).toBe(false);
  });
});
