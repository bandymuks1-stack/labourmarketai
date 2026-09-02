import { describe, expect, it } from "vitest";

import { httpErrorResult } from "./extract-json";

/**
 * A vendor's non-OK response, repeated only as far as it is safe to.
 *
 * The rule this file pins is an ASYMMETRY, and the asymmetry is the whole
 * safety property:
 *
 *   - a RECOGNISED error shape (`error.status` / `error.code` / `error.type` /
 *     `error.message`) is repeated, because those messages describe our
 *     REQUEST'S SHAPE — "models/x is not found for API version v1beta",
 *     "quota exceeded", "invalid API key". Vendors name field PATHS, not
 *     field values.
 *   - anything ELSE contributes nothing. An unrecognised body could be
 *     anything, including an echo of the prompt — and prompts carry CVs,
 *     journal entries and absence notes.
 *
 * Motivating incident: production reported `gemini http 404` and nothing else.
 * True, reproducible, and unactionable — a 404 from a generative API can mean
 * the model id, the API version, the endpoint or the key scope, and the vendor
 * says which in the body we were discarding.
 */

function response(status: number, body: string): Response {
  return new Response(body, { status });
}

describe("httpErrorResult repeats the vendor's structured diagnosis", () => {
  it("names the actual cause behind a Gemini 404", async () => {
    const r = await httpErrorResult(
      "gemini",
      response(
        404,
        JSON.stringify({
          error: {
            code: 404,
            message:
              "models/gemini-2.5-flash-lite is not found for API version v1beta, or is not supported for generateContent.",
            status: "NOT_FOUND",
          },
        }),
      ),
    );
    expect(r.code).toBe("provider_error");
    expect(r.message).toContain("gemini http 404");
    expect(r.message).toContain("NOT_FOUND");
    expect(r.message).toContain("not found for API version v1beta");
  });

  it("handles the OpenAI/Anthropic error shape too", async () => {
    const r = await httpErrorResult(
      "openai",
      response(401, JSON.stringify({ error: { type: "invalid_request_error", message: "Incorrect API key provided" } })),
    );
    expect(r.message).toContain("invalid_request_error");
    expect(r.message).toContain("Incorrect API key provided");
  });

  it("accepts a bare error object with no `error` wrapper", async () => {
    const r = await httpErrorResult(
      "xai",
      response(429, JSON.stringify({ code: "rate_limit", message: "slow down" })),
    );
    expect(r.message).toContain("rate_limit");
  });
});

describe("SAFETY: an unrecognised body is never repeated", () => {
  it("a non-JSON body contributes nothing but the status", async () => {
    // The realistic hazard: a proxy or gateway echoing the request back.
    const r = await httpErrorResult(
      "gemini",
      response(500, "Upstream error while processing: <the whole prompt here>"),
    );
    expect(r.message).toBe("gemini http 500");
    expect(r.message).not.toContain("prompt");
  });

  it("JSON without a recognised error shape contributes nothing", async () => {
    const r = await httpErrorResult(
      "gemini",
      response(400, JSON.stringify({ echoed_request: { contents: "worker journal text" } })),
    );
    expect(r.message).toBe("gemini http 400");
    expect(r.message).not.toContain("journal");
  });

  it("an empty body contributes nothing", async () => {
    expect((await httpErrorResult("deepl", response(503, ""))).message).toBe("deepl http 503");
  });

  it("a pathological message is bounded", async () => {
    const r = await httpErrorResult(
      "gemini",
      response(400, JSON.stringify({ error: { status: "INVALID", message: "x".repeat(9000) } })),
    );
    // status prefix + " — " + at most 300 chars of detail. The bound is wide
    // enough to carry a vendor's full remediation sentence — a diagnosis
    // truncated exactly where the FIX would appear is the failure mode this
    // number was widened to remove (production, 2026-08-28: Google's
    // "no longer available to new users. Please update your code to use
    // models/…" was cut off at the model id).
    expect(r.message.length).toBeLessThan(360);
  });

  it("only reads a bounded slice of a huge body", async () => {
    // A 5 MB body must not be pulled into a log line; the parse simply fails
    // on the truncated slice and the status stands alone.
    const huge = JSON.stringify({ error: { message: "y".repeat(5_000_000) } });
    const r = await httpErrorResult("openai", response(502, huge));
    expect(r.message).toBe("openai http 502");
  });
});
