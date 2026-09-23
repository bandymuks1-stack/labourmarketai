import { describe, expect, it } from "vitest";

import {
  PERSONAL_WORKSPACE_ID,
  SWITCHABLE_ENGAGEMENT_RELATIONSHIPS,
  actingRoleForWorkspace,
  encodeWorkspacePointerCookie,
  parseWorkspacePointerCookie,
  pickStoredWorkspacePointer,
  resolveActiveWorkspaceId,
  workspaceDisplayLabels,
  workspaceRelationshipLabel,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";

/**
 * ACTIVE CONTEXT INTEGRITY (owner program 2026-09-23, P0 case 1/2).
 *
 * The invariant: SELECTED WORKSPACE = DATA = CHAT = PERMISSION = ACTION
 * context. These pin the pure rules the whole chain now shares:
 *
 *   d2  one pointer rule — an organization in the DB pointer wins, the session
 *       pointer decides only when the DB pointer is null;
 *   d3  the acting identity follows the person's RELATIONSHIP to the
 *       workspace, never "holds the company role somewhere";
 *   the session cookie is bound to the user who set it.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";

const org = (over: Partial<WorkspaceInfo> & { id: string }): WorkspaceInfo => ({
  name: "",
  kind: "organization",
  organizationType: "company",
  relationship: "owner",
  accentIndex: 0,
  ...over,
});
const personal: WorkspaceInfo = { id: PERSONAL_WORKSPACE_ID, name: "", kind: "personal", accentIndex: 0 };

describe("pickStoredWorkspacePointer — ONE pointer rule (d2)", () => {
  it("an organization in the DB pointer wins over the session cookie", () => {
    // The MCP `context.switch` writes only the DB pointer; a cookie-first read
    // shadowed it in every open web session until the person switched again.
    expect(pickStoredWorkspacePointer(ORG_B, ORG_A)).toBe(ORG_B);
    expect(pickStoredWorkspacePointer(ORG_B, PERSONAL_WORKSPACE_ID)).toBe(ORG_B);
  });

  it("the session pointer decides only when the DB pointer is null", () => {
    expect(pickStoredWorkspacePointer(null, ORG_A)).toBe(ORG_A);
    expect(pickStoredWorkspacePointer(undefined, ORG_A)).toBe(ORG_A);
    expect(pickStoredWorkspacePointer("", ORG_A)).toBe(ORG_A);
  });

  it("D-20: the explicit PERSONAL sentinel survives (the NULL column cannot carry it)", () => {
    const stored = pickStoredWorkspacePointer(null, PERSONAL_WORKSPACE_ID);
    expect(stored).toBe(PERSONAL_WORKSPACE_ID);
    // …and it still outranks the single-org default downstream.
    expect(resolveActiveWorkspaceId("company", [ORG_A], stored)).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("a bearer transport (no session pointer) keeps the DB-only behaviour", () => {
    expect(pickStoredWorkspacePointer(ORG_A, null)).toBe(ORG_A);
    expect(pickStoredWorkspacePointer(null, null)).toBeNull();
  });

  it("M-P0-5: nothing stored + several organizations still FAILS CLOSED to personal", () => {
    const stored = pickStoredWorkspacePointer(null, null);
    expect(resolveActiveWorkspaceId("company", [ORG_A, ORG_B], stored)).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("the pick never validates membership — a stale DB pointer still fails closed downstream", () => {
    const stale = "99999999-9999-4999-8999-999999999999";
    const stored = pickStoredWorkspacePointer(stale, ORG_A);
    expect(stored).toBe(stale);
    expect(resolveActiveWorkspaceId("company", [ORG_A, ORG_B], stored)).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("NEGATIVE CONTROL: the old cookie-first order would have named the other organization", () => {
    // The chip's former `sessionPointer ?? dbPointer`. Kept here only to prove
    // the two orders really disagree on the input the defect was reported on.
    const cookieFirst = (db: string | null, session: string | null) => session ?? db;
    expect(cookieFirst(ORG_B, ORG_A)).toBe(ORG_A);
    expect(pickStoredWorkspacePointer(ORG_B, ORG_A)).not.toBe(cookieFirst(ORG_B, ORG_A));
  });
});

describe("actingRoleForWorkspace — identity follows the relationship (d3)", () => {
  const ALL = ["admin", "agency", "company", "customer", "worker"];

  it("owner of a company → company", () => {
    expect(actingRoleForWorkspace(org({ id: ORG_A, relationship: "owner" }), ALL)).toBe("company");
  });

  it("EMPLOYEE of someone else's company → worker, never its employer", () => {
    // The owner's a3d59458 case: holds company somewhere, is only an employee
    // here. The old rule (`roles.includes("company") ? "company"`) made the
    // chat speak as the employer while every employer read failed closed.
    expect(actingRoleForWorkspace(org({ id: ORG_B, relationship: "employee" }), ALL)).toBe("worker");
    // NEGATIVE CONTROL — the old rule, for the same input:
    const oldRule = (roles: string[]) => (roles.includes("company") ? "company" : roles.includes("agency") ? "agency" : null);
    expect(oldRule(ALL)).toBe("company");
  });

  it("member / viewer (relationship other) → worker", () => {
    expect(actingRoleForWorkspace(org({ id: ORG_B, relationship: "other" }), ALL)).toBe("worker");
    expect(actingRoleForWorkspace(org({ id: ORG_B, relationship: undefined }), ALL)).toBe("worker");
  });

  it("manager (incl. governance admin, which maps to manager) → company family", () => {
    expect(actingRoleForWorkspace(org({ id: ORG_A, relationship: "manager" }), ALL)).toBe("company");
  });

  it("agency-type organization → agency when the agency role is held", () => {
    expect(
      actingRoleForWorkspace(org({ id: ORG_A, organizationType: "agency", relationship: "owner" }), ALL),
    ).toBe("agency");
    // A COMPANY whose company is a staffing agency is an agency too.
    expect(
      actingRoleForWorkspace(
        org({ id: ORG_A, organizationType: "company", companyType: "staffing_agency" }),
        ALL,
      ),
    ).toBe("agency");
    // …but not when agency is not held: company is the fallback.
    expect(
      actingRoleForWorkspace(org({ id: ORG_A, organizationType: "agency" }), ["company", "worker"]),
    ).toBe("company");
  });

  it("company-family fallback: an owner holding only agency acts as agency", () => {
    expect(actingRoleForWorkspace(org({ id: ORG_A }), ["agency"])).toBe("agency");
  });

  it("personal workspace → worker (unchanged rule)", () => {
    expect(actingRoleForWorkspace(personal, ALL)).toBe("worker");
    expect(actingRoleForWorkspace(null, ALL)).toBe("worker");
  });

  it("only HELD roles are ever returned — no fitting role → null (keep the current one)", () => {
    expect(actingRoleForWorkspace(personal, ["company"])).toBeNull();
    expect(actingRoleForWorkspace(org({ id: ORG_B, relationship: "employee" }), ["company"])).toBeNull();
    expect(actingRoleForWorkspace(org({ id: ORG_A }), ["worker"])).toBeNull();
    expect(actingRoleForWorkspace(org({ id: ORG_A }), [])).toBeNull();
  });

  it("admin preservation: `admin` is never an acting identity, whatever is held", () => {
    for (const w of [personal, org({ id: ORG_A }), org({ id: ORG_B, relationship: "employee" })]) {
      expect(actingRoleForWorkspace(w, ALL)).not.toBe("admin");
    }
    expect(actingRoleForWorkspace(org({ id: ORG_A }), ["admin"])).toBeNull();
    expect(actingRoleForWorkspace(personal, ["admin"])).toBeNull();
  });
});

describe("the workspace cookie is bound to the user who set it", () => {
  it("round-trips for the same user", () => {
    const v = encodeWorkspacePointerCookie(USER, ORG_A);
    expect(parseWorkspacePointerCookie(v, USER)).toBe(ORG_A);
    expect(
      parseWorkspacePointerCookie(encodeWorkspacePointerCookie(USER, PERSONAL_WORKSPACE_ID), USER),
    ).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("a value written for ANOTHER user is ignored (shared browser)", () => {
    const theirs = encodeWorkspacePointerCookie(OTHER_USER, PERSONAL_WORKSPACE_ID);
    expect(parseWorkspacePointerCookie(theirs, USER)).toBeNull();
    expect(parseWorkspacePointerCookie(encodeWorkspacePointerCookie(OTHER_USER, ORG_A), USER)).toBeNull();
  });

  it("no user → no bound value", () => {
    expect(parseWorkspacePointerCookie(encodeWorkspacePointerCookie(USER, ORG_A), null)).toBeNull();
  });

  it("a legacy bare value is still accepted (rewritten bound on the next switch)", () => {
    expect(parseWorkspacePointerCookie(ORG_A, USER)).toBe(ORG_A);
    expect(parseWorkspacePointerCookie(PERSONAL_WORKSPACE_ID, USER)).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("empty / malformed values are no pointer", () => {
    expect(parseWorkspacePointerCookie(undefined, USER)).toBeNull();
    expect(parseWorkspacePointerCookie("   ", USER)).toBeNull();
    expect(parseWorkspacePointerCookie(`${USER}:`, USER)).toBeNull();
  });
});

describe("the workspace list offers only what a switch can reach", () => {
  it("is exactly the relationships the validate_active_organization trigger accepts", () => {
    expect([...SWITCHABLE_ENGAGEMENT_RELATIONSHIPS].sort()).toEqual(
      ["employee", "external_manager", "manager", "owner", "viewer"],
    );
    // A learner link could never be selected — it must not be listed.
    expect(SWITCHABLE_ENGAGEMENT_RELATIONSHIPS as readonly string[]).not.toContain("student");
  });
});

describe("legibility — the label and the relationship a person reads", () => {
  const unnamed = { company: "Įmonė be pavadinimo", agency: "Agentūra be pavadinimo", team: "Komanda be pavadinimo", other: "Organizacija be pavadinimo" };
  const labels = (ws: WorkspaceInfo[]) => workspaceDisplayLabels(ws, { personal: "Asmeninė erdvė", unnamedOrganization: unnamed });

  it("an unnamed company whose company is a staffing agency reads as an agency", () => {
    const m = labels([personal, org({ id: ORG_A, organizationType: "company", companyType: "staffing_agency" })]);
    expect(m.get(ORG_A)).toBe("Agentūra be pavadinimo");
  });

  it("the relationship tells the owner's own organization from someone else's", () => {
    const rel = { owner: "Savininkas", manager: "Vadovas", employee: "Darbuotojas", other: "Narys" };
    expect(workspaceRelationshipLabel(org({ id: ORG_A, relationship: "owner" }), rel)).toBe("Savininkas");
    expect(workspaceRelationshipLabel(org({ id: ORG_B, relationship: "employee" }), rel)).toBe("Darbuotojas");
    expect(workspaceRelationshipLabel(org({ id: ORG_B, relationship: undefined }), rel)).toBe("Narys");
    expect(workspaceRelationshipLabel(personal, rel)).toBeNull();
  });
});
