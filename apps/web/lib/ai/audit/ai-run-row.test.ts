/**
 * AI run audit row — hashes only, never raw content.
 */
import { describe, it, expect } from "vitest";
import { buildAiRunRow, hashForAudit } from "./ai-run-row";

describe("hashForAudit", () => {
  it("is deterministic sha256 hex", () => {
    const a = hashForAudit({ bio: "secret narrative" });
    const b = hashForAudit({ bio: "secret narrative" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("returns null for null/undefined (nothing to hash)", () => {
    expect(hashForAudit(null)).toBeNull();
    expect(hashForAudit(undefined)).toBeNull();
  });
  it("differs for different content", () => {
    expect(hashForAudit("a")).not.toBe(hashForAudit("b"));
  });
});

describe("buildAiRunRow", () => {
  it("stores HASHES, never the raw input/output", () => {
    const row = buildAiRunRow({
      ownerId: "u1",
      agentKey: "worker_profile",
      promptVersion: "1.0.0",
      provider: "mock",
      model: "claude-opus-4-8",
      status: "suggestion",
      input: { bio: "I tile bathrooms — sensitive detail" },
      output: { data: { suggested_headline: "Tiler" } },
      inputTokens: 10,
      outputTokens: 20,
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("sensitive detail");
    expect(serialized).not.toContain("suggested_headline");
    expect(row.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.output_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.owner_id).toBe("u1");
    expect(row.status).toBe("suggestion");
  });

  it("nulls hashes when input/output absent", () => {
    const row = buildAiRunRow({
      agentKey: "country_readiness",
      promptVersion: "1.0.0",
      provider: "disabled",
      status: "disabled",
    });
    expect(row.input_hash).toBeNull();
    expect(row.output_hash).toBeNull();
    expect(row.owner_id).toBeNull();
    expect(row.model).toBeNull();
  });
});
