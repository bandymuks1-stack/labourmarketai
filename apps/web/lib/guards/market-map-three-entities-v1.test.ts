import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map three-entities guard v1 (Sprint v2 §6).
 *
 * Locks the owner requirement: the map supports THREE different spatial
 * entities — (1) person presence, (2) company operating territory,
 * (3) project location — never mixed into one pin type, with §20-safe person
 * handling (aggregate-only, n<5 band, no exact person coordinates without an
 * explicit consent — which does not exist yet) and platform-workflow-only
 * communication. Also pins the architecture boundaries: props-only UI
 * component, owner-scoped composer with no privileged path, NO new migration.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MODEL = read("lib/market-map/spatial-entities.ts");
const COMPOSER = read("lib/market-map/spatial-read.ts");
const TERRITORY = read("lib/market-map/territory-view.ts");
const WORLD_UI = read("components/app/market-map/world-discovery.tsx");
const PAGE = read("app/[locale]/dashboard/market-map/page.tsx");

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;
const mmEntities = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)).marketMap?.entities;

describe("typed three-entity model", () => {
  it("defines exactly the three owner-required kinds", () => {
    expect(MODEL).toContain('"person_presence"');
    expect(MODEL).toContain('"company_territory"');
    expect(MODEL).toContain('"project_location"');
    expect(MODEL).toMatch(/SPATIAL_ENTITY_KINDS/);
    expect(MODEL).toMatch(/SPATIAL_ENTITY_REGISTRY/);
  });

  it("each kind has a DISTINCT rendering contract (never one shared pin type)", () => {
    for (const render of ["area_bucket", "territory_shape", "point_pin"]) {
      expect(MODEL).toContain(`"${render}"`);
    }
  });

  it("communication is pinned to the platform workflow on every kind", () => {
    const occurrences = MODEL.match(/platform_workflow_only/g) ?? [];
    // Type + three registry entries at minimum.
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
    // No direct-contact channel may surface on map entities.
    for (const banned of [/phoneNumber/, /emailAddress/, /directContact/]) {
      expect(MODEL).not.toMatch(banned);
      expect(WORLD_UI).not.toMatch(banned);
      expect(TERRITORY).not.toMatch(banned);
    }
  });

  it("the collections shape is typed per kind — no combined mixed array", () => {
    expect(MODEL).toMatch(/personPresence:\s*PersonPresenceEntity\[\]/);
    expect(MODEL).toMatch(/companyTerritories:\s*CompanyTerritoryEntity\[\]/);
    expect(MODEL).toMatch(/projectLocations:\s*ProjectLocationEntity\[\]/);
    expect(MODEL).not.toMatch(/all:\s*\w*SpatialEntity/);
  });
});

describe("§20 person layer — aggregate-only, no exact person point", () => {
  it("no individual-pin consent exists; the constant stays false until an owner decision", () => {
    expect(MODEL).toMatch(
      /export const INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS = false as const/,
    );
  });

  it("the n<5 small-sample threshold is pinned", () => {
    expect(MODEL).toMatch(/export const PERSON_PRESENCE_MIN_N = 5/);
    expect(MODEL).toMatch(/small_sample/);
  });

  it("the PersonPresenceEntity interface declares NO coordinate field", () => {
    const iface = MODEL.match(
      /export interface PersonPresenceEntity \{[\s\S]*?\n\}/,
    )?.[0];
    expect(iface, "PersonPresenceEntity interface").toBeTruthy();
    expect(iface!).not.toMatch(/latitude|longitude|\blat\b|\blng\b|coords?/i);
  });

  it("the model reuses the read layer's aggregation engine (no parallel weaker path)", () => {
    expect(MODEL).toMatch(/aggregateSignals/);
    expect(MODEL).toMatch(/DEFAULT_MIN_BUCKET/);
  });
});

describe("owner-scoped composer — RLS only, no privileged path", () => {
  it("is server-only and composes the EXISTING owner-scoped sources", () => {
    expect(COMPOSER).toMatch(/server-only/);
    expect(COMPOSER).toMatch(/getOwnMarketSignals/);
    // Train D: the company territory source is the canonical work_objects
    // entity (membership-scoped RLS read) — the superseded company_locations
    // draft is never applied (Train M verdict).
    expect(COMPOSER).toMatch(/getCompanyTerritoryFromObjects/);
  });
  it("no service_role, no RPC, no cross-user read", () => {
    expect(COMPOSER).not.toMatch(/service_role|SERVICE_ROLE|SECURITY DEFINER/);
    expect(COMPOSER).not.toMatch(/\.rpc\(/);
    expect(COMPOSER).not.toMatch(/\bmarketSignals\b/);
  });
});

describe("layer separation — the three kinds are layers of the ONE map (no separate list component)", () => {
  // History: this block pinned `market-map-entity-layers.tsx`, a props-only
  // text list with one toggle per kind. The one-canonical-map change folded it
  // into the canonical map: the three kinds stay SEPARATE typed collections and
  // reach the viewer as separate layers, never one mixed pin type —
  //   person_presence   → the world "supply" layer (aggregate-only buckets),
  //   project_location  → the world "projects" layer,
  //   company_territory → the "territory" layer built by `territory-view.ts`.
  it("the old list component is gone and the page no longer renders it", () => {
    expect(existsSync(join(APP, "components/app/market-map-entity-layers.tsx"))).toBe(false);
    expect(PAGE).not.toMatch(/MarketMapEntityLayers/);
  });

  it("the page wires the owner composer into the territory layer", () => {
    // The page reads the owner's spatial collections through the request-cached
    // wrapper it shares with the market brief (one read, not two) — which must
    // still BE `getOwnSpatialCollections`.
    expect(PAGE).toMatch(/loadOwnSpatialOnce/);
    expect(read("lib/market-map/market-brief.ts")).toMatch(/getOwnSpatialCollections()/);
    expect(PAGE).toMatch(/buildTerritoryView/);
    expect(PAGE).toMatch(/staticLayers\.territory\s*=/);
  });

  it("the territory layer is its own colour/layer, never the person or project pin", () => {
    expect(TERRITORY).toMatch(/layer:\s*"territory"/);
    expect(TERRITORY).not.toMatch(/layer:\s*"(people|projects|demand)"/);
  });

  it("the map offers a layer pill per world kind + only the data layers that exist", () => {
    const world = read("components/app/market-map/world-discovery.tsx");
    expect(world).toMatch(/\.\.\.WORLD_LAYERS,\s*\.\.\.availableStatic/);
    expect(world).toMatch(/aria-pressed=\{active\}/);
  });
});

describe("i18n — the removed entities copy is gone; the layer names exist in every locale", () => {
  for (const loc of ACTIVE_LOCALES) {
    it(`${loc}: no marketMap.entities subtree; layer pills named`, () => {
      expect(mmEntities(loc), `${loc} marketMap.entities`).toBeUndefined();
      const layers = JSON.parse(read(`messages/${loc}.json`)).marketMap.world.layers;
      for (const k of ["demand", "supply", "projects", "jobs", "territory"]) {
        expect(layers[k], `${loc} layers.${k}`).toBeTruthy();
      }
    });
  }
});

describe("no new migration — the slice derives from existing tables", () => {
  it("the model/composer/component add no DB schema statements", () => {
    for (const src of [MODEL, COMPOSER, TERRITORY]) {
      expect(src).not.toMatch(/create table|alter table|drop table/i);
    }
  });
  it("no 2026071422xxxx migration file was added", () => {
    const dir = join(REPO, "supabase", "migrations");
    expect(existsSync(dir)).toBe(true);
    const offenders = readdirSync(dir).filter((f) =>
      f.startsWith("2026071422"),
    );
    expect(offenders).toEqual([]);
  });
});

describe("docs — the model is documented for the owner", () => {
  it("docs/product/market-map-three-entities-v1.md exists with the §20 statement", () => {
    const p = join(REPO, "docs", "product", "market-map-three-entities-v1.md");
    expect(existsSync(p)).toBe(true);
    const doc = readFileSync(p, "utf8");
    for (const phrase of [
      "person_presence",
      "company_territory",
      "project_location",
      "§20",
      "n<5",
      "platform_workflow_only",
      "INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS",
    ]) {
      expect(doc, `doc missing: ${phrase}`).toContain(phrase);
    }
  });
});
