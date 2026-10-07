import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { exposedCapabilities } from "@/lib/capabilities/registry";

/**
 * THE WRITE CONTRACT, ENFORCED (lib/capabilities/contract.ts WRITE SEMANTICS):
 * consequential writes are split `draft` -> `confirm`; only `confirm`/`execute`
 * may touch the database. The MCP server's `instructions` tell a client that
 * nothing writes without a draft->confirm step EXCEPT a short, named list of
 * single-step capabilities. This guard makes that list the ONLY way a
 * single-step (`kind: "execute"`) capability can be exposed: a new one fails
 * here until it is added deliberately, and the instructions in
 * `app/api/mcp/route.ts` are updated to name it.
 */
const SINGLE_STEP_ALLOWLIST: readonly string[] = [
  // The session's active-workspace pointer: reversible, one row, a no-op when repeated.
  "context.switch",
  // One unlinked roster person (no account, no governance, no CV).
  "evidence.person.create",
  // Evidence-import STAGING: nothing here becomes a record. Records exist only
  // through the confirmed `evidence.import.commit`.
  "evidence.import.create_session",
  "evidence.import.submit_rows",
  "evidence.import.resolve_row",
  "evidence.import.resolve_label",
  "evidence.import.resolve_time_semantics",
];

describe("every exposed single-step write is on an explicit allowlist", () => {
  const executes = exposedCapabilities()
    .filter((c) => c.kind === "execute")
    .map((c) => c.id)
    .sort();

  it("no exposed `execute` capability is missing from the allowlist", () => {
    const unlisted = executes.filter((id) => !SINGLE_STEP_ALLOWLIST.includes(id));
    expect(
      unlisted,
      "a single-step write is exposed without being reviewed: make it a draft->confirm pair, or add it here AND to the MCP instructions",
    ).toEqual([]);
  });

  it("the allowlist holds no stale entry", () => {
    const stale = SINGLE_STEP_ALLOWLIST.filter((id) => !executes.includes(id));
    expect(stale, "remove entries that are no longer exposed `execute` capabilities").toEqual([]);
  });

  it("attest and withdraw are NOT single-step: each is a draft/confirm pair", () => {
    const byId = new Map(exposedCapabilities().map((c) => [c.id, c.kind]));
    expect(byId.get("evidence.record.attest_draft")).toBe("draft");
    expect(byId.get("evidence.record.attest_confirm")).toBe("confirm");
    expect(byId.get("evidence.import.withdraw_draft")).toBe("draft");
    expect(byId.get("evidence.import.withdraw_confirm")).toBe("confirm");
  });
});
