import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Action lifecycle: understood → prepared → CONFIRMED ONCE → executed → saved.
 * Non-idempotent creates must bind their confirmation to a state the write
 * itself changes, so a replayed / double-submitted token is refused
 * (`stale_confirmation`) before the executor runs — never a second record.
 */
const src = readFileSync(resolve(__dirname, "..", "conversation", "dispatch.ts"), "utf8");
const fp = src.slice(src.indexOf("async function stateFingerprint"), src.indexOf("type ExecutableActionId"));

describe("non-idempotent creates are single-use confirmations", () => {
  it.each([
    ["worker.log-work", "journalChainFingerprint"],
    ["company.create-demand", "demandStateFingerprint"],
    ["company.create-project", 'from("projects")'],
  ])("%s binds to a state its own write changes", (action, binding) => {
    const at = fp.indexOf(`actionId === "${action}"`);
    expect(at, action).toBeGreaterThan(0);
    expect(fp.slice(at, at + 1600)).toContain(binding);
    expect(at).toBeLessThan(fp.lastIndexOf('return "n/a";'));
  });
});
