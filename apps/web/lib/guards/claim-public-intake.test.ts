import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard — canonical-journey P3: the public-intake claim bridge stays honest
 * and email-gated.
 *
 * Pins:
 *   1. authorization is the AUTHENTICATED email match (auth user email vs
 *      intake contact_email) — re-checked on the claimed row itself, not
 *      only on the listing;
 *   2. claiming reuses the canonical save_demand_draft path (one demand
 *      model — no new table, no parallel intake copy);
 *   3. `converted` is written by the claim bridge and is NOT operator-
 *      settable (the queue action validates against the operator set).
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const bridge = read("lib/company/claim-public-intake.ts");
const queueAction = read("lib/admin/company-need-intake-actions.ts");
const shared = read("lib/admin/company-need-intake-shared.ts");

describe("claim bridge — email-gated, canonical draft path", () => {
  it("is server-only", () => {
    expect(bridge).toMatch(/import "server-only"/);
  });

  it("re-checks the email match on the claimed row itself", () => {
    expect(bridge).toMatch(
      /normEmail\(intake\.contact_email\) !== email/,
    );
    expect(bridge).toMatch(/reason: "not_yours"/);
  });

  it("only claimable statuses convert; rejected/converted never re-claim", () => {
    expect(bridge).toMatch(/CLAIMABLE = new Set\(\["new", "contacted", "qualified"\]\)/);
  });

  it("claims through the canonical save_demand_draft RPC (no new model)", () => {
    expect(bridge).toMatch(/rpc\("save_demand_draft"/);
    expect(bridge).toMatch(/p_kind: "company_request"/);
    expect(bridge).not.toMatch(/\.insert\(/);
  });

  it("marks the true outcome only after the draft exists", () => {
    const draftIdx = bridge.indexOf('rpc("save_demand_draft"');
    const convertIdx = bridge.indexOf('status: "converted"');
    expect(draftIdx).toBeGreaterThan(-1);
    expect(convertIdx).toBeGreaterThan(draftIdx);
  });
});

describe("`converted` is never operator-settable", () => {
  it("the shared operator set excludes converted", () => {
    const operatorBlock = shared.slice(
      shared.indexOf("COMPANY_NEED_INTAKE_OPERATOR_STATUSES"),
    );
    expect(operatorBlock).toMatch(/"new",\s*"contacted",\s*"qualified",\s*"rejected",\s*\] as const/);
  });

  it("the queue action validates against the operator set", () => {
    expect(queueAction).toMatch(/COMPANY_NEED_INTAKE_OPERATOR_STATUSES/);
  });
});
