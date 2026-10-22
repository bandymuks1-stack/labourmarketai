import { describe, expect, it } from "vitest";

import { CAPABILITY_READBACK_KEYS, buildCapabilityReadback } from "./capability-readback";

const full = Object.fromEntries(CAPABILITY_READBACK_KEYS.map((k, i) => [k, i]));

describe("capability readback body (Agentai OS contract re-verification)", () => {
  it("emits exactly the agreed keys as non-negative integers, under the agreed schema", () => {
    const body = buildCapabilityReadback({ ...full, public_vacancies: "169597", stray_row: { email: "x" } }, "2026-10-22T15:00:00.000Z");
    expect(body?.schema).toBe("lm-capability-readback/v1");
    expect(Object.keys(body!.counts).sort()).toEqual([...CAPABILITY_READBACK_KEYS].sort());
    expect(body!.counts.public_vacancies).toBe(169597);
    expect(JSON.stringify(body)).not.toContain("email");
  });
  it("a missing, negative or non-integer count fails closed (null → 503), never a zero", () => {
    const { workers: _omit, ...missing } = full;
    expect(buildCapabilityReadback(missing, "x")).toBeNull();
    expect(buildCapabilityReadback({ ...full, matches: -1 }, "x")).toBeNull();
    expect(buildCapabilityReadback({ ...full, matches: 1.5 }, "x")).toBeNull();
    expect(buildCapabilityReadback(null, "x")).toBeNull();
    expect(buildCapabilityReadback([], "x")).toBeNull();
  });
});
