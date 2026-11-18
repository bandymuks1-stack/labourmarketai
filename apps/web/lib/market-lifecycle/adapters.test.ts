import { describe, expect, it } from "vitest";

import { actionForStatus, serviceAdapter } from "./adapters";

/**
 * The status-shaped door the MCP `service_offering_status_set_*` tools use.
 * Pinned because the production MCP walk (M-6) asked to PAUSE a fresh draft —
 * a request the one lifecycle contract (#2743) refuses — and read the refusal
 * as a concurrency failure.
 */
describe("actionForStatus — service offerings", () => {
  const adapter = serviceAdapter({ closedSupported: false });
  const facts = (state: "draft" | "active" | "paused") => adapter.facts({ status: state, closedOutcome: null });

  it("a draft is published, never paused", () => {
    expect(actionForStatus(adapter, facts("draft"), "active")).toBe("publish");
    expect(actionForStatus(adapter, facts("draft"), "paused")).toBeNull();
  });

  it("an active offering pauses; a paused one resumes", () => {
    expect(actionForStatus(adapter, facts("active"), "paused")).toBe("pause");
    expect(actionForStatus(adapter, facts("paused"), "active")).toBe("resume");
  });
});
