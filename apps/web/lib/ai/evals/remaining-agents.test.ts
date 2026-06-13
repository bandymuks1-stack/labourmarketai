/**
 * Evals for the remaining 7 agents (document_assistant, company_need,
 * matching_explanation, booking_risk, admin_risk, support_onboarding,
 * translation_copy) through the mock pipeline. Valid outputs validate; key
 * structural safety negatives (out-of-enum start_readiness / severity) reject.
 * No env, key, or network.
 */
import { describe, it, expect } from "vitest";
import { runAgentEval, type AgentEvalCase } from "./harness";
import type { PromptRegistryEntry } from "../registry/types";
import { documentAssistantEntry } from "../registry/agents/document-assistant";
import { companyNeedEntry } from "../registry/agents/company-need";
import { matchingExplanationEntry } from "../registry/agents/matching-explanation";
import { bookingRiskEntry } from "../registry/agents/booking-risk";
import { adminRiskEntry } from "../registry/agents/admin-risk";
import { supportOnboardingEntry } from "../registry/agents/support-onboarding";
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
    entry: documentAssistantEntry,
    c: {
      name: "document_assistant valid",
      locale: "en",
      input: { documentChecklist: ["passport", "A1"], countryTarget: "NL" },
      mock: envelope("document_assistant", {
        missing_documents: ["A1 certificate"],
        expiring_soon: ["passport"],
        needs_verification: ["work permit"],
        worker_explanation: "You still need an A1 certificate.",
        admin_notes_suggestion: "Request A1 before start.",
      }),
      expect: { status: "suggestion" },
    },
  },
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
    entry: bookingRiskEntry,
    c: {
      name: "booking_risk valid (not_ready honest)",
      locale: "en",
      input: { bookingDates: "2026-06-01..2026-06-05" },
      mock: envelope("booking_risk", {
        risk_flags: ["overlaps an existing booking"],
        conflict_warnings: ["June 1-5 conflict"],
        missing_documents: ["A1"],
        start_readiness: "not_ready",
        suggested_next_action: "Resolve the conflict first.",
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: bookingRiskEntry,
    c: {
      name: "SAFETY: booking_risk 'safe' start_readiness → rejected (out of enum)",
      locale: "en",
      input: { bookingDates: "2026-06-01..2026-06-05" },
      mock: envelope("booking_risk", {
        risk_flags: [],
        conflict_warnings: [],
        missing_documents: [],
        start_readiness: "safe",
        suggested_next_action: null,
      }),
      expect: { status: "needs_review", reason: "schema_rejected" },
    },
  },
  {
    entry: adminRiskEntry,
    c: {
      name: "admin_risk valid",
      locale: "en",
      input: { workersMissingDocs: ["worker:123 missing A1"] },
      mock: envelope("admin_risk", {
        queue: [
          {
            item_ref: "worker:123",
            risk_reason: "missing required documents",
            suggested_admin_action: "request documents",
            severity: "high",
          },
        ],
      }),
      expect: { status: "suggestion" },
    },
  },
  {
    entry: adminRiskEntry,
    c: {
      name: "SAFETY: admin_risk 'critical' severity → rejected (out of enum)",
      locale: "en",
      input: { workersMissingDocs: ["x"] },
      mock: envelope("admin_risk", {
        queue: [
          { item_ref: "w:1", risk_reason: "x", suggested_admin_action: "y", severity: "critical" },
        ],
      }),
      expect: { status: "needs_review", reason: "schema_rejected" },
    },
  },
  {
    entry: supportOnboardingEntry,
    c: {
      name: "support_onboarding valid",
      locale: "lt",
      input: { userRole: "worker", profileCompletion: "60%" },
      mock: envelope("support_onboarding", {
        top_next_action: "Užbaikite profilį",
        short_explanation: "Pridėkite kontaktinį telefoną.",
        cta_suggestion: "Atidaryti profilį",
        missing_info: ["telefonas"],
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

describe("remaining 7 agents — evals", () => {
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
