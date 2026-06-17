import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map capture v1 guard — owner-scoped entry/management flows.
 *
 * Forms write ONLY the caller's own rows (RLS, profile_id/owner_id = auth.uid()),
 * country/region level, no coordinates/address. No public aggregate, no
 * cross-user read, no service_role, no SECURITY DEFINER. After a write the
 * actions revalidate so the map's owner view (getOwnMarketSignals) updates.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const HELPER = read("lib/market-map/capture.ts");
const ACTIONS = read("lib/market-map/capture-actions.ts");
const UI = read("components/app/market-map-capture.tsx");
const PAGE = read("app/[locale]/dashboard/market-map/page.tsx");
const LOCALES = ["lt", "en", "ru"] as const;

describe("owner-scoped, RLS-only writes", () => {
  it("uses the RLS server client + auth.getUser, never service_role/definer/rpc", () => {
    expect(HELPER).toMatch(/@\/lib\/supabase\/server/);
    expect(HELPER).toMatch(/auth\.getUser/);
    expect(HELPER).not.toMatch(/service_role|SERVICE_ROLE|SECURITY DEFINER/);
    expect(HELPER).not.toMatch(/\.rpc\(/);
  });
  it("pins writes to the caller (profile_id / owner_id = user.id)", () => {
    expect(HELPER).toMatch(/profile_id:\s*user\.id/);
    expect(HELPER).toMatch(/owner_id"?\)?\s*,\s*user\.id|eq\("owner_id",\s*user\.id\)/);
    // updates/deletes are scoped by the owner column too
    expect(HELPER).toMatch(/\.eq\("profile_id",\s*user\.id\)/);
  });
  it("never reads another user's rows (no cross-user filter bypass)", () => {
    // every select/update is filtered by the caller's own id
    expect(HELPER).not.toMatch(/\.neq\("profile_id"|or\(.*profile_id/);
  });
});

describe("login location consent — approximate, never exact", () => {
  it("the login helper has no coordinate/address write", () => {
    // isolate the login upsert
    const seg = HELPER.slice(HELPER.indexOf("setLoginLocationConsent"));
    expect(seg).not.toMatch(/\blatitude\b|\blongitude\b|\baddress\b|\blat\b|\blng\b/);
    expect(seg).toMatch(/consent_status/);
    expect(seg).toMatch(/precision_level/);
  });
  it("consent values are constrained (not_requested/consented/revoked)", () => {
    expect(HELPER).toMatch(/"not_requested",\s*"consented",\s*"revoked"/);
  });
});

describe("company-need: edit/disable only here (create stays in demand flow)", () => {
  it("capture helper does NOT insert into company_demand_locations", () => {
    expect(HELPER).not.toMatch(/from\("company_demand_locations"\)[\s\S]{0,80}\.insert/);
  });
  it("it can disable + update need_type/visibility on the owner's rows", () => {
    expect(HELPER).toMatch(/setDemandLocationActive/);
    expect(HELPER).toMatch(/updateDemandLocation/);
  });
});

describe("page wiring — capture mounted; map refreshes via the read layer", () => {
  it("market-map page mounts MarketMapCapture with the owner's current rows", () => {
    expect(PAGE).toMatch(/<MarketMapCapture\b/);
    expect(PAGE).toMatch(/listOwnPreferredLocations/);
    expect(PAGE).toMatch(/getOwnLoginConsent/);
    expect(PAGE).toMatch(/listOwnDemandLocations/);
  });
  it("the shell still drives the owner view from getOwnMarketSignals", () => {
    expect(read("components/app/market-map-shell.tsx")).toMatch(/getOwnMarketSignals/);
  });
  it("actions revalidate so the map updates after a write", () => {
    expect(ACTIONS).toMatch(/revalidatePath/);
    expect(ACTIONS).not.toMatch(/\bmarketSignals\b/);
  });
});

describe("UI wiring — real CTAs, add/edit/disable + consent", () => {
  it("preferred add + per-row disable + per-row visibility edit", () => {
    for (const id of ["capture-preferred-add", "capture-preferred-toggle", "capture-preferred-visibility"]) {
      expect(UI).toContain(id);
    }
    expect(UI).toMatch(/addPreferredLocationAction/);
    expect(UI).toMatch(/setPreferredLocationActiveAction/);
    expect(UI).toMatch(/updatePreferredLocationAction/);
  });
  it("login consent toggle (consented/revoked) is wired", () => {
    expect(UI).toMatch(/setLoginLocationConsentAction/);
    // testid is `capture-login-${c}` (template) over the consent values.
    expect(UI).toContain("capture-login-");
    expect(UI).toMatch(/"not_requested",\s*"consented",\s*"revoked"/);
  });
  it("demand disable wired; create links to a real route (no coming-soon)", () => {
    expect(UI).toMatch(/setDemandLocationActiveAction/);
    expect(UI).toMatch(/\/dashboard\/company/);
    expect(UI).not.toMatch(/coming.?soon|ruošiam|готовится/i);
  });
  it("the UI never calls the public/cross-user aggregate", () => {
    expect(UI).not.toMatch(/\bmarketSignals\b/);
  });
});

describe("i18n — capture copy present + clean in every locale", () => {
  for (const loc of LOCALES) {
    it(`${loc}: marketMap.capture keys present, no fake/empty framing`, () => {
      const cap = JSON.parse(read(`messages/${loc}.json`)).marketMap.capture;
      expect(cap, `${loc} capture`).toBeTruthy();
      for (const k of ["title", "preferred", "login", "demand", "intent", "visibility"]) {
        expect(cap[k], `${loc} capture.${k}`).toBeTruthy();
      }
      expect(JSON.stringify(cap)).not.toMatch(/\bfake\b|kol kas tuščias|фиктивн/i);
    });
  }
});
