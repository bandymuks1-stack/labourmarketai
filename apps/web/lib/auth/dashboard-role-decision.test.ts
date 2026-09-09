import { describe, expect, it } from "vitest";

import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";

import { classifyDurablePointer, decideDashboardRole } from "./dashboard-role-decision";

/**
 * W6 honesty (2026-09-06): a FAILED profile read must never land a person in
 * a silently chosen workspace. Measured: a company owner greeted as a person
 * because `profile?.active_role ?? "worker"` could not tell "read failed"
 * from "no row".
 */
describe("decideDashboardRole — a failed read never silently picks worker", () => {
  it("a successful read decides from the row", () => {
    expect(decideDashboardRole({ profileRead: "ok", activeRole: "company", pointer: null })).toEqual({
      kind: "role",
      role: "company",
      source: "profile",
    });
    expect(decideDashboardRole({ profileRead: "ok", activeRole: "agency", pointer: null }).kind).toBe("role");
  });

  it("a successful read with no active role is a brand-new person (unchanged behaviour)", () => {
    expect(decideDashboardRole({ profileRead: "ok", activeRole: null, pointer: null })).toEqual({
      kind: "role",
      role: "worker",
      source: "profile",
    });
    // a non-live value (e.g. admin) opens the person's own space, as before
    expect(decideDashboardRole({ profileRead: "ok", activeRole: "admin", pointer: null }).kind).toBe("role");
  });

  it("a successful read ignores the pointer (the row is the truth)", () => {
    expect(decideDashboardRole({ profileRead: "ok", activeRole: "worker", pointer: "organization" })).toEqual({
      kind: "role",
      role: "worker",
      source: "profile",
    });
  });

  it("a FAILED read keeps the last known context from the durable pointer", () => {
    expect(decideDashboardRole({ profileRead: "failed", activeRole: null, pointer: "organization" })).toEqual({
      kind: "role",
      role: "company",
      source: "pointer",
    });
    expect(decideDashboardRole({ profileRead: "failed", activeRole: null, pointer: "personal" })).toEqual({
      kind: "role",
      role: "worker",
      source: "pointer",
    });
  });

  it("a FAILED read with no pointer is the NAMED degrade state — never worker", () => {
    const d = decideDashboardRole({ profileRead: "failed", activeRole: null, pointer: null });
    expect(d).toEqual({ kind: "read-failed" });
    // and a stale `activeRole` that somehow arrived with a failed read is not trusted either
    expect(decideDashboardRole({ profileRead: "failed", activeRole: "worker", pointer: null })).toEqual({
      kind: "read-failed",
    });
  });
});

describe("classifyDurablePointer — only a membership-validated pointer counts", () => {
  const orgs = ["a996113c-6155-4ca6-9bac-4fc7bf7db8ae"];
  it("explicit personal choice", () => {
    expect(classifyDurablePointer(PERSONAL_WORKSPACE_ID, orgs)).toBe("personal");
  });
  it("an organization the person really belongs to", () => {
    expect(classifyDurablePointer(orgs[0], orgs)).toBe("organization");
  });
  it("absent, empty, or a foreign/stale id → null (never trusted)", () => {
    expect(classifyDurablePointer(null, orgs)).toBeNull();
    expect(classifyDurablePointer(undefined, orgs)).toBeNull();
    expect(classifyDurablePointer("", orgs)).toBeNull();
    expect(classifyDurablePointer("00000000-0000-4000-8000-000000000000", orgs)).toBeNull();
    expect(classifyDurablePointer(orgs[0], [])).toBeNull();
  });
});
