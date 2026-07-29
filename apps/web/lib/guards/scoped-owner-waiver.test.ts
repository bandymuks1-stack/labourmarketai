import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SCOPED_OWNER_WAIVERS,
  decideWaiver,
  evaluateFindings,
  waiverContextFromEnv,
  // The gate imports this EXACT module — there is no second copy of the rules
  // to drift, so what these tests prove is what CI enforces.
} from "../../../../.github/scripts/owner-waivers.mjs";

/**
 * SCOPED OWNER WAIVER — the mechanism that lets ONE reviewed transitional debt
 * pass the product gate without deleting the axiom (owner ruling 2026-07-29).
 *
 * Every case the ruling demanded is proven here. The default posture is BLOCK:
 * each test below removes exactly one condition and shows the gate closes.
 */

const REPO = resolve(__dirname, "..", "..", "..", "..");
const GATE = join(REPO, ".github", "scripts", "product-gate.mjs");

const MAP_FINDING = {
  code: "not_reflected_on_map",
  axiom: "A-01",
  what: "components/app/world-state/context-panel.tsx",
};
const WAIVER_FINDING = {
  code: "transitional_waiver_in_use",
  axiom: "A-09",
  what: "components/app/world-state/context-panel.tsx",
};
const BOTH = [MAP_FINDING, WAIVER_FINDING];

/** A context that satisfies every condition — the baseline the tests break. */
const ok = (over: Record<string, unknown> = {}) => ({
  pullRequest: 909,
  headSha: null,
  today: "2026-07-29",
  ...over,
});

describe("scoped waiver — the approved cases pass", () => {
  it("the exact #909 (W3) finding set is allowed", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: 909 }));
    expect(v.pass).toBe(true);
    expect(v.blockingFindings).toHaveLength(0);
    expect(v.waivedFindings).toHaveLength(2);
  });

  it("the exact #912 (W4) finding set is allowed", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: 912 }));
    expect(v.pass).toBe(true);
  });

  it("main's OWN push run is allowed after those PRs merged", () => {
    // Without this the gate turns main red the moment a waived PR merges —
    // the debt simply moved from the PR into the branch. It stays bounded:
    // every other constraint (file, code, axiom, subset, expiry) still holds,
    // and only `main` is listed.
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: "main" }));
    expect(v.pass).toBe(true);
  });

  it("…but main is still blocked once the waiver expires", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: "main", today: "2027-01-01" }));
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("expired");
  });

  it("…and a NEW violation on main still blocks", () => {
    const extra = { code: "second_dashboard", axiom: "A-01", what: "apps/web/x/page.tsx" };
    const v = evaluateFindings([...BOTH, extra], ok({ pullRequest: null, branch: "main" }));
    expect(v.pass).toBe(false);
  });

  it("the decision names owner, scope, expiry and what removes it", () => {
    const d = decideWaiver(MAP_FINDING, ok());
    expect(d.waived).toBe(true);
    // `waived: true` guarantees a waiver; TS cannot see that through the JS.
    const w = d.waiver!;
    expect(w.owner).toMatch(/Owner ruling/);
    expect(w.scope).toMatch(/W3.*W4/);
    expect(w.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.resolvedBy).toBe("W6-map-slice");
    expect(w.reason.length).toBeGreaterThan(80);
  });
});

describe("scoped waiver — every missing condition BLOCKS", () => {
  it("no waiver at all → blocked", () => {
    const v = evaluateFindings(BOTH, ok(), []);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("no-waiver");
  });

  it("wrong PR → blocked", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: 999 }));
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("not a PR and not a covered branch → blocked", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: null }));
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("a push to some OTHER branch → blocked", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: "feat/anything" }));
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("wrong head SHA → blocked (when the waiver pins SHAs)", () => {
    const pinned = [{ ...SCOPED_OWNER_WAIVERS[0], approvedHeadShas: ["abc1234"] }];
    const bad = evaluateFindings(BOTH, ok({ headSha: "deadbee" }), pinned);
    expect(bad.pass).toBe(false);
    expect(bad.blockingFindings[0].decision.rejection).toBe("sha-not-covered");
    // …and the matching SHA passes, so the check is real in both directions.
    expect(evaluateFindings(BOTH, ok({ headSha: "abc1234" }), pinned).pass).toBe(true);
  });

  it("expired → blocked", () => {
    const v = evaluateFindings(BOTH, ok({ today: "2027-01-01" }));
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("expired");
    expect(v.blockingFindings[0].decision.detail).toMatch(/W6-map-slice/);
  });

  it("an EXTRA finding outside the reviewed set → blocked", () => {
    // The teeth of "any additional diff re-triggers review".
    const extra = {
      code: "second_dashboard",
      axiom: "A-01",
      what: "apps/web/app/[locale]/dashboard/other/page.tsx",
    };
    const v = evaluateFindings([...BOTH, extra], ok());
    expect(v.pass).toBe(false);
    expect(v.blockingFindings.map((b) => b.finding.code)).toEqual(["second_dashboard"]);
  });

  it("the SAME code on a DIFFERENT file → blocked", () => {
    const elsewhere = { ...MAP_FINDING, what: "components/app/world-state/other-panel.tsx" };
    const v = evaluateFindings([elsewhere], ok());
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("no-waiver");
  });

  it("an axiom outside A-01 / A-09 → blocked", () => {
    const v = evaluateFindings([{ ...MAP_FINDING, axiom: "A-06" }], ok());
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("axiom-not-waivable");
  });

  it("a waiver with no recorded owner approval → blocked", () => {
    const unapproved = [{ ...SCOPED_OWNER_WAIVERS[0], owner: "" }];
    const v = evaluateFindings(BOTH, ok(), unapproved);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("no-waiver");
  });
});

describe("scoped waiver — W5 and everything new can NEVER inherit it", () => {
  it("the W5 pull request is not covered", () => {
    // #915 is W5. Its number is not in the waiver, so even the identical
    // finding on the identical file is blocked.
    const v = evaluateFindings(BOTH, ok({ pullRequest: 915 }));
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("the waiver names ONLY the two W3/W4 pull requests", () => {
    expect(SCOPED_OWNER_WAIVERS).toHaveLength(1);
    expect(SCOPED_OWNER_WAIVERS[0].pullRequests).toEqual([909, 912]);
    expect(SCOPED_OWNER_WAIVERS[0].files).toEqual([
      "components/app/world-state/context-panel.tsx",
    ]);
  });

  it("a future W6 map fix makes the waiver unnecessary, not permanent", () => {
    // When the panel IS reflected on the map, the finding stops being produced;
    // with no finding there is nothing to waive, and the expiry then removes
    // the record itself.
    const v = evaluateFindings([], ok());
    expect(v.pass).toBe(true);
    expect(v.waivedFindings).toHaveLength(0);
    expect(SCOPED_OWNER_WAIVERS[0].resolvedBy).toBe("W6-map-slice");
  });
});

describe("scoped waiver — the axiom and its diagnostic survive", () => {
  it("the gate still DETECTS and PRINTS the violation when waived", () => {
    const gate = readFileSync(GATE, "utf8");
    // The finding is never filtered out of `findings`…
    expect(gate).toMatch(/for \(const f of findings\) \{[\s\S]{0,200}::\$\{level\}/);
    // …and a waived run says so explicitly rather than going quiet.
    expect(gate).toMatch(/the violations above are REAL and still stand/);
    expect(gate).toMatch(/PRODUCT_GATE_PASS_WITH_SCOPED_TRANSITIONAL_WAIVER/);
  });

  it("the A-01 rule itself is untouched", () => {
    const gate = readFileSync(GATE, "utf8");
    expect(gate).toContain("not_reflected_on_map");
    const axioms = readFileSync(
      join(REPO, "apps", "web", "lib", "product-gate", "axioms.ts"),
      "utf8",
    );
    expect(axioms).toMatch(/id: "A-01"/);
    expect(axioms).toMatch(/AI-FIRST/);
  });

  it("the waived run reports owner, scope, expiry and the removal step", () => {
    const gate = readFileSync(GATE, "utf8");
    for (const line of ["waiver      ", "owner       ", "scope       ", "expires     ", "removed by  "]) {
      expect(gate).toContain(line);
    }
  });
});

describe("scoped waiver — the run context", () => {
  it("reads the PR number from the CI ref", () => {
    const ctx = waiverContextFromEnv(
      { GITHUB_REF: "refs/pull/909/merge", GATE_TODAY: "2026-08-01" },
      new Date("2026-08-01T00:00:00Z"),
    );
    expect(ctx.pullRequest).toBe(909);
    expect(ctx.today).toBe("2026-08-01");
  });

  it("is not a PR when nothing says so", () => {
    expect(waiverContextFromEnv({}, new Date("2026-08-01T00:00:00Z")).pullRequest).toBeNull();
  });
});
