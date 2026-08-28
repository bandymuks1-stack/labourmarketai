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

/**
 * A non-OK vendor response, described well enough to act on.
 *
 * WHY THIS EXISTS. Every adapter reported `"<vendor> http <status>"` and
 * stopped there. In production that produced `gemini http 404` — true,
 * reproducible, and completely unactionable: a 404 from a generative API can
 * mean the model id is wrong, the API version is wrong, the endpoint is wrong,
 * or the key is scoped to a different product. The vendor knows which, and
 * says so in the body, and we were throwing the body away.
 *
 * WHAT IT WILL AND WILL NOT REPEAT. STRUCTURED error fields only —
 * `error.status`, `error.code`, `error.type`, `error.message` — read from a
 * bounded slice and truncated again on the way out. A body that is not JSON,
 * or is JSON without a recognised error shape, contributes NOTHING: only the
 * status code is reported.
 *
 * That asymmetry is the safety property and it is deliberate. These messages
 * are the vendor describing OUR REQUEST'S SHAPE ("models/x is not found for
 * API version v1beta", "quota exceeded", "invalid API key") — vendors name
 * field PATHS, not field values. An unrecognised body could be anything,
 * including an echo of the prompt, and prompts carry CVs and journal entries.
 * So the recognised shape is repeated and the unrecognised one never is.
 */
export async function httpErrorResult(
  vendor: string,
  res: Response,
): Promise<{ code: "provider_error"; message: string }> {
  let detail = "";
  try {
    const raw = (await res.text()).slice(0, 2000);
    const parsed: unknown = JSON.parse(raw);
    const err =
      parsed !== null && typeof parsed === "object"
        ? ((parsed as { error?: unknown }).error ?? parsed)
        : null;
    if (err !== null && typeof err === "object") {
      const e = err as Record<string, unknown>;
      const label = [e.status, e.code, e.type].find(
        (v) => typeof v === "string" && v !== "",
      ) as string | undefined;
      const message = typeof e.message === "string" ? e.message : undefined;
      detail = [label, message].filter(Boolean).join(": ");
    }
  } catch {
    // Unreadable or non-JSON body → the status stands alone. Never guess.
  }
  return {
    code: "provider_error",
    message: detail
      ? `${vendor} http ${res.status} — ${detail.slice(0, 180)}`
      : `${vendor} http ${res.status}`,
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
