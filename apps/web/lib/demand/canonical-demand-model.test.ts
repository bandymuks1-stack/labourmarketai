import { describe, expect, it } from "vitest";
import {
  dedupeCanonicalDemand,
  placeableDemand,
  toCanonicalDemand,
  type CanonicalDemand,
} from "./canonical-demand-model";

/**
 * W10 slice 4 — the canonical demand read model.
 *
 * These lock the honesty rules that make ONE demand list safe to show on two
 * surfaces: nothing is invented, one demand is one row, historical demand stays
 * distinguishable from an actionable employer request, and the order does not
 * depend on which branch answered first.
 */

const req = (over: Partial<Parameters<typeof toCanonicalDemand>[0]> = {}) =>
  toCanonicalDemand({
    id: "11111111-1111-1111-1111-111111111111",
    source: "customer_request",
    actionable: true,
    country: "NL",
    cityLabel: "Rotterdam",
    quantity: 4,
    roleText: "concrete-worker",
    createdAt: "2026-08-01T00:00:00Z",
    ...over,
  });

describe("toCanonicalDemand — nothing is invented", () => {
  it("preserves a real quantity", () => {
    expect(req({ quantity: 12 })?.quantity).toBe(12);
  });

  it("does NOT invent a quantity when the source has none", () => {
    // The pre-slice-4 map read did `headcount_needed ?? 1`, turning "unknown"
    // into "one person". Unknown must survive as null all the way out.
    expect(req({ quantity: null })?.quantity).toBeNull();
    expect(req({ quantity: undefined })?.quantity).toBeNull();
  });

  it("treats a zero, negative or fractional headcount as unknown, not as a number", () => {
    expect(req({ quantity: 0 })?.quantity).toBeNull();
    expect(req({ quantity: -3 })?.quantity).toBeNull();
    expect(req({ quantity: 2.5 })?.quantity).toBeNull();
  });

  it("preserves real geography and upper-cases the country", () => {
    const row = req({ country: "nl", cityLabel: "Rotterdam" });
    expect(row?.country).toBe("NL");
    expect(row?.cityLabel).toBe("Rotterdam");
  });

  it("does NOT invent geography when the source has none", () => {
    const row = req({ country: null, cityLabel: null });
    expect(row?.country).toBeNull();
    expect(row?.cityLabel).toBeNull();
  });

  it("normalises blank text to null so a surface cannot render an empty label", () => {
    const row = req({ country: "   ", cityLabel: "  ", roleText: "" });
    expect(row?.country).toBeNull();
    expect(row?.cityLabel).toBeNull();
    expect(row?.roleText).toBeNull();
  });

  it("keeps the structured role text when it is real", () => {
    expect(req({ roleText: " concrete-worker " })?.roleText).toBe("concrete-worker");
  });

  it("drops a row with no usable id rather than minting one", () => {
    expect(req({ id: null })).toBeNull();
    expect(req({ id: "   " })).toBeNull();
    expect(req({ id: undefined })).toBeNull();
  });

  it("carries no salary, fit, confidence or contact field at all", () => {
    // Absence is structural: a surface cannot fabricate what the type has no
    // slot for. This is the guard against a map marker growing a fake claim.
    //
    // 2026-09-05: `organizationName` was added and `companyName` dropped from
    // this list. The rule did NOT loosen — it got precise. What was banned is
    // an identity the read INVENTS or infers; what is now carried is the exact
    // column `list_open_demand_for_workers` already returns, and only for a
    // company whose verification_status is verified. Everything genuinely
    // fabricable (salary, fit, score, confidence) and every contact detail
    // stays banned, and the own-rows branch still contributes null rather than
    // borrowing the viewer's workspace name.
    const row = req() as unknown as Record<string, unknown>;
    for (const forbidden of ["salary", "pay", "rate", "fit", "score", "confidence", "contact", "email", "phone", "companyId", "profileId"]) {
      expect(row).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(row).sort()).toEqual(
      ["actionable", "cityLabel", "country", "createdAt", "id", "key", "organizationName", "ownedByViewer", "quantity", "roleText", "source"],
    );
  });
});

describe("actionable — historical demand stays distinguishable", () => {
  it("marks a customer_request actionable and a job_demand not", () => {
    expect(req({ source: "customer_request", actionable: true })?.actionable).toBe(true);
    expect(req({ source: "job_demand", actionable: false })?.actionable).toBe(false);
  });

  it("keeps the source on every row so a surface can label it", () => {
    expect(req({ source: "job_demand", actionable: false })?.source).toBe("job_demand");
    expect(req()?.source).toBe("customer_request");
  });
});

describe("dedupeCanonicalDemand", () => {
  const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  it("emits ONE row when the same request arrives from two authorized branches", () => {
    // An employer who is also a worker reaches their own request through both
    // the worker RPC and the own-rows read. One demand, one marker.
    const rows = dedupeCanonicalDemand([req({ id: A })!, req({ id: A })!]);
    expect(rows).toHaveLength(1);
  });

  it("keeps the ACTIONABLE copy when a duplicate disagrees", () => {
    const rows = dedupeCanonicalDemand([
      req({ id: A, actionable: false })!,
      req({ id: A, actionable: true })!,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actionable).toBe(true);
  });

  it("does NOT collapse rows that merely share an id across the two stores", () => {
    // Independent id spaces: same uuid in both tables is two different demands.
    const rows = dedupeCanonicalDemand([
      req({ id: A, source: "customer_request", actionable: true })!,
      req({ id: A, source: "job_demand", actionable: false })!,
    ]);
    expect(rows).toHaveLength(2);
  });

  it("orders deterministically regardless of input order", () => {
    const input: CanonicalDemand[] = [
      req({ id: B, country: "NL", cityLabel: "Utrecht" })!,
      req({ id: A, country: "DE", cityLabel: "Berlin" })!,
      req({ id: A, country: null, cityLabel: null, source: "job_demand", actionable: false })!,
    ];
    const forward = dedupeCanonicalDemand(input).map((r) => r.key);
    const reversed = dedupeCanonicalDemand([...input].reverse()).map((r) => r.key);
    expect(forward).toEqual(reversed);
    // Unknown country sorts LAST — never first, never interleaved.
    expect(forward.at(-1)).toBe(`job_demand:${A}`);
  });
});

describe("placeableDemand", () => {
  it("keeps demand that carries a real country", () => {
    expect(placeableDemand([req({ country: "NL" })!])).toHaveLength(1);
  });

  it("withholds demand with no country instead of giving it a centroid", () => {
    // The row is REAL demand. It is simply not placeable, and a pin is a claim
    // about where the work is that we cannot make.
    expect(placeableDemand([req({ country: null })!])).toHaveLength(0);
  });

  it("is not an empty-state: unplaceable demand does not make the list fail", () => {
    const rows = placeableDemand([req({ country: null })!, req({ country: "NL" })!]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.country).toBe("NL");
  });
});

describe("the organisation name — carried when disclosed, absent otherwise", () => {
  const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("carries the name the disclosing branch already returned", () => {
    expect(req({ organizationName: "Bouwbedrijf De Vries BV" })?.organizationName).toBe(
      "Bouwbedrijf De Vries BV",
    );
  });

  it("an absent name stays null — never an empty label a surface would render", () => {
    expect(req({ organizationName: null })?.organizationName).toBeNull();
    expect(req({ organizationName: undefined })?.organizationName).toBeNull();
    expect(req({ organizationName: "   " })?.organizationName).toBeNull();
  });

  it("dedup MERGES the name in, whichever copy carried it", () => {
    // An employer who is also a worker reaches their own request through BOTH
    // branches: the worker RPC names the verified company, the own-rows read has
    // no company column. Without this the name would appear or vanish depending
    // on branch order. It discloses nothing new — same row, same permission.
    const named = req({ id: A, organizationName: "Verified BV" })!;
    const unnamed = req({ id: A, organizationName: null })!;
    for (const input of [
      [unnamed, named],
      [named, unnamed],
    ]) {
      const rows = dedupeCanonicalDemand(input);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.organizationName).toBe("Verified BV");
    }
  });

  it("actionability comes from the actionable copy; the FACTS merge from both", () => {
    // Two entries under one key are the same row in the same store, seen
    // through two already-authorized paths. Merging their facts discloses
    // nothing new — but the STATUS must still come from the copy that grants a
    // real next step, so a name can never promote a dead row.
    const rows = dedupeCanonicalDemand([
      req({ id: A, actionable: true, organizationName: null })!,
      req({ id: A, actionable: false, organizationName: "Historic BV" })!,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actionable).toBe(true);
    expect(rows[0]!.organizationName).toBe("Historic BV");
  });

  it("ownership merges too — the own-rows branch is the only one that knows it", () => {
    // The worker RPC returns the verified name and says nothing about
    // ownership; the own-rows read knows the row is the viewer's own and has no
    // company column. Keeping one copy would throw away half of what the two
    // authorized paths returned.
    for (const input of [
      [req({ id: A, organizationName: "Verified BV", ownedByViewer: false })!, req({ id: A, ownedByViewer: true })!],
      [req({ id: A, ownedByViewer: true })!, req({ id: A, organizationName: "Verified BV", ownedByViewer: false })!],
    ]) {
      const rows = dedupeCanonicalDemand(input);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.organizationName).toBe("Verified BV");
      expect(rows[0]!.ownedByViewer).toBe(true);
    }
  });

  it("ownership is never invented — it defaults to false", () => {
    expect(req({})!.ownedByViewer).toBe(false);
    expect(req({ ownedByViewer: false })!.ownedByViewer).toBe(false);
  });
});
