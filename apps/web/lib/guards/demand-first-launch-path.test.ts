import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildStructuredV2Input,
  EMPTY_ADVANCED_DEMAND_STATE,
} from "@/lib/demand/structured-demand-form";
import { sanitizeStructuredDemandV2 } from "@/lib/demand/structured-demand-v2";

/**
 * THE DEMAND-FIRST LAUNCH PATH (owner finish-mode item 8).
 *
 * An employer arrives saying "Man reikia darbuotojų". The shortest path from
 * that sentence to actionable workers is:
 *
 *   how many → what work → where → from when → what shift → what pay
 *   → mandatory certificates / languages → CANONICAL DEMAND → matching
 *
 * Every step of it already existed. What did not exist was the ORDER and the
 * VISIBILITY: the intake sat last in the company room, and four of the seven
 * steps sat behind a collapsed accordion. Production said so plainly — of 20
 * `customer_requests` on 2026-09-15, 0 carried pay, 0 carried mandatory
 * certificates or languages, 1 carried the time cluster.
 *
 * This guard pins the path. It does NOT pin a new model: there is exactly one
 * demand model (`customer_requests` via `submit_demand_request`), one intake
 * wizard and one matching room, and the assertions below name those.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

describe("the launch-path clusters are visible, not buried", () => {
  const advanced = read("components/app/demand-advanced-sections.tsx");

  it("time, compensation and requirements open expanded", () => {
    expect(advanced).toMatch(/const LAUNCH_PATH_SECTIONS[\s\S]*?time: true/);
    expect(advanced).toMatch(/const LAUNCH_PATH_SECTIONS[\s\S]*?compensation: true/);
    expect(advanced).toMatch(/const LAUNCH_PATH_SECTIONS[\s\S]*?requirements: true/);
    // Seeded into the disclosure state, not merely declared.
    expect(advanced).toMatch(/useState<Record<string, boolean>>\(\{\s*\.\.\.LAUNCH_PATH_SECTIONS,?\s*\}\)/);
  });

  it("the clusters NOT on the launch path stay progressive disclosure", () => {
    const block = advanced.slice(
      advanced.indexOf("const LAUNCH_PATH_SECTIONS"),
      advanced.indexOf("type Patch ="),
    );
    for (const collapsed of ["engagement", "accommodation", "transport", "process"]) {
      expect(block, `${collapsed} must not be force-opened`).not.toMatch(
        new RegExp(`\\b${collapsed}: true`),
      );
    }
  });

  it("each launch-path cluster still holds the field it is there for", () => {
    // start date + shift/rotation
    expect(advanced).toMatch(/startEarliest/);
    expect(advanced).toMatch(/startLatest/);
    expect(advanced).toMatch(/shifts/);
    // pay / budget
    expect(advanced).toMatch(/compMin/);
    expect(advanced).toMatch(/compMax/);
    // mandatory certificates + languages
    expect(advanced).toMatch(/certificates/);
    expect(advanced).toMatch(/languages/);
  });
});

describe("the wizard's own step asks the first three questions", () => {
  const form = read("components/app/demand-request-button.tsx");

  it("how many / what work / where are real controls", () => {
    // The listbox controls pass their id as `testId`; the number input
    // renders `data-testid` directly. Both reach the DOM as data-testid.
    expect(form).toMatch(/data-testid="demand-team-size"/); // how many
    expect(form).toMatch(/testId="demand-work-type"/); // what work
    expect(form).toMatch(/testId="demand-country-select"/); // where
  });

  it("the submit is the canonical demand action, not a second lead store", () => {
    expect(form).toMatch(/submitDemandRequestAction/);
    // `/api/leads` is named only in the comment that explains why it is NOT
    // the destination; there must be no call to it.
    expect(form).not.toMatch(/fetch\(\s*["'`]\/api\/leads/);
  });

  it("and it hands the employer the matching room", () => {
    expect(form).toMatch(/data-testid="demand-done-scouting-link"/);
    expect(form).toMatch(/dashboard\/company\/scouting/);
  });
});

/**
 * THE RISK OF OPENING A CLUSTER BY DEFAULT is that an expanded, untouched
 * control starts LOOKING like a stated fact. It must not become one.
 *
 * This is the behavioural half of the guard: the pure builder the wizard and
 * the server sanitizer both use is fed the untouched state and must produce
 * nothing. Visibility changed; honesty did not.
 */
describe("an expanded but untouched cluster states nothing", () => {
  it("the untouched form builds no v2 payload at all", () => {
    // Stronger than an empty object: the builder returns nothing, so an
    // expanded-but-untouched cluster cannot even reach the wire.
    expect(buildStructuredV2Input(EMPTY_ADVANCED_DEMAND_STATE)).toBeUndefined();
  });

  it("and the server sanitizer stores nothing for it", () => {
    expect(
      sanitizeStructuredDemandV2(buildStructuredV2Input(EMPTY_ADVANCED_DEMAND_STATE)),
    ).toBeNull();
  });

  it("non-vacuity: a stated pay DOES reach the payload", () => {
    const wire = buildStructuredV2Input({
      ...EMPTY_ADVANCED_DEMAND_STATE,
      compMin: "12.50",
      basis: "gross",
      unit: "hour",
    });
    expect(wire).not.toBeNull();
    expect(sanitizeStructuredDemandV2(wire)).not.toBeNull();
  });
});
