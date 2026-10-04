import { describe, expect, it } from "vitest";

import {
  FEDERATED_DIRECTION,
  UNIVERSAL_DOMAIN_GROUPS,
  actorKindForOrganisation,
  demandToRow,
  filterByActorKind,
  indexRowActor,
  supplyToRow,
  vacancyToRow,
} from "@/lib/marketplace/federation-model";
import { ACTOR_KINDS } from "@/lib/marketplace/listings-model";

const U = "11111111-1111-1111-1111-111111111111";

describe("actor kind per adapter (derived from the canonical source, never copied)", () => {
  it("vacancy: the anon projection states no poster -> other / undisclosed", () => {
    const r = vacancyToRow({ id: U, occupation_raw: "Welder" })!;
    expect(r.actorKind).toBe("other");
    expect(r.actorBasis).toBe("undisclosed");
  });

  it("workforce supply: agency from the agency_offer kind; identity stays anonymous", () => {
    const r = supplyToRow({
      id: U,
      roleText: "Tilers",
      country: "se",
      teamSize: 4,
      declaredAt: "2026-10-01T00:00:00Z",
    })!;
    expect(r.actorKind).toBe("agency");
    expect(r.actorBasis).toBe("source_kind");
    expect(r.ownerId).toBeNull();
    expect(r.organizationId).toBeNull();
    expect(r.publisherName).toBeNull();
  });

  const demand = {
    id: U,
    source: "customer_request",
    actionable: true,
    country: "se",
    cityLabel: null,
    quantity: 2,
    roleText: "Roofer",
    organizationName: "Verified Roofing AB",
    ownedByViewer: false,
    createdAt: "2026-10-01T00:00:00Z",
  };

  it("project demand: company only when the verified-company gate disclosed one", () => {
    const named = demandToRow(demand)!;
    expect(named.actorKind).toBe("company");
    expect(named.actorBasis).toBe("source_kind");
    const anon = demandToRow({ ...demand, organizationName: null })!;
    expect(anon.actorKind).toBe("other");
    expect(anon.actorBasis).toBe("undisclosed");
    expect(anon.publisherName).toBeNull();
  });

  it("service offering = individual service provider; listing without organisation = person", () => {
    expect(
      indexRowActor({ sourceTable: "service_offerings", organizationId: null, domain: "service", direction: "offer" }),
    ).toEqual({ actorKind: "service_provider", actorBasis: "source_column" });
    expect(
      indexRowActor({ sourceTable: "marketplace_listings", organizationId: null, domain: "goods", direction: "offer" }),
    ).toEqual({ actorKind: "person", actorBasis: "source_column" });
  });
});

describe("organisation actor kind via organization_roles capability (ORG-2)", () => {
  const ctx = (domain: string, direction: "offer" | "need") => ({ domain, direction });

  it("training_provider -> institution (needs and offers)", () => {
    expect(actorKindForOrganisation(["training_provider"], ctx("service_need", "need"))).toBe("institution");
    expect(actorKindForOrganisation(["training_provider"], ctx("service", "offer"))).toBe("institution");
  });

  it.each(["workforce_provider", "talent_provider", "recruitment_partner"])(
    "%s -> agency for workforce offers",
    (cap) => {
      expect(actorKindForOrganisation([cap], ctx("workforce", "offer"))).toBe("agency");
    },
  );

  it("an organisation that also supplies workforce is an agency only for workforce, company for its needs", () => {
    const caps = ["employer", "workforce_provider"];
    expect(actorKindForOrganisation(caps, ctx("workforce", "offer"))).toBe("agency");
    expect(actorKindForOrganisation(caps, ctx("project_work", "need"))).toBe("company");
  });

  it.each(["supplier", "logistics_provider"])("%s -> supplier for goods offers", (cap) => {
    expect(actorKindForOrganisation([cap], ctx("goods", "offer"))).toBe("supplier");
  });

  it.each(["employer", "client", "contractor", "subcontractor", "project_operator"])("%s -> company", (cap) => {
    expect(actorKindForOrganisation([cap], ctx("project_work", "need"))).toBe("company");
  });

  it("no readable capability stays other / undisclosed (never guessed from a type)", () => {
    expect(actorKindForOrganisation([], ctx("goods", "offer"))).toBe("other");
    const row = {
      sourceTable: "marketplace_listings",
      organizationId: "o1",
      domain: "goods",
      direction: "offer" as const,
    };
    expect(indexRowActor(row)).toEqual({ actorKind: "other", actorBasis: "undisclosed" });
    expect(indexRowActor(row, new Map([["o1", []]]))).toEqual({ actorKind: "other", actorBasis: "undisclosed" });
    expect(indexRowActor(row, new Map([["o1", ["supplier"]]]))).toEqual({
      actorKind: "supplier",
      actorBasis: "capability",
    });
  });
});

describe("actor x domain x direction matrix of the mapping", () => {
  const domains = ["work_resource", "goods", "service_need", "personal", "project_work", "service", "job", "workforce"];
  const dirs = ["offer", "need"] as const;
  const caps: Record<string, string[]> = {
    institution: ["training_provider"],
    agency: ["workforce_provider"],
    supplier: ["supplier"],
    company: ["employer"],
  };
  for (const [kind, c] of Object.entries(caps)) {
    for (const d of domains) {
      for (const dir of dirs) {
        it(`${kind} / ${d} / ${dir}`, () => {
          expect(actorKindForOrganisation(c, { domain: d, direction: dir })).toBe(kind);
        });
      }
    }
  }

  it("a person-owned listing is a person in every domain and direction", () => {
    for (const d of domains) {
      for (const dir of dirs) {
        expect(
          indexRowActor({ sourceTable: "marketplace_listings", organizationId: null, domain: d, direction: dir })
            .actorKind,
        ).toBe("person");
      }
    }
  });

  it("the ActorKind set is closed with an honest 'other'", () => {
    expect([...ACTOR_KINDS].sort()).toEqual([
      "agency",
      "company",
      "institution",
      "other",
      "person",
      "service_provider",
      "supplier",
    ]);
  });
});

describe("the model is not narrowed to jobs / recruitment", () => {
  it("all four universal domain groups and both directions are present", () => {
    expect(Object.keys(UNIVERSAL_DOMAIN_GROUPS).sort()).toEqual(["goods", "project", "service", "work"]);
    expect(Object.values(FEDERATED_DIRECTION)).toEqual(expect.arrayContaining(["offer", "need"]));
  });

  it("actor filter selects by kind", () => {
    const a = supplyToRow({ id: U, roleText: "x", country: null, teamSize: 1, declaredAt: "2026-10-01T00:00:00Z" })!;
    const b = vacancyToRow({ id: "22222222-2222-2222-2222-222222222222", occupation_raw: "y" })!;
    expect(filterByActorKind([a, b], "agency")).toEqual([a]);
    expect(filterByActorKind([a, b], null)).toHaveLength(2);
  });
});
