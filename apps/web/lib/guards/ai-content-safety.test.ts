/**
 * Guard — AI CONTENT SAFETY (Internal LLM Agents v1).
 *
 * The six doctrine content guards, encoded as structural assertions over the
 * agent registry so they survive every refactor (the agents are inert without a
 * provider key, so this checks the DEFINITIONS — schemas, prompts, allowed
 * fields — not live output):
 *   1. no-ai-verifies-skills      — no "verified/confirmed" field or level.
 *   2. no-ai-verifies-documents   — document agent never carries verification.
 *   3. no-ai-legal-guarantee      — legal/guarantee fields forbidden; prompts ban it.
 *   4. no-unsourced-country-answer — country output requires ≥1 evidence_ref.
 *   5. no-private-document-leak    — no agent INPUT/OUTPUT carries raw doc content.
 *   6. no-ai-live-payment-claim    — support/translation agents ban pay/checkout.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { AI_PROMPT_REGISTRY, ALL_AGENT_KEYS } from "../ai/registry/registry";
import { FORBIDDEN_DATA_FIELDS } from "../ai/schemas/envelope";
import { SKILL_EVIDENCE_LEVELS } from "../ai/registry/agents/skill-evidence";
import { countryReadinessOutputSchema } from "../ai/registry/agents/country-readiness";

const entries = ALL_AGENT_KEYS.map((k) => {
  const e = AI_PROMPT_REGISTRY[k];
  if (!e) throw new Error(`agent ${k} not registered`);
  return e;
});

/** Top-level keys of a ZodObject schema (best-effort). */
function objectKeys(schema: z.ZodTypeAny): string[] {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

// Field names that would carry raw document/file CONTENT (forbidden everywhere —
// there is no extraction pipeline; AI sees metadata only).
const CONTENT_FIELD = /content|filebytes|filedata|rawfile|documenttext|ocr|base64|binary/i;

describe("AI content safety (structural, over the registry)", () => {
  it("covers all eleven agents", () => {
    expect(entries.length).toBe(11);
  });

  // 1 — no AI verifies skills.
  it("no-ai-verifies-skills: 'verified'/'confirmed' are forbidden data fields, and skill levels exclude confirmed", () => {
    expect(FORBIDDEN_DATA_FIELDS).toContain("verified");
    expect(FORBIDDEN_DATA_FIELDS).toContain("confirmed");
    expect(SKILL_EVIDENCE_LEVELS as readonly string[]).not.toContain(
      "manager_or_client_confirmed",
    );
    for (const key of ["worker_profile", "skill_evidence"] as const) {
      expect(AI_PROMPT_REGISTRY[key]!.blockedClaims).toContain("verified");
    }
  });

  // 2 — no AI verifies documents.
  it("no-ai-verifies-documents: the document agent bans verification + reads only metadata", () => {
    const doc = AI_PROMPT_REGISTRY.document_assistant!;
    expect(doc.blockedClaims).toContain("verified");
    expect(doc.system.toLowerCase()).toMatch(/never/);
    expect(doc.system.toLowerCase()).toMatch(/verif/);
    // its input carries NO content-bearing field (metadata only).
    for (const k of objectKeys(doc.inputSchema)) {
      expect(CONTENT_FIELD.test(k), `document input field ${k} must not carry content`).toBe(false);
    }
  });

  // 3 — no AI legal guarantee.
  it("no-ai-legal-guarantee: legal/guarantee are forbidden fields; legal-touching agents ban it in-prompt", () => {
    expect(FORBIDDEN_DATA_FIELDS).toContain("legal_guarantee");
    expect(FORBIDDEN_DATA_FIELDS).toContain("guaranteed");
    for (const key of ["country_readiness", "company_need", "translation_copy"] as const) {
      const e = AI_PROMPT_REGISTRY[key]!;
      const haystack = (e.system + " " + e.blockedClaims.join(" ") + " " + e.safetyRules.join(" ")).toLowerCase();
      expect(haystack, `${key} must forbid a legal guarantee`).toMatch(/legal|guarantee/);
    }
  });

  // 4 — no unsourced country answer.
  it("no-unsourced-country-answer: country output is invalid with zero evidence_refs", () => {
    const valid = {
      suggestion: true,
      agent: "country_readiness",
      confidence: "medium",
      evidence_refs: [{ source: "country_source", ref: "nl:2026" }],
      missing_information: [],
      needs_human_review: true,
      blocked_claims: [],
      data: {
        missing_items: ["A1"],
        likely_required_items: [],
        needs_legal_review: true,
        risk_level: "medium",
        explanation_worker: null,
        explanation_company: null,
      },
    };
    expect(countryReadinessOutputSchema.safeParse(valid).success).toBe(true);
    expect(
      countryReadinessOutputSchema.safeParse({ ...valid, evidence_refs: [] }).success,
      "country answer with no evidence_refs must be rejected",
    ).toBe(false);
  });

  // 5 — no private document leak.
  it("no-private-document-leak: no agent input or output carries raw document content", () => {
    for (const e of entries) {
      for (const k of objectKeys(e.inputSchema)) {
        expect(CONTENT_FIELD.test(k), `${e.agent} input field ${k}`).toBe(false);
      }
      // output data keys (envelope.data is a nested object schema)
      const dataSchema = (e.outputSchema as unknown as { shape?: { data?: z.ZodTypeAny } })
        .shape?.data;
      if (dataSchema) {
        for (const k of objectKeys(dataSchema)) {
          expect(CONTENT_FIELD.test(k), `${e.agent} output field ${k}`).toBe(false);
        }
      }
    }
  });

  // 6 — no AI live payment claim.
  it("no-ai-live-payment-claim: support + translation agents ban pay/checkout claims", () => {
    const support = AI_PROMPT_REGISTRY.support_onboarding!;
    const joined = (support.system + " " + support.blockedClaims.join(" ")).toLowerCase();
    expect(joined).toMatch(/pay|checkout/);
    expect(support.system.toLowerCase()).toMatch(/never/);
    expect(AI_PROMPT_REGISTRY.translation_copy!.blockedClaims.join(" ").toLowerCase()).toMatch(
      /pay|guarantee/,
    );
  });
});
