/**
 * R5 Living Opportunity World — the prototypes may not drift from the engine.
 *
 * `docs/design/living-world-r5/` renders two claims as if they came from
 * production logic:
 *   1. the second-domain ("30 kg of cucumbers") journey shows the REAL
 *      channel verdicts, including the honest gap — no invented buyer;
 *   2. the flagship Work-Journal beat shows a REAL coverage change with its
 *      basis, computed by the one match engine over real catalogue slugs.
 *
 * If either engine changes, this test fails and the prototype copy must be
 * corrected — which is the point. A design prototype that quietly diverges
 * from the system it depicts is exactly the "fake anything" the product
 * constitution (§5) forbids.
 */
import { describe, expect, it } from "vitest";
import { structureValueStatement } from "@/lib/structuring/value-statement";
import { computeContextFit } from "@/lib/market/fit";
import { assessChannelEligibility } from "./eligibility";

/** Real catalogue slugs — production `professions` x `profession_skills`
 *  x `skills`, read 2026-08-15 (docs/design/living-world-r5/data/queries.sql §7). */
const WAREHOUSE_WORKER_NEED = [
  "barcode-scanning",
  "forklift-operation",
  "order-picking",
  "packaging",
  "pallet-handling",
  "stock-taking",
  "warehouse-operations",
] as const;

const DRIVER_NEED = [
  "cargo-transport",
  "delivery-driving",
  "driving",
  "forklift-operation",
] as const;

describe("R5 second domain — the cucumber journey shows real verdicts", () => {
  const text = "Turiu 30 kg agurkų iš savo daržo ir noriu juos parduoti.";

  it("reads the statement as GOODS with a quantity — not a CV, not a vacancy", () => {
    const statement = structureValueStatement(text);
    expect(statement.axis).toBe("offer");
    expect(statement.subject).toBe("goods");
    expect(statement.quantity?.value).toBe(30);
    expect(statement.quantity?.unit).toBe("kg");
    // The architectural failure R5 tests for: never a worker/vacancy reading.
    expect(statement.subject).not.toBe("work_capacity");
    expect(statement.subject).not.toBe("workforce");
  });

  it("names the legal check instead of inventing a produce buyer", () => {
    const statement = structureValueStatement(text);
    const { verdicts } = assessChannelEligibility(statement, text);

    const marketplace = verdicts.find(
      (v) => v.channelId === "internal_marketplace_listings",
    );
    expect(marketplace?.kind).toBe("LEGAL_CHECK_REQUIRED");
    expect(marketplace?.legalCheckKey).toBe("food_sale_rules");

    // No channel may claim it can route garden produce today.
    expect(verdicts.some((v) => v.kind === "CAN_ROUTE")).toBe(false);
  });

  it("keeps every other channel honestly unsupported", () => {
    const statement = structureValueStatement(text);
    const { verdicts } = assessChannelEligibility(statement, text);
    for (const id of [
      "internal_demand_board",
      "internal_service_offerings",
      "external_job_supply_arbetsformedlingen",
    ]) {
      const v = verdicts.find((x) => x.channelId === id);
      expect(v?.kind).toBe("UNSUPPORTED");
      expect(v?.reasonKey).toBe("value_type_not_supported");
    }
  });
});

describe("R5 flagship — the Work Journal beat shows a real coverage change", () => {
  /** Before the entry: five warehouse skills, none manager-confirmed. */
  const before = [
    "pallet-handling",
    "order-picking",
    "packaging",
    "stock-taking",
    "warehouse-operations",
  ].map((uri) => ({ uri, verified: false }));

  /** The entry evidences the forklift move and the scan. */
  const after = [
    ...before,
    { uri: "forklift-operation", verified: false },
    { uri: "barcode-scanning", verified: false },
  ];

  it("moves warehouse coverage from 5/7 to 7/7, basis intact", () => {
    const b = computeContextFit([...WAREHOUSE_WORKER_NEED], before);
    const a = computeContextFit([...WAREHOUSE_WORKER_NEED], after);

    expect(b?.matchedTotal).toBe(5);
    expect(b?.needTotal).toBe(7);
    expect(b?.missingUris).toEqual(["barcode-scanning", "forklift-operation"]);

    expect(a?.matchedTotal).toBe(7);
    expect(a?.needTotal).toBe(7);
    expect(a?.missingUris).toEqual([]);

    // Nothing is manager-confirmed: the prototype must not imply verification.
    expect(a?.matchedConfirmed).toBe(0);
  });

  it("opens the driver direction at its honest, unflattering coverage", () => {
    const a = computeContextFit([...DRIVER_NEED], after);
    // forklift-operation is the ONLY overlap — 1 of 4. The prototype states
    // exactly this, and never rounds it into a friendlier number.
    expect(a?.matchedTotal).toBe(1);
    expect(a?.needTotal).toBe(4);
    expect(a?.matchedUris).toEqual(["forklift-operation"]);
  });

  it("refuses a percentage when the need has no structure", () => {
    expect(computeContextFit([], after)).toBeNull();
  });
});
