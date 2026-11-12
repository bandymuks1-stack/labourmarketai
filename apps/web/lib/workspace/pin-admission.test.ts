import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONVERSATION_ACTIONS } from "@/lib/conversation/action-registry";
import { ROLE_GATED_PREFIXES } from "@/lib/auth/role-gated-routes";
import { HOME_GOALS } from "@/lib/navigation/home-goals";
import { ORGANIZATION_WORK_AREAS, PERSONAL_WORK_AREAS } from "@/lib/navigation/work-areas";
import { CHIP_GATE_ROUTE, admittedPins, pinIsAdmitted, withheldPins } from "./pin-admission";
import { isPinnableRef } from "./pins-model";

/**
 * A PIN NEVER GRANTS ACCESS (owner P0 No. 1, 2026-11-12): the home draws a
 * pin only when the gating that already exists admits the person. These tests
 * drive the real gate table and the real action registry — a pin to a place
 * the person may not open is not drawn, whoever saved it and whenever.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const NOBODY = { heldRoles: [], opensCompanySpace: false };
const WORKER = { heldRoles: ["worker"], opensCompanySpace: false };
const OWNER = { heldRoles: ["worker", "company"], opensCompanySpace: true };
const MANAGER_BY_MEMBERSHIP = { heldRoles: ["worker"], opensCompanySpace: true };
const CUSTOMER = { heldRoles: ["customer"], opensCompanySpace: false };
const EVERYTHING = { heldRoles: ["worker", "company", "agency", "customer", "admin"], opensCompanySpace: true };

describe("a view pin follows the ONE route gate table", () => {
  it("every gated prefix: a pin to it is hidden from a person the gate refuses", () => {
    for (const row of ROLE_GATED_PREFIXES) {
      const ref = `link:${row.prefix}`;
      if (!isPinnableRef(ref)) continue;
      expect(pinIsAdmitted(ref, NOBODY), ref).toBe(false);
    }
    // The table is not vacuous: it holds the employer space and the job board.
    expect(ROLE_GATED_PREFIXES.map((r) => r.prefix)).toEqual(
      expect.arrayContaining(["/dashboard/company", "/dashboard/opportunities", "/dashboard/buyer"]),
    );
  });

  it("a worker who pinned an employer page (or was handed one) does not see it", () => {
    for (const ref of [
      "link:/dashboard/company",
      "link:/dashboard/company/people",
      "link:/dashboard/company/needs#demand-intake",
      "link:/dashboard/company/scouting?tab=pool",
    ]) {
      expect(pinIsAdmitted(ref, WORKER), ref).toBe(false);
      expect(pinIsAdmitted(ref, OWNER), ref).toBe(true);
      // Membership in the active workspace opens the employer space too.
      expect(pinIsAdmitted(ref, MANAGER_BY_MEMBERSHIP), ref).toBe(true);
    }
  });

  it("the job board is the worker's; the customer's requests are the customer's", () => {
    expect(pinIsAdmitted("link:/dashboard/opportunities", WORKER)).toBe(true);
    expect(pinIsAdmitted("link:/dashboard/opportunities", CUSTOMER)).toBe(false);
    expect(pinIsAdmitted("link:/dashboard/buyer", CUSTOMER)).toBe(true);
    expect(pinIsAdmitted("link:/dashboard/buyer", WORKER)).toBe(false);
  });

  it("an operator page is never drawn as a pin, whatever the person holds", () => {
    expect(pinIsAdmitted("link:/dashboard/admin", EVERYTHING)).toBe(false);
    expect(pinIsAdmitted("link:/dashboard/admin/users", EVERYTHING)).toBe(false);
    expect(pinIsAdmitted("link:/dashboard/talent", EVERYTHING)).toBe(false);
  });

  it("an ungated page is open to every signed-in person", () => {
    for (const ref of ["link:/dashboard/journal", "link:/dashboard/planning", "link:/dashboard/communication"]) {
      expect(pinIsAdmitted(ref, WORKER), ref).toBe(true);
      expect(pinIsAdmitted(ref, CUSTOMER), ref).toBe(true);
    }
  });
});

describe("an action pin follows the action registry's own allowed roles", () => {
  it("every registered action: hidden from a person holding none of its roles", () => {
    expect(CONVERSATION_ACTIONS.length).toBeGreaterThan(10);
    for (const action of CONVERSATION_ACTIONS) {
      const ref = `f:${action.id}`;
      if (!isPinnableRef(ref)) continue;
      expect(pinIsAdmitted(ref, NOBODY), ref).toBe(false);
      const holder = { heldRoles: [action.allowedRoles[0]], opensCompanySpace: false };
      expect(pinIsAdmitted(ref, holder), ref).toBe(true);
    }
  });

  it("an employer action is hidden from a worker and shown to an owner or a manager by membership", () => {
    const ref = "f:company.create-demand";
    expect(isPinnableRef(ref)).toBe(true);
    expect(pinIsAdmitted(ref, WORKER)).toBe(false);
    expect(pinIsAdmitted(ref, CUSTOMER)).toBe(false);
    expect(pinIsAdmitted(ref, OWNER)).toBe(true);
    expect(pinIsAdmitted(ref, MANAGER_BY_MEMBERSHIP)).toBe(true);
  });

  it("membership opens ONLY the company family — never a worker- or customer-only action", () => {
    const membershipOnly = { heldRoles: [], opensCompanySpace: true };
    for (const action of CONVERSATION_ACTIONS) {
      const ref = `f:${action.id}`;
      if (!isPinnableRef(ref)) continue;
      const companyFamily = action.allowedRoles.some((r) => r === "company" || r === "agency");
      expect(pinIsAdmitted(ref, membershipOnly), ref).toBe(companyFamily);
    }
  });

  it("a pin to an action the registry does not hold is a dead chip and is not drawn", () => {
    expect(isPinnableRef("f:company.no-such-action")).toBe(true);
    expect(pinIsAdmitted("f:company.no-such-action", EVERYTHING)).toBe(false);
  });
});

describe("a bare chip reference follows the route its flow belongs to", () => {
  it("every bare reference the pin model accepts is classified — none falls through", () => {
    const model = read("lib/workspace/pins-model.ts");
    const lists = [...model.matchAll(/re: \/\^\(([a-z:|-]+)\)\$\//g)].map((m) => m[1].split("|"));
    const bare = lists.flat().filter((id) => id !== "project" && id !== "demand");
    expect(bare.length).toBeGreaterThanOrEqual(16);
    for (const id of bare) {
      expect(isPinnableRef(id), id).toBe(true);
      expect(id in CHIP_GATE_ROUTE, `${id} has no gate classification`).toBe(true);
    }
    // And nothing is classified that the model would not store.
    for (const id of Object.keys(CHIP_GATE_ROUTE)) expect(isPinnableRef(id), id).toBe(true);
  });

  it("employer flows are hidden from a worker; the job search from a non-worker", () => {
    for (const ref of ["candidates", "agency:demand", "agency:progress", "edu:create", "edu:cohort", "edu:assign"]) {
      expect(pinIsAdmitted(ref, WORKER), ref).toBe(false);
      expect(pinIsAdmitted(ref, OWNER), ref).toBe(true);
    }
    expect(pinIsAdmitted("jobs", WORKER)).toBe(true);
    expect(pinIsAdmitted("jobs", CUSTOMER)).toBe(false);
    for (const ref of ["logwork", "cv", "profile", "projects", "agenda", "offers"]) {
      expect(pinIsAdmitted(ref, WORKER), ref).toBe(true);
    }
  });

  it("an entity pin follows its area: a demand is the employer's, a project is RLS's to decide", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(pinIsAdmitted(`demand:${id}`, WORKER)).toBe(false);
    expect(pinIsAdmitted(`demand:${id}`, OWNER)).toBe(true);
    expect(pinIsAdmitted(`project:${id}`, WORKER)).toBe(true);
  });
});

describe("nothing unknown is ever drawn", () => {
  it.each([
    "link:https://evil.example",
    "link:/auth/login",
    "link:/dashboard/../admin",
    "javascript:alert(1)",
    "",
    "f:",
    "unknown-chip",
  ])("%s", (ref) => {
    expect(pinIsAdmitted(ref, EVERYTHING)).toBe(false);
  });
});

describe("the home applies it before the row sees a pin", () => {
  it("admittedPins keeps order and drops what the person may not open", () => {
    const pins = [
      { ref: "link:/dashboard/company/people", label: "People" },
      { ref: "logwork", label: "Record work" },
      { ref: "f:company.create-demand", label: "Need" },
      { ref: "link:/dashboard/journal", label: "Journal" },
    ];
    expect(admittedPins(pins, WORKER).map((p) => p.ref)).toEqual(["logwork", "link:/dashboard/journal"]);
    expect(admittedPins(pins, OWNER)).toHaveLength(4);
    expect(admittedPins(pins, NOBODY).map((p) => p.ref)).toEqual(["logwork", "link:/dashboard/journal"]);
  });

  it("the pins not drawn are exactly the rest — nothing is lost, nothing is in both", () => {
    const pins = [
      { ref: "link:/dashboard/company/people" },
      { ref: "logwork" },
      { ref: "f:company.create-demand" },
      { ref: "link:/dashboard/journal" },
      { ref: "link:/dashboard/admin" },
    ];
    for (const who of [NOBODY, WORKER, OWNER, EVERYTHING]) {
      const drawn = admittedPins(pins, who).map((p) => p.ref);
      const held = withheldPins(pins, who).map((p) => p.ref);
      expect([...drawn, ...held].sort()).toEqual(pins.map((p) => p.ref).sort());
      expect(drawn.filter((r) => held.includes(r))).toEqual([]);
    }
    expect(withheldPins(pins, WORKER).map((p) => p.ref)).toEqual([
      "link:/dashboard/company/people",
      "f:company.create-demand",
      "link:/dashboard/admin",
    ]);
  });

  it("the CV — outside /dashboard — is offered through the reference the pin model already has", () => {
    const places = read("lib/workspace/pin-places-server.ts");
    expect(places).toMatch(/"\/cv": "cv"/);
    expect(places).toMatch(/const ref = PLACE_REF\[href\] \?\? `link:\$\{href\}`;/);
    expect(isPinnableRef("link:/cv")).toBe(false);
    expect(isPinnableRef("cv")).toBe(true);
    expect(pinIsAdmitted("cv", WORKER)).toBe(true);
    expect(HOME_GOALS.worker.some((g) => g.href === "/cv")).toBe(true);
  });

  it("the dashboard root filters the stored pins on the server and hands the row only the admitted ones", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/const drawnPins = pins \? admittedPins\(pins, goalAdmission\) : null;/);
    expect(page).toMatch(/pins=\{drawnPins\}/);
    expect(page).not.toMatch(/pins=\{pins\}/);
    // The admission facts are the layout gate's own (request-cached readers).
    expect(page).toMatch(/const goalAdmission = await loadGoalAdmission\(\);/);
  });

  it("what the row OFFERS to pin is filtered by the same admission", () => {
    const places = read("lib/workspace/pin-places-server.ts");
    expect(places).toMatch(/!isPinnableRef\(ref\) \|\| !routeIsAdmitted\(href, input\.admission\)/);
  });

  it("every goal and area a home offers to pin is admitted for the person that home is for", () => {
    for (const goal of HOME_GOALS.worker) {
      const ref = `link:${goal.href}`;
      if (isPinnableRef(ref)) expect(pinIsAdmitted(ref, WORKER), ref).toBe(true);
    }
    for (const area of PERSONAL_WORK_AREAS) {
      const ref = `link:${area.href}`;
      if (isPinnableRef(ref)) expect(pinIsAdmitted(ref, WORKER), ref).toBe(true);
    }
    for (const place of [...HOME_GOALS.company, ...HOME_GOALS.agency, ...ORGANIZATION_WORK_AREAS]) {
      const ref = `link:${place.href}`;
      expect(isPinnableRef(ref), ref).toBe(true);
      expect(pinIsAdmitted(ref, MANAGER_BY_MEMBERSHIP), ref).toBe(true);
    }
  });
});
