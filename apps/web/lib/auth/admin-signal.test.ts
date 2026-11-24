import { describe, expect, it } from "vitest";
import { deriveIsAdmin } from "./admin-signal";

/**
 * Behaviour tests for the application-level admin signal. These are the
 * nine scenarios called out by the owner spec for the
 * fix/account-menu-logout-admin-visibility hotfix. The fix's whole
 * point is that an admin user keeps the admin badge regardless of the
 * workspace `active_role` they're viewing, as long as a
 * `profile_roles` row tagged 'admin' persists. `switchActiveRole`
 * is responsible for keeping that row present.
 */

describe("deriveIsAdmin — admin user with admin profile_roles row", () => {
  const profileRoles = [
    { role: "worker" },
    { role: "company" },
    { role: "agency" },
    { role: "customer" },
    { role: "admin" },
  ];

  it("active_role=admin → admin", () => {
    expect(
      deriveIsAdmin({ activeRole: "admin", profileRoles }),
    ).toBe(true);
  });

  it("active_role=worker → admin (badge survives switch to worker)", () => {
    expect(
      deriveIsAdmin({ activeRole: "worker", profileRoles }),
    ).toBe(true);
  });

  it("active_role=company → admin (badge survives switch to company)", () => {
    expect(
      deriveIsAdmin({ activeRole: "company", profileRoles }),
    ).toBe(true);
  });

  it("active_role=agency → admin (badge survives switch to agency)", () => {
    expect(
      deriveIsAdmin({ activeRole: "agency", profileRoles }),
    ).toBe(true);
  });

  it("active_role=customer → admin (badge survives switch to customer)", () => {
    expect(
      deriveIsAdmin({ activeRole: "customer", profileRoles }),
    ).toBe(true);
  });
});

describe("deriveIsAdmin — admin via legacy single-source signal only", () => {
  it("active_role=admin and no profile_roles row → still admin", () => {
    expect(
      deriveIsAdmin({ activeRole: "admin", profileRoles: [] }),
    ).toBe(true);
  });
});

describe("deriveIsAdmin — non-admin user", () => {
  const workerOnly = [{ role: "worker" }];

  it("active_role=worker, no admin row → not admin", () => {
    expect(
      deriveIsAdmin({ activeRole: "worker", profileRoles: workerOnly }),
    ).toBe(false);
  });

  it("active_role=company, no admin row → not admin", () => {
    expect(
      deriveIsAdmin({
        activeRole: "company",
        profileRoles: [{ role: "company" }],
      }),
    ).toBe(false);
  });

  it("active_role null, no admin row → not admin", () => {
    expect(deriveIsAdmin({ activeRole: null, profileRoles: [] })).toBe(false);
  });

  it("active_role undefined, no admin row → not admin", () => {
    expect(
      deriveIsAdmin({ activeRole: undefined, profileRoles: [] }),
    ).toBe(false);
  });

  it("worker / company / agency / customer rows alone do NOT promote to admin", () => {
    expect(
      deriveIsAdmin({
        activeRole: "worker",
        profileRoles: [
          { role: "worker" },
          { role: "company" },
          { role: "agency" },
          { role: "customer" },
        ],
      }),
    ).toBe(false);
  });
});

describe("deriveIsAdmin — role switch does not overwrite admin permission", () => {
  // Re-asserts the core invariant: the helper does NOT mutate input,
  // does NOT read external state, and is purely a function of the
  // signals passed in. Changing `activeRole` between worker/company/
  // agency/customer with a stable `profile_roles` admin row always
  // yields admin=true.
  const profileRoles = [{ role: "worker" }, { role: "admin" }];
  for (const role of ["worker", "company", "agency", "customer"] as const) {
    it(`role=${role} preserves admin when profile_roles carries admin`, () => {
      expect(
        deriveIsAdmin({ activeRole: role, profileRoles }),
      ).toBe(true);
    });
  }
});
