/**
 * Guard — AI CONTENT SAFETY (Internal LLM Agents v1).
 *
 * The six doctrine content guards, encoded as structural assertions over the
 * agent registry so they survive every refactor (the agents are inert without a
 * provider key, so this checks the DEFINITIONS — schemas, prompts, allowed
 * fields — not live output):
 *   1. no-ai-verifies-skills      — no "verified/confirmed" field or level.
 *   2. no-ai-verifies-documents   — no agent output carries verification.
 *   3. no-ai-legal-guarantee      — legal/guarantee fields forbidden; prompts ban it.
 *   4. no-unsourced-country-answer — country output requires ≥1 evidence_ref.
 *   5. no-private-document-leak    — no agent INPUT/OUTPUT carries raw doc content.
 *   6. no-ai-live-payment-claim    — no agent output carries a payment field;
 *                                    translation bans pay/guarantee.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  AI_PROMPT_REGISTRY,
  ALL_AGENT_KEYS,
  RETIRED_AGENT_KEYS,
} from "../ai/registry/registry";
import { FORBIDDEN_DATA_FIELDS } from "../ai/schemas/envelope";
import { countryReadinessOutputSchema } from "../ai/registry/agents/country-readiness";

/**
 * 2026-10-25 (owner decision, registry row 10.11): skill_evidence,
 * document_assistant and support_onboarding — the agents guards 1, 2 and 6
 * used to inspect by name — were RETIRED, because connected deterministic
 * code already gives their whole output. The doctrine those guards defend is
 * unchanged, so each now asserts it over EVERY registered agent instead of
 * one: no agent can verify a skill or a document, and no agent's output can
 * carry a payment instruction. That is stronger, not weaker — the old form
 * only covered the agent it named.
 */
const PAYMENT_FIELD = /pay|checkout|invoice|charge|price/i;

function dataKeys(e: { outputSchema: z.ZodTypeAny }): string[] {
  const dataSchema = (e.outputSchema as unknown as { shape?: { data?: z.ZodTypeAny } })
    .shape?.data;
  return dataSchema ? objectKeys(dataSchema) : [];
}

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
  it("covers all nine registered agents (thirteen until the 2026-10-25 retirements)", () => {
    expect(entries.length).toBe(9);
    for (const key of RETIRED_AGENT_KEYS) {
      expect(Object.keys(AI_PROMPT_REGISTRY)).not.toContain(key);
    }
  });

  // 1 — no AI verifies skills.
  it("no-ai-verifies-skills: 'verified'/'confirmed' are forbidden data fields, and no agent outputs a confirmed level", () => {
    expect(FORBIDDEN_DATA_FIELDS).toContain("verified");
    expect(FORBIDDEN_DATA_FIELDS).toContain("confirmed");
    expect(AI_PROMPT_REGISTRY.worker_profile!.blockedClaims).toContain("verified");
    for (const e of entries) {
      for (const k of dataKeys(e)) {
        expect(
          (FORBIDDEN_DATA_FIELDS as readonly string[]).includes(k),
          `${e.agent} output field ${k} is a record-like field`,
        ).toBe(false);
      }
      // The excluded level may not even be NAMED in an output schema.
      expect(JSON.stringify(dataKeys(e))).not.toMatch(/manager_or_client_confirmed/);
    }
  });

  // 2 — no AI verifies documents.
  it("no-ai-verifies-documents: no agent output carries a verification field", () => {
    for (const e of entries) {
      for (const k of dataKeys(e)) {
        expect(/verif|genuine|authentic/i.test(k), `${e.agent} output field ${k}`).toBe(false);
      }
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
      evidence_refs: [{ source: "country_readiness_matrix", ref: "a1_certificate" }],
      missing_information: [],
      needs_human_review: true,
      blocked_claims: [],
      data: {
        summary: "The A1 matters first.",
        steps: [{ ref: "a1_certificate", step: "Ask for an A1 before you travel." }],
        needs_legal_review: true,
        limitations: ["Not legal advice."],
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
  it("no-ai-live-payment-claim: no agent output carries a payment field; translation bans pay/guarantee", () => {
    for (const e of entries) {
      for (const k of dataKeys(e)) {
        expect(PAYMENT_FIELD.test(k), `${e.agent} output field ${k} reads like a payment`).toBe(false);
      }
    }
    expect(AI_PROMPT_REGISTRY.translation_copy!.blockedClaims.join(" ").toLowerCase()).toMatch(
      /pay|guarantee/,
    );
  });
});
