import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PER-13 — THE REQUIREMENT LEDGER IS BUILT FOR THREE CONTEXTS.
 *
 * `RequirementLedgerContext` is `project | opportunity | role`, and
 * `loadRequirementLedger` has always had a branch for each. Only `project`
 * had a caller: a person could see what a PROJECT still needed from them, but
 * not what an OPPORTUNITY would — the moment the answer matters most, because
 * it is the moment they decide whether to raise their hand.
 *
 * Step B mounted `opportunity`. `role` is still unmounted, and this guard says
 * so out loud rather than letting the gap sit unrecorded: it asserts the CURRENT
 * mounted set exactly, so mounting `role` later fails here until the register
 * is updated with it.
 *
 * ONE ANSWER, NOT TWO. The second mount renders the SAME component with the
 * SAME copy. A requirement that read one way under an instruction and another
 * way under an opportunity would be two answers to one question, which is the
 * duplication the whole reuse audit is about — so the copy has one home and
 * both surfaces call it.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const SERVER = "lib/player-card/requirement-ledger-server.ts";
const LABELS = "lib/player-card/requirement-ledger-labels.ts";
const INSTRUCTIONS = "app/[locale]/dashboard/instructions/page.tsx";
const OPPORTUNITIES = "app/[locale]/dashboard/opportunities/page.tsx";

describe("every mounted ledger context has a real caller", () => {
  it("the loader still serves all three contexts", () => {
    const core = read("lib/player-card/requirement-ledger.ts");
    for (const kind of ["project", "opportunity", "role"]) {
      expect(core, `context ${kind} vanished from the ledger`).toMatch(
        new RegExp(`kind: "${kind}"`),
      );
    }
  });

  it("the opportunity branch has a bounded loader (it had none)", () => {
    const src = read(SERVER);
    expect(src).toMatch(/loadOwnOpportunityLedgers/);
    expect(src).toMatch(/kind: "opportunity"/);
    // Bounded like the project loader, and for the same reason.
    expect(src).toMatch(/OWN_OPPORTUNITY_LEDGERS_LIMIT/);
  });

  it("the opportunities surface actually calls it and renders the rows", () => {
    const page = read(OPPORTUNITIES);
    expect(page).toMatch(/loadOwnOpportunityLedgers\(/);
    expect(page).toMatch(/RequirementLedgerRows/);
    expect(page).toMatch(/opportunity-requirement-ledger/);
  });

  it("`role` is still unmounted — recorded, not quietly forgotten", () => {
    // If this fails because `role` gained a mount: good. Update the PER-13
    // register note in the same change, then update this expectation.
    const mounted = [INSTRUCTIONS, OPPORTUNITIES]
      .map(read)
      .join("\n");
    expect(mounted).not.toMatch(/kind: "role"/);
  });
});

describe("both mounts give the SAME answer", () => {
  it("the ledger copy has exactly one home", () => {
    const labels = read(LABELS);
    expect(labels).toMatch(/buildRequirementLedgerLabels/);
    // Both surfaces resolve their labels through it — neither rebuilds them.
    for (const rel of [INSTRUCTIONS, OPPORTUNITIES]) {
      expect(read(rel), `${rel} does not use the shared ledger copy`).toMatch(
        /buildRequirementLedgerLabels\(\)/,
      );
    }
  });

  it("no surface rebuilds the label mapping inline", () => {
    // `card.ledger.state.valid` is the tell: it appeared once per inline
    // rebuild. It must now appear only in the one builder.
    for (const rel of [INSTRUCTIONS, OPPORTUNITIES]) {
      expect(
        read(rel),
        `${rel} rebuilt the ledger labels instead of calling the shared builder`,
      ).not.toMatch(/card\.ledger\.state\.valid/);
    }
    expect(read(LABELS)).toMatch(/card\.ledger\.state\.valid/);
  });

  it("the renderer is shared, not copied", () => {
    const component = read("components/app/instruction-project-asks.tsx");
    expect(component).toMatch(/export function RequirementLedgerRows/);
  });
});
