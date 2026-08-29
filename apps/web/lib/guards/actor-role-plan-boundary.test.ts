import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ENTITY_TYPES } from "@/lib/product-gate/entity-model";
import { LIVE_ROLE_IDS } from "@/lib/config/roles";
import { KNOWN_HELD_ROLES } from "@/lib/auth/profile-roles";
import { MEMBERSHIP_ROLES } from "@/lib/company/memberships";

/**
 * FOUR CONCEPTS, KEPT APART.
 *
 * The platform already distinguishes these, and the distinction is load-bearing
 * rather than tidy. This guard exists so a future slice — the AI-actor one
 * above all — cannot quietly collapse them, because once "what you are" and
 * "what you do" share a column there is no way back without a migration and a
 * data archaeology exercise.
 *
 *   1. ACTOR TYPE          what an actor IS.
 *                          `entity-model.ts` ENTITY_TYPES — an OPEN registry
 *                          that ALREADY declares `ai_agent`.
 *   2. PARTICIPATION MODE  what a person signs up to DO.
 *                          `lib/config/roles.ts` catalogue → `Role` →
 *                          `profile_roles.role`.
 *   3. PERMISSION ROLE     authority INSIDE an organization.
 *                          `MembershipRole` / `GovernanceRole`,
 *                          `relationship_slug`, `confirmer_role`.
 *   4. PLAN / ENTITLEMENT  what an actor may spend.
 *                          `usage_cost_events` — `plan_key`, `payer`,
 *                          `feature_code`.
 *
 * ## What was actually measured
 *
 * Production `profile_roles.role`: worker 31, company 10, agency 4,
 * customer 2, **admin 1**. The onboarding union named four of those five, so
 * it was already narrower than the column it describes. Nothing was broken —
 * every read path is typed `{ role: string }` — but the gap was invisible and
 * a page legitimately requiring the admin role could not be typed.
 *
 * `ai_agent` appears in NO role vocabulary today. That is the correct state
 * and this guard pins it.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

describe("actor type is not a participation role", () => {
  it("the entity registry declares ai_agent, and stays open", () => {
    expect(ENTITY_TYPES, "ai_agent is a declared entity type").toContain("ai_agent");
    expect(ENTITY_TYPES, "so is person — both are actors").toContain("person");
    // The open form is what lets a new actor type exist without editing a
    // union. Its absence is the ceiling #1302 removed for languages.
    expect(
      read("lib/product-gate/entity-model.ts"),
      "EntityType stays open (`string & {}`) — a closed union is a ceiling",
    ).toMatch(/EntityType\s*=\s*\(typeof ENTITY_TYPES\)\[number\]\s*\|\s*\(string & \{\}\)/);
  });

  it("no actor type has leaked into any role vocabulary", () => {
    // The conflation this whole guard exists to prevent. An AI agent that does
    // work holds the `worker` participation mode like anyone else; what it IS
    // lives in a different field entirely.
    for (const actorType of ["ai_agent", "person", "organization"]) {
      expect(
        LIVE_ROLE_IDS as readonly string[],
        `${actorType} is an actor type, never a participation mode`,
      ).not.toContain(actorType);
      expect(
        KNOWN_HELD_ROLES as readonly string[],
        `${actorType} is an actor type, never a held profile role`,
      ).not.toContain(actorType);
      expect(
        MEMBERSHIP_ROLES as readonly string[],
        `${actorType} is an actor type, never an organization permission role`,
      ).not.toContain(actorType);
    }
  });
});

describe("participation mode has ONE source", () => {
  it("Role is derived from the catalogue, not re-declared beside it", () => {
    const actions = read("lib/auth/actions.ts");
    expect(
      actions,
      "Role derives from LiveRoleId — one vocabulary, one source",
    ).toMatch(/export type Role = LiveRoleId;/);
    // The negative control for the line above: the old hand-kept copy must be
    // gone, or the two could drift apart again silently.
    expect(
      actions,
      "the second hand-kept copy of the four ids is gone",
    ).not.toMatch(/export type Role =\s*"worker"/);
  });

  it("ROLE_ORDER stays a permutation of the live ids — order is load-bearing", () => {
    // The FIRST entry becomes the primary workspace, so the order carries
    // meaning and stays hand-written. This catches the only drift that
    // matters: a role added to the catalogue and forgotten here would never
    // be selectable as primary, silently.
    const actions = read("lib/auth/actions.ts");
    const declared = actions.match(/const ROLE_ORDER: Role\[\] = \[([^\]]*)\]/);
    expect(declared, "ROLE_ORDER is declared").not.toBeNull();
    const ids = (declared?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    expect([...ids].sort(), "same set as LIVE_ROLE_IDS").toEqual(
      [...LIVE_ROLE_IDS].sort(),
    );
  });

  it("the catalogue still carries exactly the live ids the union names", () => {
    expect([...LIVE_ROLE_IDS].sort()).toEqual(
      ["agency", "company", "customer", "worker"].sort(),
    );
  });
});

describe("what a profile may HOLD is wider than what it may onboard into", () => {
  it("admin is representable as a held role", () => {
    // Production holds exactly one. Before this it was unnameable in types.
    expect(KNOWN_HELD_ROLES as readonly string[]).toContain("admin");
  });

  it("but admin is NOT an onboarding participation mode", () => {
    // Nobody signs up as an admin — it is granted out of band by
    // `admin:grant-superadmin --apply` and read by lib/auth/superadmin.ts.
    expect(LIVE_ROLE_IDS as readonly string[]).not.toContain("admin");
  });

  it("every onboarding mode is also a holdable role", () => {
    for (const id of LIVE_ROLE_IDS) {
      expect(
        KNOWN_HELD_ROLES as readonly string[],
        `${id} can be onboarded into, so it must be holdable`,
      ).toContain(id);
    }
  });

  it("the held-role type stays open", () => {
    expect(
      read("lib/auth/profile-roles.ts"),
      "a value the column can hold must be representable",
    ).toMatch(/HeldProfileRole\s*=\s*\(typeof KNOWN_HELD_ROLES\)\[number\]\s*\|\s*\(string & \{\}\)/);
  });
});

describe("permission role and plan are separate vocabularies", () => {
  it("organization authority is its own closed set, and shares only 'admin'", () => {
    expect([...MEMBERSHIP_ROLES].sort()).toEqual(
      ["admin", "external_manager", "manager", "member", "owner"].sort(),
    );
    // `owner` and `member` describe authority inside ONE organization. They
    // are not things a person signs up as, and must never appear as one.
    for (const permission of ["owner", "manager", "member", "external_manager"]) {
      expect(
        LIVE_ROLE_IDS as readonly string[],
        `${permission} is authority inside an org, not a participation mode`,
      ).not.toContain(permission);
    }
  });

  it("entitlement lives on the usage event, not on the role", () => {
    // Concept 4 has no TypeScript union to conflate — it is data on
    // usage_cost_events (plan_key / payer / feature_code). This asserts the
    // absence stays an absence: the day a `plan` field appears on a role row,
    // pricing and identity have merged.
    const roles = read("lib/config/roles.ts");
    expect(roles, "no plan/price/entitlement field on a role row").not.toMatch(
      /\b(plan_key|planKey|priceId|entitlement)\b/,
    );
  });
});
