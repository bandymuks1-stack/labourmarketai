import { describe, expect, it } from "vitest";

import { normalizeCvExtractCode } from "./cv-import-client";

describe("the CV failure code is a closed set before it is shown or recorded", () => {
  it("keeps known codes, including the server's rate limit", () => {
    for (const c of ["unsupported", "too-large", "empty", "failed", "unauthorized", "network", "rate-limited"]) {
      expect(normalizeCvExtractCode(c)).toBe(c);
    }
  });
  it("anything else — an unknown string, a number, an object, nothing — is 'failed'", () => {
    for (const raw of ["bad-request", "", 42, { x: 1 }, null, undefined]) {
      expect(normalizeCvExtractCode(raw)).toBe("failed");
    }
  });
});
