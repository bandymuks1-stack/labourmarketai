import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rpcOutcome } from "./service-requests-shared";

describe("service request RPC outcomes (chain proof 2026-10-07)", () => {
  it("only the literal 'ok' is a success", () => {
    expect(rpcOutcome("ok")).toBe("ok");
    expect(rpcOutcome("not_provider")).toBe("not_provider");
    expect(rpcOutcome("not_pending")).toBe("not_pending");
    expect(rpcOutcome(null)).toBe("unknown");
    expect(rpcOutcome(undefined)).toBe("unknown");
    expect(rpcOutcome(true)).toBe("unknown");
    expect(rpcOutcome("")).toBe("unknown");
  });

  it("respond and withdraw refuse to report a non-ok status as ok", () => {
    const src = readFileSync(join(__dirname, "service-requests.ts"), "utf8");
    const uses = src.match(/const outcome = rpcOutcome\(data\);\s*if \(outcome !== "ok"\) return \{ kind: "error"/g) ?? [];
    expect(uses).toHaveLength(2);
    expect(src).not.toMatch(/detail: typeof data === "string" \? data : undefined/);
  });
});
