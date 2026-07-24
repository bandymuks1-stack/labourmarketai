import { describe, expect, it } from "vitest";
import { authorizeDispatch, requiresConfirmation } from "@/lib/conversation/dispatch-core";
import { getConversationAction } from "@/lib/conversation/action-registry";
import type { Role } from "@/lib/auth/actions";

const held = (...r: Role[]) => new Set<Role>(r);

describe("dispatch authorization core", () => {
  it("rejects an unknown action id (LLM cannot invent actions)", () => {
    expect(
      authorizeDispatch({ descriptor: getConversationAction("worker.delete-all"), heldRoles: held("worker"), executable: true }),
    ).toEqual({ ok: false, code: "unknown_action" });
  });

  it("rejects a worker running a company-only action", () => {
    const assign = getConversationAction("company.assign-worker");
    expect(assign?.allowedRoles).toEqual(["company"]);
    expect(
      authorizeDispatch({ descriptor: assign, heldRoles: held("worker"), executable: true }),
    ).toEqual({ ok: false, code: "not_authorized" });
  });

  it("rejects a worker running an agency action", () => {
    expect(
      authorizeDispatch({
        descriptor: getConversationAction("agency.propose-candidate"),
        heldRoles: held("worker"),
        executable: true,
      }),
    ).toEqual({ ok: false, code: "not_authorized" });
  });

  it("rejects a non-executable (deep-link-only) action", () => {
    expect(
      authorizeDispatch({
        descriptor: getConversationAction("worker.review-bookings"),
        heldRoles: held("worker"),
        executable: false,
      }),
    ).toEqual({ ok: false, code: "not_executable" });
  });

  it("allows a worker to run a worker executable action", () => {
    expect(
      authorizeDispatch({
        descriptor: getConversationAction("worker.respond-booking"),
        heldRoles: held("worker"),
        executable: true,
      }),
    ).toEqual({ ok: true });
  });

  it("allows a multi-role user (worker+company) to run either", () => {
    expect(
      authorizeDispatch({
        descriptor: getConversationAction("company.create-demand"),
        heldRoles: held("worker", "company"),
        executable: true,
      }),
    ).toEqual({ ok: true });
  });

  it("marks the strong/important tiers as confirmation-required", () => {
    expect(requiresConfirmation("strong_irreversible")).toBe(true);
    expect(requiresConfirmation("important_write")).toBe(true);
    expect(requiresConfirmation("reversible_write")).toBe(false);
    expect(requiresConfirmation("read")).toBe(false);
  });
});
