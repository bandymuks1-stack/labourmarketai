/**
 * Evals for the remaining agents (company_need, matching_explanation,
 * translation_copy) through the mock pipeline. Valid outputs validate. No env,
 * key, or network.
 *
 * document_assistant, booking_risk, admin_risk and support_onboarding were
 * RETIRED on 2026-10-25 (owner decision, registry row 10.11 — each duplicated a
 * connected deterministic answer; see docs/ai/INTERNAL_LLM_AGENTS_V1.md §4.1),
 * and their evals went with them.
 */
import { describe, it, expect } from "vitest";
import { runAgentEval, type AgentEvalCase } from "./harness";
import type { PromptRegistryEntry } from "../registry/types";
import { companyNeedEntry } from "../registry/agents/company-need";
import { matchingExplanationEntry } from "../registry/agents/matching-explanation";
import { translationCopyEntry } from "../registry/agents/translation-copy";

function envelope(agent: string, data: unknown, evidence = true) {
  return {
    suggestion: true,
    agent,
    confidence: "medium",
    evidence_refs: evidence ? [{ source: "canonical", ref: "row_1" }] : [],
    missing_information: [],
    needs_human_review: true,
    blocked_claims: [],
    data,
  };
}

const cases: { entry: PromptRegistryEntry; c: AgentEvalCase }[] = [
  {
    entry: companyNeedEntry,
    c: {
      name: "company_need valid",
      locale: "en",
      input: { companyFreeText: "Need 3 tilers in NL for 2 months." },
      mock: envelope("company_need", {
        normalized_role: "Tiler",
        required_skills: ["tiling"],
        required_documents: ["A1 certificate"],
        country_readiness_blockers: ["posting registration"],
        missing_fields: ["start date"],
        risk_flags: [],
        suggested_public_copy: "We are hiring experienced tilers.",
        internal_matching_criteria: ["tiling experience"],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: matchingExplanationEntry,
    c: {
      name: "matching_explanation valid (blocker not hidden)",
      locale: "en",
      input: { workerSkills: ["tiling"], companyNeed: "Need a tiler in NL." },
      mock: envelope("matching_explanation", {
        fit_summary: "Good skill match, one document gap.",
        strong_matches: ["tiling skill"],
        gaps: ["language evidence"],
        blockers: ["missing A1 certificate"],
        suggested_next_action: "Upload A1 certificate.",
        explanation_company: "Strong on skills; one readiness gap.",
        explanation_worker: "Upload your A1 to be ready.",
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: translationCopyEntry,
    c: {
      name: "translation_copy valid",
      locale: "ru",
      input: { canonicalMessage: "Upload your A1 certificate.", locale: "ru" },
      mock: envelope("translation_copy", {
        localized_copy: "Загрузите справку A1.",
        plain_language_version: "Нужна справка A1.",
        wording_warnings: [],
      }),
      expect: { status: "suggestion" },
    },
  },
];

describe("remaining agents — evals", () => {
  it.each(cases.map(({ entry, c }) => [c.name, entry, c] as const))(
    "%s",
    async (_name, entry, c) => {
      const out = await runAgentEval(entry, c);
      expect(out.status).toBe(c.expect.status);
      if (c.expect.status === "needs_review" && out.status === "needs_review" && c.expect.reason) {
        expect(out.reason).toBe(c.expect.reason);
      }
      if (out.status === "suggestion") {
        const v = out.value as { suggestion: boolean; agent: string };
        expect(v.suggestion).toBe(true);
        expect(v.agent).toBe(entry.agent);
      }
    },
  );
});
