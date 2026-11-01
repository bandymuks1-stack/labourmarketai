/**
 * `personalIntroMayShow` — the S2 block's visibility decided BEFORE the slow
 * readiness read (home CLS P0, 2026-10-26).
 *
 * The page reserves the block's space only when this says `true`, and skips
 * the read entirely when it says `false`. Both are safe only if `false` can
 * never hide a block the full model would have shown — so the predicate is
 * checked against `derivePersonalWorkspaceIntro` over EVERY combination of
 * the facts it decides on and the slow facts it does not see.
 */
import { describe, expect, it } from "vitest";

import type { WorkerReadiness } from "@/lib/player-card/readiness";

import { derivePersonalWorkspaceIntro, personalIntroMayShow } from "./personal-workspace-intro";

const READINESS = {
  pillars: [
    { key: "profession", met: true },
    { key: "availability", met: false },
    { key: "skills", met: false },
    { key: "journal", met: false },
    { key: "evidence", met: false },
    { key: "workCard", met: false },
  ],
} as unknown as WorkerReadiness;

const bools = [true, false] as const;
const kinds = ["personal", "organization"] as const;
const identities = ["person", "company", null] as const;

describe("personalIntroMayShow agrees with the full model", () => {
  for (const signedIn of bools)
    for (const workspaceKind of kinds)
      for (const identity of identities)
        for (const replacedByToday of bools) {
          const may = personalIntroMayShow({ signedIn, workspaceKind, identity, replacedByToday });
          it(`signedIn=${signedIn} ${workspaceKind} ${identity} today=${replacedByToday} → ${may}`, () => {
            for (const hasWorkerProfile of bools)
              for (const readiness of [READINESS, null]) {
                const intro = replacedByToday
                  ? ({ kind: "hidden", reason: "replaced-by-today" } as const)
                  : derivePersonalWorkspaceIntro({
                      identity,
                      workspaceKind,
                      signedIn,
                      hasWorkerProfile,
                      readiness,
                      displayName: null,
                    });
                // NEVER hides a block the model would render.
                if (intro.kind !== "hidden") expect(may).toBe(true);
                // And when it says "may", only the slow facts decide.
                if (may && hasWorkerProfile) expect(intro.kind).not.toBe("hidden");
              }
          });
        }
});

describe("the identities the home actually serves", () => {
  it("a worker in their personal space: ŠIANDIEN replaces the block — nothing reserved", () => {
    expect(
      personalIntroMayShow({ signedIn: true, workspaceKind: "personal", identity: "person", replacedByToday: true }),
    ).toBe(false);
  });

  it("anyone acting inside an organization: no block, nothing reserved", () => {
    for (const identity of identities)
      expect(
        personalIntroMayShow({ signedIn: true, workspaceKind: "organization", identity, replacedByToday: false }),
      ).toBe(false);
  });

  it("a company identity in the personal space: no block, nothing reserved", () => {
    expect(
      personalIntroMayShow({ signedIn: true, workspaceKind: "personal", identity: "company", replacedByToday: false }),
    ).toBe(false);
  });

  it("a person in the personal space without ŠIANDIEN: the block is coming — reserve it", () => {
    expect(
      personalIntroMayShow({ signedIn: true, workspaceKind: "personal", identity: "person", replacedByToday: false }),
    ).toBe(true);
  });
});
