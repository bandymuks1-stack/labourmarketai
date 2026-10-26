import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { CustomerRequestRow } from "@/lib/buyer/customer-requests";
import { resolveNeedsAudience } from "@/lib/company/agency-capability";
import {
  COMPANY_HOME_OFFER_LIMIT,
  COMPANY_OFFERS_HREF,
  COMPANY_OFFER_INTAKE_HREF,
  deriveHomeOffers,
  homeReadbackRows,
} from "@/lib/company/company-home-field-model";
import { activeLocales } from "@/lib/i18n/config";

/**
 * AN AGENCY FINDS ITS SAVED OFFER WHERE IT LANDS (activation audit 2026-10-26
 * §2; owner priority P1 "agentūra: visa grandinė").
 *
 * What the audit found: an agency's saved item is an OFFER (its Needs door
 * opens on one — `resolveNeedsAudience`), but the company home handed the
 * field only NEEDS (`direction === "demand"`) and dropped the offers it had
 * already read, so after saving an agency saw nothing on its home.
 *
 * What this guard keeps true:
 *   - ONE read: the home's offers are the supply rows of the same
 *     `listOwnCustomerRequests` the Needs door lists — no second read, no
 *     second store, no new table;
 *   - the block shows for an organisation whose Needs door opens on an offer
 *     (with an honest empty state), for an agency-and-client only once it has
 *     an offer, and never for a plain employer;
 *   - a failed read says so, never "no offers" (unknown is not zero);
 *   - the links are quiet and lead to real places: the Needs door's own list
 *     of offers (`#agency-offers`) or the offer intake (`#demand-intake`);
 *   - the copy exists in every active locale, LT informal, no "demo", and it
 *     never says an offer was published.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const HOME = "app/[locale]/dashboard/company/page.tsx";
const FIELD = "components/app/company-home-field-section.tsx";
const READBACK = "components/app/demand-requests-readback.tsx";
const NEEDS = "app/[locale]/dashboard/company/needs/page.tsx";

function row(over: Partial<CustomerRequestRow>): CustomerRequestRow {
  return {
    id: over.id ?? "00000000-0000-4000-8000-000000000001",
    profileId: "p",
    customerId: null,
    title: "Suvirintojų komanda",
    needSummary: null,
    country: null,
    location: null,
    roleOrWorkType: null,
    teamSize: null,
    startPeriod: null,
    duration: null,
    languageRequirement: null,
    notes: null,
    payload: null,
    status: "submitted",
    manualReviewNote: null,
    createdAt: "2026-10-26T10:00:00Z",
    updatedAt: "2026-10-26T10:00:00Z",
    direction: "supply",
    ...over,
  };
}

const offer = (id: string, status: CustomerRequestRow["status"] = "submitted") =>
  row({ id, status, direction: "supply" });
const need = (id: string) => row({ id, direction: "demand" });

describe("one read, two directions", () => {
  it("homeReadbackRows splits the own-requests read by the row's own direction", () => {
    const readback = { kind: "ok" as const, rows: [need("n1"), offer("o1"), offer("o2")] };
    const needs = homeReadbackRows(readback, "demand");
    const offers = homeReadbackRows(readback, "supply");
    expect(needs.kind === "ok" && needs.rows.map((r) => r.id)).toEqual(["n1"]);
    expect(offers.kind === "ok" && offers.rows.map((r) => r.id)).toEqual(["o1", "o2"]);
  });

  it("a failed read stays failed in both directions, and no error text travels on", () => {
    expect(homeReadbackRows({ kind: "error", message: "boom" }, "supply")).toEqual({ kind: "error" });
    expect(homeReadbackRows({ kind: "needs-migration" }, "demand")).toEqual({ kind: "needs-migration" });
  });

  it("the page reads the own requests ONCE and hands both directions to the field", () => {
    const src = strip(read(HOME));
    expect(src.match(/listOwnCustomerRequests\(/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/needs=\{homeReadbackRows\(demandReadback, "demand"\)\}/);
    expect(src).toMatch(/offers=\{homeReadbackRows\(demandReadback, "supply"\)\}/);
  });

  it("the field reads nothing itself — no second reader, no client, no store", () => {
    const src = strip(read(FIELD));
    expect(src).not.toMatch(/listOwnCustomerRequests|createSupabase|from\("customer_requests"\)|\.rpc\(/);
  });
});

describe("who sees the offers block", () => {
  const ok = (rows: CustomerRequestRow[]) => ({ kind: "ok" as const, rows });

  it("an agency (its Needs door opens on an offer) sees its offers", () => {
    const aud = resolveNeedsAudience({ companyType: "staffing_agency", capabilities: [] });
    expect(aud.audience).toBe("offer");
    const s = deriveHomeOffers({ ...aud, offers: ok([offer("o1")]) });
    expect(s.kind).toBe("list");
    expect(s.kind === "list" && s.rows.map((r) => r.id)).toEqual(["o1"]);
  });

  it("an agency with no offer yet gets the honest empty state, not silence", () => {
    expect(deriveHomeOffers({ audience: "offer", canChoose: false, offers: ok([]) })).toEqual({ kind: "none" });
  });

  it("a failed read is unreadable for an agency — unknown is not zero", () => {
    expect(deriveHomeOffers({ audience: "offer", canChoose: false, offers: { kind: "error" } })).toEqual({
      kind: "unreadable",
    });
  });

  it("a plain employer never sees an offers block", () => {
    const aud = resolveNeedsAudience({ companyType: "construction", capabilities: [] });
    expect(aud).toEqual({ audience: "need", canChoose: false });
    expect(deriveHomeOffers({ ...aud, offers: ok([]) })).toEqual({ kind: "hidden" });
    expect(deriveHomeOffers({ ...aud, offers: { kind: "error" } })).toEqual({ kind: "hidden" });
  });

  it("an agency-and-client sees the block once it has saved an offer", () => {
    const aud = resolveNeedsAudience({ companyType: "construction", capabilities: ["workforce_provider"] });
    expect(aud).toEqual({ audience: "need", canChoose: true });
    expect(deriveHomeOffers({ ...aud, offers: ok([]) })).toEqual({ kind: "hidden" });
    expect(deriveHomeOffers({ ...aud, offers: ok([offer("o1")]) }).kind).toBe("list");
  });

  it("only closed offers: said as such; open offers are bounded and the rest counted", () => {
    expect(
      deriveHomeOffers({ audience: "offer", canChoose: false, offers: ok([offer("o1", "closed")]) }),
    ).toEqual({ kind: "none-open" });
    const many = Array.from({ length: COMPANY_HOME_OFFER_LIMIT + 2 }, (_, i) => offer(`o${i}`));
    const s = deriveHomeOffers({ audience: "offer", canChoose: false, offers: ok([...many, offer("c", "closed")]) });
    expect(s.kind === "list" && s.rows.length).toBe(COMPANY_HOME_OFFER_LIMIT);
    expect(s.kind === "list" && s.more).toBe(2);
  });

  it("a need row handed in by mistake is never shown as an offer", () => {
    expect(deriveHomeOffers({ audience: "offer", canChoose: false, offers: ok([need("n1")]) })).toEqual({
      kind: "none",
    });
  });
});

describe("the block on the home", () => {
  it("renders inside the home field, right under the capabilities strip", () => {
    const src = strip(read(FIELD));
    const field = src.indexOf('aria-labelledby="company-home-field-title"');
    const header = src.indexOf("</header>", field);
    const block = src.indexOf("<CompanyHomeOffers state={offersState} />");
    const projects = src.indexOf('data-testid="company-home-projects"');
    expect(field).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(header);
    expect(projects).toBeGreaterThan(block);
    expect(src).toMatch(
      /const needsDoor = resolveNeedsAudience\(\{ companyType, capabilities \}\);[\s\S]*const offersState = deriveHomeOffers\(\{ \.\.\.needsDoor, offers \}\);/,
    );
  });

  it("states each case, unreadable before empty, and keeps the links quiet", () => {
    const src = strip(read(FIELD));
    const start = src.indexOf("export async function CompanyHomeOffers");
    const end = src.indexOf("export interface CompanyHomePartners");
    const block = src.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/if \(state\.kind === "hidden"\) return null;/);
    const unreadable = block.indexOf('data-testid="company-home-offers-unreadable"');
    const empty = block.indexOf('data-testid="company-home-offers-empty"');
    expect(unreadable).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(unreadable);
    for (const id of ["company-home-offer", "company-home-offers-open", "company-home-offers-new", "company-home-offers-none-open"]) {
      expect(block).toContain(`data-testid="${id}"`);
    }
    // One primary action per screen: the block adds none.
    expect(block).not.toMatch(/PRIMARY_LINK|buttonLinkClassName/);
    expect(block).toMatch(/href=\{COMPANY_OFFERS_HREF as "\/dashboard"\}/);
    expect(block).toMatch(/href=\{COMPANY_OFFER_INTAKE_HREF as "\/dashboard"\}/);
    // The intake keeps the label it already has on the Needs door.
    expect(block).toMatch(/getTranslations\("auth\.dashboard\.wow\.demand\.partner"\)/);
    expect(block).toMatch(/\{tOffer\("cta"\)\}/);
    // A synthetic English placeholder title is localized, as on the Needs door.
    expect(block).toMatch(/resolveDemandTitle\(o\.title, synthetic\)/);
  });

  it("every link leads to a place that exists", () => {
    expect(COMPANY_OFFERS_HREF).toBe("/dashboard/company/needs#agency-offers");
    const readback = strip(read(READBACK));
    expect(readback).toMatch(/id="agency-offers"\s+aria-labelledby="supply-readback-title"\s+data-testid="supply-offers-readback"/);
    expect(read(NEEDS)).toMatch(/<DemandRequestsReadback\b/);
    expect(COMPANY_OFFER_INTAKE_HREF).toBe("/dashboard/company/needs?audience=offer#demand-intake");
    expect(read(NEEDS)).toMatch(/id="demand-intake"/);
    expect(read(NEEDS)).toMatch(/sp\?\.audience/);
  });
});

describe("the offers copy in every active locale", () => {
  const KEYS = ["heading", "note", "empty", "noneOpen", "more", "open", "unreadable"] as const;
  const PUBLISH = /publish|paskelb|опубликов|publiceer|veröffentlich|opublik/i;
  const DEMO = /(?<![\p{L}\p{N}_])demos?(?![\p{L}\p{N}_])/iu;
  for (const loc of activeLocales) {
    it(`${loc}: companyHome.offers is complete and honest`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const o = m.companyHome?.offers as Record<string, string> | undefined;
      for (const k of KEYS) {
        expect(typeof o?.[k] === "string" && o[k].trim() !== "", `${loc}.companyHome.offers.${k}`).toBe(true);
      }
      expect(o!.more).toMatch(/\{count, plural,/);
      expect(o!.unreadable).not.toBe(o!.empty);
      expect(JSON.stringify(o)).not.toMatch(PUBLISH);
      expect(JSON.stringify(o)).not.toMatch(DEMO);
      // The intake label the block borrows exists too.
      expect(typeof m.auth?.dashboard?.wow?.demand?.partner?.cta).toBe("string");
      if (loc === "lt") {
        // LT is informal: "tu", never the formal "Jūs".
        expect(JSON.stringify(o)).not.toMatch(/\b(Jūs|jūs|Jūsų|jūsų|Jums|jums)\b/);
      }
    });
  }
});

describe("an offer-first organisation is never shown a need door that opens the offer form", () => {
  it("the field's need door renders only when the Needs door opens on a need", () => {
    const field = strip(read(FIELD));
    expect(field).toMatch(/const showNeedDoor = needsDoor\.audience !== "offer";/);
    expect(field).toMatch(/\{showNeedDoor \? \(\s*<NeedDoorLink\s+surface="company_home_field"/);
  });

  it("the home action row's need door has the same rule", () => {
    const home = strip(read(HOME));
    expect(home).toMatch(
      /resolveNeedsAudience\(\{ companyType: companyRow\?\.companyType, capabilities: declaredCapabilities \}\)\.audience === "need" \? \(\s*<NeedDoorLink surface="company_home_actions"/,
    );
  });

  it("the rule it relies on: an agency-only organisation's door is the offer", () => {
    expect(resolveNeedsAudience({ companyType: "staffing_agency", capabilities: [] }).audience).toBe("offer");
    expect(resolveNeedsAudience({ companyType: "construction", capabilities: [] }).audience).toBe("need");
  });
});
