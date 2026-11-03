import { describe, expect, it } from "vitest";
import { authorizeDispatch, heldDispatchRoles, requiresConfirmation } from "@/lib/conversation/dispatch-core";
import { CONVERSATION_ACTIONS, getConversationAction } from "@/lib/conversation/action-registry";
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

describe("held roles — the own worker profile holds `worker` (defect 2026-11-02)", () => {
  const companyOnlyWithWorkerRow = heldDispatchRoles({
    profileRoles: ["company"],
    opensCompanySpace: false,
    ownsWorkerProfile: true,
  });

  it("a company-role person with their own worker profile may answer a roster invitation", () => {
    expect(companyOnlyWithWorkerRow.has("worker")).toBe(true);
    expect(
      authorizeDispatch({
        descriptor: getConversationAction("worker.respond-invitation"),
        heldRoles: companyOnlyWithWorkerRow,
        executable: true,
      }),
    ).toEqual({ ok: true });
  });

  it("every worker-only action opens to them, and nothing beyond what the catalogue already held", () => {
    const companyOnly = heldDispatchRoles({ profileRoles: ["company"], opensCompanySpace: false, ownsWorkerProfile: false });
    for (const a of CONVERSATION_ACTIONS) {
      const before = a.allowedRoles.some((r) => companyOnly.has(r));
      const after = a.allowedRoles.some((r) => companyOnlyWithWorkerRow.has(r));
      // Only actions a worker may run change their answer.
      if (after !== before) expect(a.allowedRoles).toContain("worker");
    }
  });

  it("without their own worker profile the same person is still refused", () => {
    const companyOnly = heldDispatchRoles({ profileRoles: ["company"], opensCompanySpace: false, ownsWorkerProfile: false });
    expect(companyOnly.has("worker")).toBe(false);
    expect(
      authorizeDispatch({
        descriptor: getConversationAction("worker.respond-invitation"),
        heldRoles: companyOnly,
        executable: true,
      }),
    ).toEqual({ ok: false, code: "not_authorized" });
  });

  it("a worker profile never adds company, agency, customer or admin", () => {
    const workerOnly = heldDispatchRoles({ profileRoles: ["worker"], opensCompanySpace: false, ownsWorkerProfile: true });
    expect([...workerOnly]).toEqual(["worker"]);
    expect(
      authorizeDispatch({
        descriptor: getConversationAction("company.assign-worker"),
        heldRoles: workerOnly,
        executable: true,
      }),
    ).toEqual({ ok: false, code: "not_authorized" });
  });

  it("keeps the membership arm and the brand-new-account default", () => {
    expect(heldDispatchRoles({ profileRoles: ["worker"], opensCompanySpace: true, ownsWorkerProfile: false }).has("company")).toBe(true);
    expect([...heldDispatchRoles({ profileRoles: [], opensCompanySpace: false, ownsWorkerProfile: false })]).toEqual(["worker"]);
  });
});
