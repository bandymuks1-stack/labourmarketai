import { describe, expect, it } from "vitest";

import type {
  PublicBusinessListing,
  PublicBusinessProfile,
  PublicBusinessProfileView,
} from "@/lib/company/public-profile-model";
import { buildCompanyTeamProfile, isCompanyTeamView } from "@/lib/company/team-profile-model";

const EMPTY_PROFILE: PublicBusinessProfile = {
  id: "org-1",
  displayName: "Alfa",
  tagline: null,
  description: null,
  country: null,
  website: null,
  contactEmail: null,
  contactPhone: null,
};

const listing = (over: Partial<PublicBusinessListing> = {}): PublicBusinessListing => ({
  id: "l-1",
  listingKind: "sale",
  category: "tools",
  title: "Pjovimo staklės",
  description: null,
  locationCountry: null,
  locationLabel: null,
  priceText: null,
  ...over,
});

const view = (
  profile: Partial<PublicBusinessProfile> = {},
  listings: PublicBusinessListing[] = [],
): PublicBusinessProfileView => ({ profile: { ...EMPTY_PROFILE, ...profile }, listings });

const build = (v: PublicBusinessProfileView) => buildCompanyTeamProfile(v, "en");

describe("isCompanyTeamView", () => {
  it("opens only on the exact value", () => {
    expect(isCompanyTeamView("team")).toBe(true);
    for (const other of [undefined, "", "Team", "team ", "default", ["team"], ["team", "x"]]) {
      expect(isCompanyTeamView(other)).toBe(false);
    }
  });
});

describe("empty cases", () => {
  it("a company that published only its name has one empty model", () => {
    expect(build(view())).toEqual({
      hero: { name: "Alfa", tagline: null, country: null },
      about: null,
      offers: [],
      seeking: [],
      contact: [],
      later: {
        coverImageUrl: null,
        finishedWork: [],
        rosterByRole: [],
        proofFigures: [],
        openRoles: [],
      },
    });
  });

  it("blank strings count as absent", () => {
    const model = build(
      view({ tagline: "  ", description: "\n", country: " ", contactEmail: " ", contactPhone: " ", website: " " }),
    );
    expect(model.hero.tagline).toBeNull();
    expect(model.hero.country).toBeNull();
    expect(model.about).toBeNull();
    expect(model.contact).toEqual([]);
  });

  it("no listings means both listing regions are empty", () => {
    const model = build(view());
    expect(model.offers).toEqual([]);
    expect(model.seeking).toEqual([]);
  });

  it("listings of one kind leave the other region empty", () => {
    expect(build(view({}, [listing({ listingKind: "wanted" })])).offers).toEqual([]);
    expect(build(view({}, [listing({ listingKind: "rental" })])).seeking).toEqual([]);
  });

  it("the later slots stay empty however full the profile is", () => {
    const { later } = build(
      view(
        { tagline: "t", description: "d", country: "LT", website: "example.lt", contactEmail: "a@b.lt", contactPhone: "+370 600 00000" },
        [listing(), listing({ id: "l-2", listingKind: "wanted" })],
      ),
    );
    expect(later).toEqual({
      coverImageUrl: null,
      finishedWork: [],
      rosterByRole: [],
      proofFigures: [],
      openRoles: [],
    });
  });

  it("never carries a score field (doctrine §19)", () => {
    expect(JSON.stringify(build(view()))).not.toMatch(/score|rating|strength/i);
  });
});

describe("listings", () => {
  it("sale and rental are offers, wanted is seeking, order kept", () => {
    const model = build(
      view({}, [
        listing({ id: "a", listingKind: "rental" }),
        listing({ id: "b", listingKind: "wanted" }),
        listing({ id: "c", listingKind: "sale" }),
      ]),
    );
    expect(model.offers.map((l) => l.id)).toEqual(["a", "c"]);
    expect(model.seeking.map((l) => l.id)).toEqual(["b"]);
  });

  it("drops a kind the page has no meaning for, rather than guessing", () => {
    const unknown = listing({ listingKind: "barter" as unknown as PublicBusinessListing["listingKind"] });
    const model = build(view({}, [unknown]));
    expect(model.offers).toEqual([]);
    expect(model.seeking).toEqual([]);
  });

  it("composes the place from what exists", () => {
    const place = (locationLabel: string | null, locationCountry: string | null) =>
      build(view({}, [listing({ locationLabel, locationCountry })])).offers[0].place;
    expect(place("Kaunas", "LT")).toBe("Kaunas (Lithuania)");
    expect(place("Kaunas", null)).toBe("Kaunas");
    expect(place(null, "LT")).toBe("Lithuania");
    expect(place(null, null)).toBeNull();
    expect(place(" ", " ")).toBeNull();
  });

  it("keeps the company's own price text and blanks an empty one", () => {
    expect(build(view({}, [listing({ priceText: "pagal susitarimą" })])).offers[0].priceText).toBe("pagal susitarimą");
    expect(build(view({}, [listing({ priceText: " " })])).offers[0].priceText).toBeNull();
  });
});

describe("hero country", () => {
  it("names a code in the reader's language", () => {
    expect(buildCompanyTeamProfile(view({ country: "LT" }), "en").hero.country).toBe("Lithuania");
    expect(buildCompanyTeamProfile(view({ country: "LT" }), "lt").hero.country).toBe("Lietuva");
  });

  it("keeps what the company wrote when it does not resolve", () => {
    expect(build(view({ country: "Baltijos šalys" })).hero.country).toBe("Baltijos šalys");
  });
});

describe("contact reaches this company or is absent", () => {
  it("offers e-mail, phone, website in that order", () => {
    const model = build(view({ contactEmail: "info@alfa.lt", contactPhone: "+370 (600) 00-000", website: "www.alfa.lt/kontaktai" }));
    expect(model.contact).toEqual([
      { kind: "email", value: "info@alfa.lt", href: "mailto:info@alfa.lt" },
      { kind: "phone", value: "+370 (600) 00-000", href: "tel:+37060000000" },
      { kind: "website", value: "alfa.lt", href: "https://www.alfa.lt/kontaktai" },
    ]);
  });

  it("each single channel stands alone", () => {
    expect(build(view({ contactEmail: "info@alfa.lt" })).contact.map((a) => a.kind)).toEqual(["email"]);
    expect(build(view({ contactPhone: "860000000" })).contact.map((a) => a.kind)).toEqual(["phone"]);
    expect(build(view({ website: "https://alfa.lt" })).contact.map((a) => a.kind)).toEqual(["website"]);
  });

  it("every href goes to the company's own channel, never to a platform route", () => {
    const model = build(view({ contactEmail: "info@alfa.lt", contactPhone: "860000000", website: "alfa.lt" }));
    for (const action of model.contact) {
      expect(action.href).toMatch(/^(mailto:|tel:|https:\/\/)/);
      expect(action.href).not.toContain("labourmarket");
    }
  });

  it("refuses an e-mail a mailto: would read as more than one address", () => {
    for (const bad of [
      "no-at-sign",
      "two words@alfa.lt",
      "a@alfa.lt?bcc=x@y.lt",
      "a@alfa.lt,b@alfa.lt",
      "a@alfa",
      "a@b@alfa.lt",
      "<a@alfa.lt>",
    ]) {
      expect(build(view({ contactEmail: bad })).contact, bad).toEqual([]);
    }
  });

  it("refuses a phone that is not a dialable number", () => {
    for (const bad of ["skambinti vakare", "+370 600 00000 vakare", "123", "1234567890123456", "tel:+37060000000"]) {
      expect(build(view({ contactPhone: bad })).contact, bad).toEqual([]);
    }
  });

  it("refuses a website with another scheme", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/internal", "not a url"]) {
      expect(build(view({ website: bad })).contact, bad).toEqual([]);
    }
  });
});
