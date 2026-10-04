import { describe, expect, it } from "vitest";

import {
  FEDERATED_DIRECTION,
  VACANCY_SLICE_MIXED,
  adaptersForDomain,
  demandToRow,
  filterByDirection,
  isFederatedOnlyDomain,
  mergeDiscoveryRows,
  supplyToRow,
  vacancyToRow,
} from "@/lib/marketplace/federation-model";
import type { MarketplaceDiscoveryRow } from "@/lib/marketplace/listings-model";

const U = "11111111-1111-1111-1111-111111111111";

describe("vacancyToRow — public vacancy adapter (job, need)", () => {
  const raw = {
    id: U,
    title_raw: "Finance Manager till MuoviTech Sweden AB", // must NEVER surface
    profession_slug: "welder",
    occupation_raw: "Welder",
    positions: 3,
    compensation_currency: "eur",
    compensation_min: 2000,
    compensation_max: 2000,
    published_at: "2026-10-01T08:00:00Z",
  };

  it("carries origin, domain, direction, visibility and provenance", () => {
    const r = vacancyToRow(raw)!;
    expect(r.sourceTable).toBe("public_vacancies");
    expect(r.id).toBe(U);
    expect(r.domain).toBe("job");
    expect(r.direction).toBe("need");
    expect(r.visibility).toBe("public");
    expect(r.provenance).toBe("external_vacancy");
    expect(r.destinationPath).toBe(`/jobs/${U}`);
    expect(r.contactAction).toBe("open_source");
    expect(r.isMine).toBe(false);
  });

  it("never reads the hidden raw title (anon boundary)", () => {
    const r = vacancyToRow(raw)!;
    expect(r.title).toBe("Welder");
    expect(JSON.stringify(r)).not.toContain("MuoviTech");
  });

  it("discloses no poster, organization or location the projection lacks", () => {
    const r = vacancyToRow(raw)!;
    expect(r.ownerId).toBeNull();
    expect(r.organizationId).toBeNull();
    expect(r.publisherName).toBeNull();
    expect(r.locationCountry).toBeNull();
    expect(r.locationLabel).toBeNull();
  });

  it("single pay figure -> amount; range -> text; no currency -> nothing", () => {
    expect(vacancyToRow(raw)!.priceAmount).toBe(2000);
    expect(vacancyToRow(raw)!.currency).toBe("EUR");
    const range = vacancyToRow({ ...raw, compensation_max: 2600 })!;
    expect(range.priceAmount).toBeNull();
    expect(range.priceText).toBe("2000–2600 EUR");
    const none = vacancyToRow({ ...raw, compensation_currency: null })!;
    expect(none.priceAmount).toBeNull();
    expect(none.priceText).toBeNull();
    expect(none.currency).toBeNull();
  });

  it("NULL / junk is never invented", () => {
    expect(vacancyToRow({})).toBeNull();
    expect(vacancyToRow({ id: "  " })).toBeNull();
    const r = vacancyToRow({ id: U, positions: 0 })!;
    expect(r.title).toBe("");
    expect(r.quantity).toBeNull();
    expect(r.subject).toBeNull();
    expect(r.createdAt).toBe("");
  });
});

describe("supplyToRow — available workforce adapter (workforce, offer)", () => {
  const s = { id: U, roleText: "Scaffolder", country: "no", teamSize: 6, declaredAt: "2026-10-02T00:00:00Z" };

  it("is an OFFER visible to organization managers only", () => {
    const r = supplyToRow(s)!;
    expect(r.sourceTable).toBe("customer_requests");
    expect(r.domain).toBe("workforce");
    expect(r.direction).toBe("offer");
    expect(r.visibility).toBe("organizations");
    expect(r.provenance).toBe("platform");
    expect(r.locationCountry).toBe("NO");
    expect(r.quantity).toBe(6);
    expect(r.contactAction).toBe("open_source");
  });

  it("exposes no supplying organization, profile or contact", () => {
    const r = supplyToRow(s)!;
    expect(r.ownerId).toBeNull();
    expect(r.organizationId).toBeNull();
    expect(r.publisherName).toBeNull();
    expect(r.description).toBeNull();
  });

  it("shapeless legacy rows stay shapeless (NULL stays NULL)", () => {
    const r = supplyToRow({ id: U, roleText: null, country: null, teamSize: null, declaredAt: "" })!;
    expect(r.title).toBe("");
    expect(r.quantity).toBeNull();
    expect(r.locationCountry).toBeNull();
    expect(supplyToRow({ ...s, id: "" })).toBeNull();
  });
});

describe("demandToRow — project / contract demand adapter (project_work, need)", () => {
  const d = {
    id: U,
    source: "customer_request",
    actionable: true,
    country: "se",
    cityLabel: "Malmo",
    quantity: 4,
    roleText: "Roofing crew",
    organizationName: "Verified Roofing AB",
    ownedByViewer: false,
    createdAt: "2026-10-03T00:00:00Z",
  };

  it("other tenants' demand is a NEED visible through the worker gate", () => {
    const r = demandToRow(d)!;
    expect(r.domain).toBe("project_work");
    expect(r.direction).toBe("need");
    expect(r.visibility).toBe("workers");
    expect(r.isMine).toBe(false);
    expect(r.destinationPath).toBe("/dashboard/opportunities");
    expect(r.publisherName).toBe("Verified Roofing AB");
    expect(r.locationCountry).toBe("SE");
  });

  it("the caller's own demand is marked own and opens scouting for that request", () => {
    const r = demandToRow({ ...d, ownedByViewer: true, organizationName: null })!;
    expect(r.visibility).toBe("own");
    expect(r.isMine).toBe(true);
    expect(r.destinationPath).toBe(`/dashboard/company/scouting?request=${U}`);
    expect(r.publisherName).toBeNull();
  });

  it("drops non-actionable and historical job_demand rows", () => {
    expect(demandToRow({ ...d, actionable: false })).toBeNull();
    expect(demandToRow({ ...d, source: "job_demand" })).toBeNull();
    expect(demandToRow({ ...d, id: "" })).toBeNull();
  });

  it("does not invent a headcount", () => {
    expect(demandToRow({ ...d, quantity: null })!.quantity).toBeNull();
  });
});

describe("routing, direction and merge", () => {
  it("each federated domain has exactly one fixed direction", () => {
    expect(FEDERATED_DIRECTION).toEqual({ job: "need", workforce: "offer", project_work: "need" });
  });

  it("domain filter selects only the adapter that serves it", () => {
    expect(adaptersForDomain(null)).toEqual({ vacancies: true, workforce: true, demand: true });
    expect(adaptersForDomain("all")).toEqual({ vacancies: true, workforce: true, demand: true });
    expect(adaptersForDomain("job")).toEqual({ vacancies: true, workforce: false, demand: false });
    expect(adaptersForDomain("workforce")).toEqual({ vacancies: false, workforce: true, demand: false });
    expect(adaptersForDomain("project_work")).toEqual({ vacancies: false, workforce: false, demand: true });
    expect(adaptersForDomain("goods")).toEqual({ vacancies: false, workforce: false, demand: false });
    expect(isFederatedOnlyDomain("job")).toBe(true);
    expect(isFederatedOnlyDomain("project_work")).toBe(false);
  });

  it("the mixed view takes a bounded vacancy slice", () => {
    expect(VACANCY_SLICE_MIXED).toBeLessThanOrEqual(50);
  });

  const listing = (id: string, updatedAt: string): MarketplaceDiscoveryRow => ({
    ...vacancyToRow({ id, occupation_raw: "x" })!,
    sourceTable: "marketplace_listings",
    domain: "goods",
    updatedAt,
    createdAt: updatedAt,
    visibility: "signed_in",
    provenance: "platform",
  });

  it("merge dedups on origin:id, never lets an adapter replace a base row, newest first, capped", () => {
    const base = [listing(U, "2026-10-01"), listing("22222222-2222-2222-2222-222222222222", "2026-10-03")];
    const adapted = [
      { ...supplyToRow({ id: U, roleText: "dupe id other table", country: null, teamSize: null, declaredAt: "2026-10-02" })! },
      { ...listing(U, "2099-01-01") }, // same origin:id as a base row -> dropped
    ];
    const out = mergeDiscoveryRows(base, adapted);
    expect(out).toHaveLength(3);
    expect(out[0].updatedAt).toBe("2026-10-03");
    expect(out.find((r) => r.sourceTable === "marketplace_listings" && r.id === U)!.updatedAt).toBe("2026-10-01");
    expect(mergeDiscoveryRows(base, adapted, 1)).toHaveLength(1);
  });

  it("direction filter maps 1:1 onto adapter rows", () => {
    const rows = [
      vacancyToRow({ id: U, occupation_raw: "x" })!,
      supplyToRow({ id: "33333333-3333-3333-3333-333333333333", roleText: "y", country: null, teamSize: null, declaredAt: "" })!,
    ];
    expect(filterByDirection(rows, "need").map((r) => r.domain)).toEqual(["job"]);
    expect(filterByDirection(rows, "offer").map((r) => r.domain)).toEqual(["workforce"]);
    expect(filterByDirection(rows, null)).toHaveLength(2);
  });
});
