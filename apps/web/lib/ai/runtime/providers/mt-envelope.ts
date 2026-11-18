/**
 * Shared shaping for the machine-translation (MT) secondary providers.
 *
 * An MT engine returns plain translated text, not the agent envelope. This
 * wraps it in the strict `translation_copy` envelope with TRUTHFUL fields —
 * `plain_language_version` is null and `missing_information` says wording
 * strength was NOT assessed — so nothing is claimed that a machine translation
 * cannot back. The envelope is validated downstream by the strict output
 * schema exactly like any raw output.
 *
 * Pure. No IO, no env.
 */
import type { AiCompletionRequest } from "../types";

/** The text and languages a translate_message request carries. */
export function readTranslationRequest(request: AiCompletionRequest): {
  text: string | null;
  target: string;
  /** The author's language when the caller knew it, else null (never guessed). */
  source: string | null;
} {
  const input = request.input as { canonicalMessage?: unknown; locale?: unknown } | null;
  const text =
    input && typeof input.canonicalMessage === "string" && input.canonicalMessage.length > 0
      ? input.canonicalMessage
      : null;
  const target = (
    input && typeof input.locale === "string" ? input.locale : request.locale
  )
    .trim()
    .toLowerCase()
    .slice(0, 2);
  const src = request.sourceLanguage?.trim().toLowerCase().slice(0, 2) ?? "";
  return { text, target, source: src.length === 2 ? src : null };
}

export function translationEnvelope(args: {
  translated: string;
  /** Provenance label, e.g. "libretranslate". */
  engine: string;
}): Record<string, unknown> {
  return {
    suggestion: true,
    agent: "translation_copy",
    confidence: "medium",
    evidence_refs: [{ source: "canonical_message", ref: `${args.engine}:mt` }],
    missing_information: [
      `wording_warnings not assessed — machine translation via ${args.engine}`,
      `plain_language_version not produced by ${args.engine}`,
    ],
    needs_human_review: false,
    blocked_claims: [],
    data: {
      localized_copy: args.translated.slice(0, 8000),
      plain_language_version: null,
      wording_warnings: [],
    },
  };
}
