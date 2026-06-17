import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map working-owner-map framing v1 guard (post-#463).
 *
 * The owner signals already work, so the page must read as a WORKING owner
 * market-map space — not a foundation / scaffold / "schema prepared" system.
 * This guard locks the reframing and the honest limits that stay:
 *   - no "foundation" / "schema prepared" / "planned layer" / scaffold framing;
 *   - the owner architecture is unchanged (owner-only getOwnMarketSignals, no
 *     public/cross-user aggregate, no service_role / RPC / SECURITY DEFINER);
 *   - future layers are clearly separated as "next stage";
 *   - honest limits kept: public layer only later + aggregation-safeguarded.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const SHELL = read("components/app/market-map-shell.tsx");
const LOCALES = ["lt", "en", "ru"] as const;
const mm = (loc: string) => JSON.parse(read(`messages/${loc}.json`)).marketMap;

describe("no scaffold / foundation framing in Market Map copy", () => {
  const BANNED = [
    /foundation/i,
    /schema parengta|schema prepared|схема подготовлена/i,
    /planned layer/i,
    /\bscaffold\b/i,
    /ruošiam/i,
    /bus vėliau/i,
    /готовится/i,
    /being prepared/i,
  ];
  for (const loc of LOCALES) {
    it(`${loc}: marketMap bundle has no scaffold framing`, () => {
      const blob = JSON.stringify(mm(loc));
      for (const re of BANNED) expect(blob, `${loc} ${re.source}`).not.toMatch(re);
    });
  }
  it("the shell drops the old foundation/scaffold identifiers", () => {
    for (const id of [
      "foundationNotice",
      "market-map-foundation-notice",
      "schemaPrepared",
      "layerPlanned",
      "layerSchemaPrepared",
      "layerSignalOnly",
      "demandSchemaNote",
    ]) {
      expect(SHELL, id).not.toContain(id);
    }
  });
});

describe("page is reframed as the owner's working market map", () => {
  const EXPECT_TITLE = {
    lt: /mano rinkos žemėlapis/i,
    en: /my market map/i,
    ru: /моя карта рынка/i,
  } as const;
  for (const loc of LOCALES) {
    it(`${loc}: title says "my market map"`, () => {
      expect(String(mm(loc).title)).toMatch(EXPECT_TITLE[loc]);
    });
    it(`${loc}: owner scope note is present`, () => {
      expect(mm(loc).ownerScopeNote, `${loc} ownerScopeNote`).toBeTruthy();
    });
  }
  it("the shell renders the owner scope note + active/next-stage layers", () => {
    expect(SHELL).toContain('data-testid="market-map-owner-scope-note"');
    expect(SHELL).toMatch(/ownerScopeNote/);
    expect(SHELL).toMatch(/ACTIVE_LAYERS\b/);
    expect(SHELL).toMatch(/NEXT_STAGE_LAYERS\b/);
    expect(SHELL).toContain('data-testid="market-map-next-stage"');
    expect(SHELL).toMatch(/layerActive/);
    expect(SHELL).toMatch(/layerNextStage/);
  });
});

describe("honest limits are kept (no public aggregate yet)", () => {
  const AGG = { lt: /agregav/i, en: /aggregation/i, ru: /агрегиров/i } as const;
  for (const loc of LOCALES) {
    it(`${loc}: scope note promises the public layer only with aggregation safeguards`, () => {
      expect(String(mm(loc).ownerScopeNote)).toMatch(AGG[loc]);
    });
  }
});

describe("owner architecture unchanged", () => {
  it("the shell still drives the view from the owner-only read layer", () => {
    expect(SHELL).toMatch(/getOwnMarketSignals/);
  });
  it("no public/cross-user aggregate, no privileged path in the shell", () => {
    expect(SHELL).not.toMatch(/\bmarketSignals\b/);
    expect(SHELL).not.toMatch(/service_role|SERVICE_ROLE|SECURITY DEFINER/);
    expect(SHELL).not.toMatch(/\.rpc\(/);
  });
  it("the shell adds no DB schema statements", () => {
    expect(SHELL).not.toMatch(/create table|alter table|drop table/i);
  });
});
