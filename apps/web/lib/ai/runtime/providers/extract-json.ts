/**
 * Best-effort JSON extraction from a model text response — shared by the
 * fetch-based provider adapters (openai / gemini / xai). Mirrors the private
 * helper inside providers/anthropic.ts.
 *
 * Pure. No IO, no env.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/** Shared JSON-only output instruction appended to the system prompt. */
export function jsonSchemaHint(jsonSchema?: Record<string, unknown>): string {
  return jsonSchema
    ? `\n\nReturn ONLY a single JSON object matching this JSON Schema (no prose, no code fence):\n${JSON.stringify(jsonSchema)}`
    : "\n\nReturn ONLY a single JSON object (no prose, no code fence).";
}

/**
 * Honest failure for an unusable answer: a response cut at the output-token
 * ceiling is attributed to the REQUEST (`truncated` — it reproduces on every
 * provider with the same ceiling), anything else to the model's output shape
 * (`malformed_output`).
 */
export function malformedOrTruncated(
  hitTokenCeiling: boolean,
  where: string,
): {
  status: "error";
  code: "truncated" | "malformed_output";
  message: string;
} {
  return hitTokenCeiling
    ? {
        status: "error",
        code: "truncated",
        message: `output truncated at token ceiling (${where})`,
      }
    : {
        status: "error",
        code: "malformed_output",
        message: `no JSON in ${where} response`,
      };
}

/** Map a fetch/abort failure to an honest error code + bounded message. */
export function fetchErrorResult(err: unknown): {
  code: "timeout" | "provider_error";
  message: string;
} {
  const message = err instanceof Error ? err.message : "provider error";
  const isTimeout =
    (err instanceof Error && err.name === "TimeoutError") ||
    /timeout|abort/i.test(message);
  return {
    code: isTimeout ? "timeout" : "provider_error",
    message: message.slice(0, 200),
  };
}
