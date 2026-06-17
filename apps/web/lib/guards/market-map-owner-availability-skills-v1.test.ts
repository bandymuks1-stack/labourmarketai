import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map owner availability + skills hints v1 guard.
 *
 * Owner-only availability/mobility + capability signals: RLS-scoped reads of the
 * caller's OWN worker row + skills/journal evidence — no public aggregate, no
 * cross-user read, no service_role / RPC / SECURITY DEFINER, no DB migration, no
 * coordinates. "confirmed" is set ONLY from a real verification flag (never a
 * fabricated claim), and missing data shows an action, never a fake/empty state.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const LIB = read("lib/market-map/owner-readiness.ts");
const UI = read("components/app/market-map-owner-readiness.tsx");
const PAGE = read("app/[locale]/dashboard/market-map/page.tsx");
const LOCALES = ["lt", "en", "ru"] as const;
const mm = (loc: string) => JSON.parse(read(`messages/${loc}.json`)).marketMap;

function stripComments(src: string): string {
  return src
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("owner-scoped reads only — no cross-user, no privileged path", () => {
  it("uses the RLS server client + auth.getUser, scoped to the caller", () => {
    expect(LIB).toMatch(/@\/lib\/supabase\/server/);
    expect(LIB).toMatch(/auth\.getUser/);
    expect(LIB).toMatch(/\.eq\("profile_id",\s*user\.id\)/);
    expect(LIB).toMatch(/\.eq\("worker_id",\s*workerId\)/);
  });
  it("no service_role / RPC / SECURITY DEFINER / coordinates", () => {
    expect(LIB).not.toMatch(/service_role|SERVICE_ROLE|SECURITY DEFINER/);
    expect(LIB).not.toMatch(/\.rpc\(/);
    expect(LIB).not.toMatch(/\blatitude\b|\blongitude\b/);
  });
  it("never reads another user's rows (no cross-user filter bypass)", () => {
    expect(LIB).not.toMatch(/\.neq\("profile_id"|or\(.*profile_id/);
  });
  it("the UI never imports the public/cross-user aggregate", () => {
    expect(UI).not.toMatch(/\bmarketSignals\b/);
    expect(LIB).not.toMatch(/\bmarketSignals\b/);
  });
  it("no DB schema statements in the new surface", () => {
    for (const src of [LIB, UI, PAGE]) {
      expect(src).not.toMatch(/create table|alter table|drop table/i);
    }
  });
});

describe("confirmed requires real verification — no fake verification", () => {
  it("status 'confirmed' is derived ONLY from worker_skills.verified === true", () => {
    expect(LIB).toMatch(/verified\s*=\s*r\.verified === true/);
    expect(LIB).toMatch(/verified[\s\S]{0,40}\?\s*"confirmed"/);
  });
  it("the UI renders the status from data, never a hardcoded confirmed claim", () => {
    // status labels are localized via the per-status count chips; each skill
    // chip is tagged with its data-driven status (no fabricated claim).
    expect(UI).toMatch(/status\.\$\{s\}/);
    expect(UI).toMatch(/capability-chip-\$\{c\.status\}/);
    expect(UI).not.toMatch(/AI-verified/i);
  });
});

describe("page wiring + no fake/empty state", () => {
  it("the page fetches availability + capabilities and mounts the block", () => {
    expect(PAGE).toMatch(/getOwnAvailability/);
    expect(PAGE).toMatch(/getOwnCapabilities/);
    expect(PAGE).toMatch(/<MarketMapOwnerReadiness\b/);
  });
  it("missing data shows an action, not a fake/empty state", () => {
    expect(UI).toMatch(/availability\.hasWorker/);
    expect(UI).toContain("readiness-add");
    expect(UI).toContain("capabilities-add");
    expect(UI).toMatch(/addAction/);
  });
  it("renders localized availability state + capability status (not raw enum)", () => {
    expect(UI).toMatch(/state\.\$\{availability\.state\}/);
    expect(UI).not.toMatch(/>\{availability\.state\}</);
    expect(UI).not.toMatch(/>\{c\.status\}</);
  });
});

describe("i18n — readiness + capabilities present in every locale", () => {
  for (const loc of LOCALES) {
    it(`${loc}: readiness + capabilities keys present`, () => {
      const r = mm(loc).readiness;
      const c = mm(loc).capabilities;
      for (const k of ["available", "busy", "unavailable", "unknown"]) expect(r?.state?.[k], `${loc} state.${k}`).toBeTruthy();
      expect(r?.title && r?.note && r?.addAction && r?.availableFrom, `${loc} readiness`).toBeTruthy();
      for (const k of ["confirmed", "suggested", "self_declared"]) expect(c?.status?.[k], `${loc} status.${k}`).toBeTruthy();
      expect(c?.title && c?.note && c?.addAction && c?.legend, `${loc} capabilities`).toBeTruthy();
    });
  }
});

describe("copy guard — no technical / scaffold / fake terms", () => {
  const BANNED = [
    /\bfake\b/i,
    /netikr/i,
    /kol kas tuščias/i,
    /schema prepared|schema parengta/i,
    /foundation/i,
    /coming.?soon/i,
    /\bRLS\b/,
    /read layer/i,
    /SECURITY DEFINER/i,
  ];
  for (const loc of LOCALES) {
    it(`${loc}: marketMap copy has no banned terms`, () => {
      const blob = JSON.stringify(mm(loc));
      for (const re of BANNED) expect(blob, `${loc} ${re.source}`).not.toMatch(re);
    });
  }
  it("the readiness component renders no banned terms", () => {
    const ui = stripComments(UI);
    for (const re of BANNED) expect(ui, re.source).not.toMatch(re);
  });
});
