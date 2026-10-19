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
 * Step B mounted `opportunity`. 2026-10-19 mounted `role` on the person's own
 * profile (primary profession × the countries they aim at), only for countries
 * whose requirements are KNOWN — so all three contexts now have a caller.
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
const PROFILE = "app/[locale]/dashboard/profile/page.tsx";

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

  it("`role` is mounted on the person's own profile through a bounded loader", () => {
    const src = read(SERVER);
    expect(src).toMatch(/loadOwnRoleLedgers/);
    expect(src).toMatch(/kind: "role"/);
    expect(src).toMatch(/OWN_ROLE_LEDGERS_LIMIT/);
    const page = read(PROFILE);
    expect(page).toMatch(/loadOwnRoleLedgers\(/);
    expect(page).toMatch(/RequirementLedgerRows/);
    expect(page).toMatch(/profile-role-ledger/);
  });

  it("a country whose requirements are unknown gets no role ledger — never a false 100 %", () => {
    // An unknown country has zero curated requirements; a ledger over zero
    // rows would read as "complete". Unknown stays unknown: no row at all.
    const src = read(SERVER);
    expect(src).toMatch(/knownCountries/);
    expect(src).toMatch(/answerable\.map\(/);
  });
});

describe("both mounts give the SAME answer", () => {
  it("the ledger copy has exactly one home", () => {
    const labels = read(LABELS);
    expect(labels).toMatch(/buildRequirementLedgerLabels/);
    // Both surfaces resolve their labels through it — neither rebuilds them.
    for (const rel of [INSTRUCTIONS, OPPORTUNITIES, PROFILE]) {
      expect(read(rel), `${rel} does not use the shared ledger copy`).toMatch(
        /buildRequirementLedgerLabels\(\)/,
      );
    }
  });

  it("no surface rebuilds the label mapping inline", () => {
    // `card.ledger.state.valid` is the tell: it appeared once per inline
    // rebuild. It must now appear only in the one builder.
    for (const rel of [INSTRUCTIONS, OPPORTUNITIES, PROFILE]) {
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
