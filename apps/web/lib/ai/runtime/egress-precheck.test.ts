import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { taskEgressPossible } from "./egress-precheck";
import type { AiEgressGrant } from "./data-egress";
import type { AiProviderState } from "./provider-chain";
import { isEgressRefusal } from "../run-agent";

/**
 * Audit 2026-10-16 (AI-1): a privacy refusal is never a run.
 *
 * Three pins. (1) The pre-check answers exactly what the chain would answer,
 * so a caller that asks first skips a run the gate would refuse — with zero
 * ledger IO. (2) The dispatcher's refusal is recognised structurally. (3) The
 * server boundary never costs a refused run and the daily counter never
 * counts it (source pins, because both are best-effort IO paths).
 */
const ready = (id: AiProviderState["id"]): AiProviderState => ({ id, health: "ready" });

describe("taskEgressPossible — the pre-check mirrors the gate", () => {
  it("a PUBLIC task may reach a ready external provider without a grant", () => {
    expect(taskEgressPossible("explain_market_demand", [ready("gemini")], [])).toBe(true);
  });
  it("a SENSITIVE_FREE_TEXT task cannot reach an external provider without a grant", () => {
    expect(taskEgressPossible("translate_message", [ready("gemini")], [])).toBe(false);
    expect(taskEgressPossible("translate_vacancy", [ready("gemini")], [])).toBe(false);
  });
  it("a PERSONAL task on an external provider is refused by construction", () => {
    expect(taskEgressPossible("explain_match", [ready("gemini")], [])).toBe(false);
  });
  it("a ready LOCAL runtime can receive anything it is capable of", () => {
    expect(taskEgressPossible("translate_message", [ready("local")], [])).toBe(true);
    expect(taskEgressPossible("explain_match", [ready("local")], [])).toBe(true);
  });
  it("an unconfigured provider does not count, whatever the grant says", () => {
    const grant: AiEgressGrant = {
      provider: "gemini",
      maxSensitivity: "SENSITIVE_FREE_TEXT",
      tasks: ["translate_message"],
      basis: "test",
      grantedOn: "2026-10-16",
    };
    expect(
      taskEgressPossible("translate_message", [{ id: "gemini", health: "unconfigured" }], [grant]),
    ).toBe(false);
    expect(taskEgressPossible("translate_message", [ready("gemini")], [grant])).toBe(true);
  });
  it("no providers at all → nothing can be served", () => {
    expect(taskEgressPossible("explain_market_demand", [], [])).toBe(false);
  });
});

describe("isEgressRefusal — recognised structurally, never by payload", () => {
  it("matches the gate's own message shape only", () => {
    expect(
      isEgressRefusal({
        status: "error",
        code: "unsupported",
        message: 'data egress gate: "gemini" is external and holds no egress grant',
      }),
    ).toBe(true);
    expect(isEgressRefusal({ status: "error", code: "unsupported", message: "gemini http 404" })).toBe(false);
    expect(isEgressRefusal({ status: "error", code: "timeout", message: "data egress gate" })).toBe(false);
    expect(isEgressRefusal({ status: "ok" })).toBe(false);
  });
});

describe("a refusal never counts toward a budget or the money ledger (source pins)", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  it("the audit row of a refused run carries blocked_reason = egress_refused", () => {
    const core = read("run-agent.ts");
    expect(core).toContain('{ ...effectiveDecision, blocked: "egress_refused" }');
    expect(read("runtime/task-routing.ts")).toContain('| "egress_refused"');
  });
  it("the server boundary skips the cost row for a refused run", () => {
    const server = read("run-agent-server.ts");
    expect(server).toContain('outcome.routing.blocked === "egress_refused"');
    expect(server).toMatch(/disposition === "vendor_run" && !egressRefused/);
  });
  it("the daily run counter counts non-blocked rows only", () => {
    expect(read("runtime/audit-store.ts")).toContain('.is("blocked_reason", null)');
  });
  it("the three refusal-heavy call sites ask the pre-check before running", () => {
    expect(readFileSync(join(__dirname, "../../communication/translation-read.ts"), "utf8")).toContain(
      'aiTaskServableNow("translate_message"',
    );
    expect(readFileSync(join(__dirname, "../../vacancy-store/vacancy-translation-read.ts"), "utf8")).toContain(
      'aiTaskServableNow("translate_vacancy"',
    );
    expect(readFileSync(join(__dirname, "../../staffing/match-preview-actions.ts"), "utf8")).toContain(
      'aiTaskServableNow("explain_match"',
    );
  });
});
