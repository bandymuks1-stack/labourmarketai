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

/**
 * SYNTHETIC fixture. The LIVE record was deleted in W6 (the map shipped, the
 * answer became a real yes) — the mechanism itself stays proven on this
 * fixture so a future owner ruling can add a record with confidence.
 */
const FIXTURE_WAIVER = {
  id: "test-waiver",
  axioms: ["A-01", "A-09"],
  scope: "W3 (Context Panel) + W4 (AI Workspace)",
  pullRequests: [909, 912],
  approvedHeadShas: [] as string[],
  postMergeBranches: ["main"],
  files: ["components/app/world-state/context-panel.tsx"],
  expectedFindings: [
    { code: "not_reflected_on_map", file: "components/app/world-state/context-panel.tsx" },
    { code: "transitional_waiver_in_use", file: "components/app/world-state/context-panel.tsx" },
  ],
  reason:
    "Synthetic copy of the retired W3/W4 record, kept so every constraint of the mechanism stays executable and provably enforced.",
  resolvedBy: "W6-map-slice",
  expiresAt: "2026-10-31",
  owner: "Owner ruling 2026-07-29 — scoped transitional waiver (fixture copy).",
};
const FIXTURES = [FIXTURE_WAIVER];


/** A context that satisfies every condition — the baseline the tests break. */
const ok = (over: Record<string, unknown> = {}) => ({
  changedFiles: ["apps/web/components/app/world-state/context-panel.tsx"],
  pullRequest: 909,
  headSha: null,
  today: "2026-07-29",
  ...over,
});

describe("scoped waiver — the approved cases pass", () => {
  it("the exact #909 (W3) finding set is allowed", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: 909 }), FIXTURES);
    expect(v.pass).toBe(true);
    expect(v.blockingFindings).toHaveLength(0);
    expect(v.waivedFindings).toHaveLength(2);
  });

  it("the exact #912 (W4) finding set is allowed", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: 912 }), FIXTURES);
    expect(v.pass).toBe(true);
  });

  it("main's OWN push run is allowed after those PRs merged", () => {
    // Without this the gate turns main red the moment a waived PR merges —
    // the debt simply moved from the PR into the branch. It stays bounded:
    // every other constraint (file, code, axiom, subset, expiry) still holds,
    // and only `main` is listed.
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: "main" }), FIXTURES);
    expect(v.pass).toBe(true);
  });

  it("…but main is still blocked once the waiver expires", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: "main", today: "2027-01-01" }), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("expired");
  });

  it("…and a NEW violation on main still blocks", () => {
    const extra = { code: "second_dashboard", axiom: "A-01", what: "apps/web/x/page.tsx" };
    const v = evaluateFindings([...BOTH, extra], ok({ pullRequest: null, branch: "main" }), FIXTURES);
    expect(v.pass).toBe(false);
  });

  it("the decision names owner, scope, expiry and what removes it", () => {
    const d = decideWaiver(MAP_FINDING, ok(), FIXTURES);
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
    const v = evaluateFindings(BOTH, ok({ pullRequest: 999 }), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("not a PR and not a covered branch → blocked", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: null }), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("a push to some OTHER branch → blocked", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: null, branch: "feat/anything" }), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("wrong head SHA → blocked (when the waiver pins SHAs)", () => {
    const pinned = [{ ...FIXTURE_WAIVER, approvedHeadShas: ["abc1234"] }];
    const bad = evaluateFindings(BOTH, ok({ headSha: "deadbee" }), pinned);
    expect(bad.pass).toBe(false);
    expect(bad.blockingFindings[0].decision.rejection).toBe("sha-not-covered");
    // …and the matching SHA passes, so the check is real in both directions.
    expect(evaluateFindings(BOTH, ok({ headSha: "abc1234" }), pinned).pass).toBe(true);
  });

  it("expired → blocked", () => {
    const v = evaluateFindings(BOTH, ok({ today: "2027-01-01" }), FIXTURES);
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
    const v = evaluateFindings([...BOTH, extra], ok(), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings.map((b) => b.finding.code)).toEqual(["second_dashboard"]);
  });

  it("the SAME code on a DIFFERENT file → blocked", () => {
    const elsewhere = { ...MAP_FINDING, what: "components/app/world-state/other-panel.tsx" };
    const v = evaluateFindings([elsewhere], ok(), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("no-waiver");
  });

  it("an axiom outside A-01 / A-09 → blocked", () => {
    const v = evaluateFindings([{ ...MAP_FINDING, axiom: "A-06" }], ok(), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("axiom-not-waivable");
  });

  it("a waiver with no recorded owner approval → blocked", () => {
    const unapproved = [{ ...FIXTURE_WAIVER, owner: "" }];
    const v = evaluateFindings(BOTH, ok(), unapproved);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("no-waiver");
  });
});

describe("scoped waiver — pre-existing debt vs a new change", () => {
  const PANEL = "apps/web/components/app/world-state/context-panel.tsx";

  it("an UNRELATED PR is not blamed for debt already in the base branch", () => {
    // After the waived PRs merge, the gate reports this finding on EVERY run,
    // because it validates the registry as a whole. Blaming a PR that never
    // opened the file would make the merged waiver a permanent repo-wide block
    // — the exact failure the mechanism exists to remove.
    const v = evaluateFindings(
      BOTH,
      ok({ pullRequest: 4242, changedFiles: ["apps/web/lib/something-else.ts"] }),
      FIXTURES,
    );
    expect(v.pass).toBe(true);
  });

  it("…but a NEW PR that EDITS the waived file is blocked", () => {
    // This is the line that keeps the exception from being inherited: touch the
    // waived file and you must be one of the listed PRs.
    const v = evaluateFindings(BOTH, ok({ pullRequest: 4242, changedFiles: [PANEL] }), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
    expect(v.blockingFindings[0].decision.detail).toMatch(/MODIFIES/);
  });

  it("unknown changed files are treated as touching everything (cautious)", () => {
    const v = evaluateFindings(BOTH, ok({ pullRequest: 4242, changedFiles: null }), FIXTURES);
    expect(v.pass).toBe(false);
  });

  it("expiry still kills it, even for an unrelated PR", () => {
    const v = evaluateFindings(
      BOTH,
      ok({ pullRequest: 4242, changedFiles: ["apps/web/lib/x.ts"], today: "2027-01-01" }),
      FIXTURES,
    );
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("expired");
  });
});

describe("scoped waiver — W5 and everything new can NEVER inherit it", () => {
  it("the W5 pull request is not covered", () => {
    // #915 is W5. Its number is not in the waiver, so even the identical
    // finding on the identical file is blocked.
    const v = evaluateFindings(BOTH, ok({ pullRequest: 915 }), FIXTURES);
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("pr-not-covered");
  });

  it("the LIVE waiver list holds exactly ONE record, and it is the /create-cv ruling", () => {
    // "waiver negali likti vien todėl, kad CI žalias" — the W3/W4 record died
    // with its debt in W6, leaving the list empty. The entry below is a NEW
    // owner ruling (PUBLIC BETA TRAIN V3 §2.1, 2026-08-10), not a leftover.
    //
    // Pinning the COUNT is the point: a second record may only ever appear
    // with a second owner ruling, and this assertion is what forces that
    // conversation instead of letting the list grow quietly.
    expect(SCOPED_OWNER_WAIVERS).toHaveLength(1);
    const w = SCOPED_OWNER_WAIVERS[0];
    expect(w.id).toBe("public-acquisition-route-create-cv");
    expect(w.axioms).toEqual(["A-01"]);
    expect(w.pullRequests).toEqual([1119]);
    expect(w.owner).toMatch(/PUBLIC BETA TRAIN V3/);
    // A waiver with no named resolution is a permanent exception wearing a
    // deadline. This one names the constitution decision that deletes it.
    expect(w.resolvedBy).toMatch(/gate-learns-public-acquisition-route-category/);
    expect(w.expiresAt).toBe("2026-12-31");
  });

  it("the live record excuses SIX findings and no seventh", () => {
    // The exact set the gate produced on 2026-08-10 for PR #1119. If a future
    // change to the registry or the gate adds a seventh violation on this
    // route, the subset rule un-waives the whole run — and this assertion is
    // what makes that a deliberate edit rather than a surprise in CI.
    const w = SCOPED_OWNER_WAIVERS[0];
    expect(w.expectedFindings.map((f) => f.code).sort()).toEqual([
      "not_ai_controlled",
      "not_reflected_on_map",
      "not_world_state_driven",
      "requires_leaving_workspace",
      "requires_new_page",
      "world_state_cannot_control_it",
    ]);
    for (const f of w.expectedFindings) expect(f.file).toBe("/create-cv");
  });

  it("the live record lists the page PATH, not only the route id — else it leaks", () => {
    // THE BUG THIS PINS. `decideWaiver` matches a finding by `finding.what`,
    // which for a screen is the ROUTE ("/create-cv"). But `touchesWaivedFile`
    // compares `files` against the real CHANGED FILE PATHS in the diff. With
    // only the route id listed, NO changed path could ever end with
    // "/create-cv", every unlisted PR would be classified "unrelated", and it
    // would inherit the waiver — the exact "nothing new can inherit it"
    // guarantee this mechanism sells. Listing the page path closes it.
    const w = SCOPED_OWNER_WAIVERS[0];
    expect(w.files).toContain("/create-cv");
    expect(w.files).toContain("apps/web/app/[locale]/(marketing)/create-cv/page.tsx");

    // Negative control: an unlisted PR whose diff really does contain the page
    // must be REFUSED, not silently excused.
    const findings = w.expectedFindings.map((f) => ({
      code: f.code,
      axiom: "A-01",
      what: f.file,
    }));
    const blocked = evaluateFindings(
      findings,
      {
        changedFiles: ["apps/web/app/[locale]/(marketing)/create-cv/page.tsx"],
        pullRequest: 9999,
        headSha: null,
        today: "2026-08-10",
      },
      SCOPED_OWNER_WAIVERS,
    );
    expect(blocked.pass).toBe(false);
    expect(blocked.blockingFindings[0].decision.rejection).toBe("pr-not-covered");

    // …and the listed PR still passes, so the control above proves the guard,
    // not a broken waiver.
    const allowed = evaluateFindings(
      findings,
      {
        changedFiles: ["apps/web/app/[locale]/(marketing)/create-cv/page.tsx"],
        pullRequest: 1119,
        headSha: null,
        today: "2026-08-10",
      },
      SCOPED_OWNER_WAIVERS,
    );
    expect(allowed.pass).toBe(true);
  });

  it("the live record expires, and expiry blocks EVERY pull request", () => {
    // Deliberate and documented: `decideWaiver` tests `expiresAt` BEFORE the
    // unrelated-PR escape, and rule 6c re-validates the whole registry on every
    // run — so past the date these findings block the repository, not just this
    // route. That is the mechanism's pressure to RESOLVE the debt rather than
    // renew it, and this test is where that consequence is written down.
    const w = SCOPED_OWNER_WAIVERS[0];
    const findings = w.expectedFindings.map((f) => ({
      code: f.code,
      axiom: "A-01",
      what: f.file,
    }));
    const v = evaluateFindings(
      findings,
      // An unrelated PR: different number, and a diff that never opens the page.
      { changedFiles: ["apps/web/lib/unrelated.ts"], pullRequest: 4242, headSha: null, today: "2027-01-01" },
      SCOPED_OWNER_WAIVERS,
    );
    expect(v.pass).toBe(false);
    expect(v.blockingFindings[0].decision.rejection).toBe("expired");
  });

  it("a future W6 map fix makes the waiver unnecessary, not permanent", () => {
    // When the panel IS reflected on the map, the finding stops being produced;
    // with no finding there is nothing to waive, and the expiry then removes
    // the record itself.
    const v = evaluateFindings([], ok(), FIXTURES);
    expect(v.pass).toBe(true);
    expect(v.waivedFindings).toHaveLength(0);
    expect(FIXTURE_WAIVER.resolvedBy).toBe("W6-map-slice");
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
