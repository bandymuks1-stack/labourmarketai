import { describe, expect, it } from "vitest";

import type { ExternalOpportunityCardV1 } from "@/lib/opportunities/external-vacancies";
import type { OpportunityCard } from "@/lib/opportunities/load-worker-opportunities";
import {
  FIRST_VIEW_COUNT,
  FREE_DISCOVERY_SET,
  selectPersonalOpportunities,
  strongestWhy,
} from "./personal-recommendations";

type M = OpportunityCard["match"];
const match = (status: M["status"], reasons: unknown[], evidence: Partial<M["evidence"]> = {}): M =>
  ({
    status,
    reasons,
    evidence: { matchedManagerConfirmed: 0, matchedJournalSupported: 0, matchedSelfDeclared: 0, ...evidence },
  }) as unknown as M;

const ad = (
  id: string,
  m: M,
  over: Partial<ExternalOpportunityCardV1["view"]> = {},
): ExternalOpportunityCardV1 =>
  ({
    key: `af:${id}`,
    vacancyId: id,
    publishedAt: over.publishedAt ?? "2026-10-01",
    match: m,
    view: {
      title: `Tiler ${id}`,
      employerName: "Bygg AB",
      country: "SE",
      city: "Stockholm",
      employmentForm: "permanent",
      workingTime: "full_time",
      positions: 2,
      startDate: null,
      publishedAt: "2026-10-01",
      payCurrency: null,
      payMin: null,
      payMax: null,
      ...over,
    },
  }) as unknown as ExternalOpportunityCardV1;

const need = (id: string, m: M): OpportunityCard =>
  ({
    need: { id, roleText: "tiling", country: "LT", locationLabel: "Vilnius", companyName: null, teamSize: 1, startPeriod: "asap" },
    match: m,
  }) as unknown as OpportunityCard;

describe("your opportunities - relevant only, explained, at most three", () => {
  it("never fills slots with weak or insufficient-data cards", () => {
    const out = selectPersonalOpportunities(
      [],
      [
        ad("1", match("strong", [{ code: "profession_match" }])),
        ad("2", match("weak", [{ code: "country_match" }])),
        ad("3", match("insufficient_data", [])),
      ],
      FIRST_VIEW_COUNT,
    );
    expect(out.map((o) => o.id)).toEqual(["1"]);
  });

  it("an empty board is an empty list, not a filler", () => {
    expect(selectPersonalOpportunities([], [], FIRST_VIEW_COUNT)).toEqual([]);
  });

  it("orders by verdict, then evidence, then place, then freshness; caps the view", () => {
    const out = selectPersonalOpportunities(
      [need("n1", match("possible", [{ code: "skill_fit", matched: 1, total: 2, confirmed: 0 }]))],
      [
        ad("old", match("strong", [{ code: "profession_match" }]), { publishedAt: "2026-09-01" }),
        ad("new", match("strong", [{ code: "profession_match" }]), { publishedAt: "2026-10-05", title: "Tiler new" }),
        ad("proof", match("strong", [{ code: "skills_manager_confirmed", count: 2 }], { matchedManagerConfirmed: 2 }), { title: "Tiler proof" }),
        ad("p2", match("possible", [{ code: "country_match" }]), { title: "Other" }),
      ],
      FIRST_VIEW_COUNT,
    );
    expect(out.map((o) => o.id)).toEqual(["proof", "new", "old"]);
    expect(out).toHaveLength(3);
  });

  it("the free discovery set holds up to ten", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      ad(String(i), match("possible", [{ code: "country_match" }]), { title: `Job ${i}` }),
    );
    expect(selectPersonalOpportunities([], many, FREE_DISCOVERY_SET)).toHaveLength(10);
  });

  it("the same ad listed twice counts once", () => {
    const out = selectPersonalOpportunities(
      [],
      [ad("a", match("strong", [{ code: "profession_match" }])), ad("b", match("strong", [{ code: "profession_match" }]), { title: "Tiler a" })],
      FIRST_VIEW_COUNT,
    );
    expect(out).toHaveLength(1);
  });

  it("the reason is the strongest the engine found, never invented", () => {
    expect(strongestWhy(match("strong", [{ code: "country_match" }, { code: "skills_manager_confirmed", count: 3 }]))).toEqual({ code: "skills_confirmed", count: 3 });
    expect(strongestWhy(match("possible", [{ code: "skills_history_reported", count: 1 }]))).toEqual({ code: "skills_history", count: 1 });
    expect(strongestWhy(match("possible", []))).toBeNull();
    // A relevant verdict with no stated reason is not shown (nothing to explain it).
    expect(selectPersonalOpportunities([], [ad("x", match("strong", []))], 3)).toEqual([]);
  });

  it("pay appears only when published; never estimated", () => {
    const [noPay] = selectPersonalOpportunities([], [ad("1", match("strong", [{ code: "profession_match" }]))], 3);
    expect(noPay.pay).toBeNull();
    const [paid] = selectPersonalOpportunities(
      [],
      [ad("2", match("strong", [{ code: "profession_match" }]), { payCurrency: "SEK", payMin: 30000, payMax: null })],
      3,
    );
    expect(paid.pay).toEqual({ currency: "SEK", min: 30000, max: null });
  });
});
