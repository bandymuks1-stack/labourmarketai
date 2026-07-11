import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Operator launch-readiness guard (launch repair Scope E).
 *
 * The readiness view must stay REAL-DATA-ONLY:
 *   - service reads via the service-role client but authorizes with an
 *     explicit isSuperadmin() check first (admin.ts contract);
 *   - page sits in the requireSuperadmin-gated admin tree AND re-asserts it;
 *   - no fabricated fullness: no percentage rendering, no "ready" badges,
 *     unknown reads render "—";
 *   - counts touch only existing production tables (no new migration);
 *   - the honest gap doc exists and is referenced.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");
/** Source with comments stripped — the doc comments legitimately NAME the
 *  banned words while forbidding them. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SERVICE = "lib/admin/launch-readiness.ts";
const PAGE = "app/[locale]/dashboard/admin/launch-readiness/page.tsx";

describe("launch-readiness service is superadmin-gated and null-safe", () => {
  const svc = read(SERVICE);

  it("authorizes with isSuperadmin() before creating the admin client", () => {
    expect(svc).toMatch(/isSuperadmin\(\)/);
    expect(svc.indexOf("isSuperadmin()")).toBeLessThan(
      svc.indexOf("createAdminClient()"),
    );
  });

  it("degrades every read to null — never a fabricated number", () => {
    expect(svc).toMatch(/return null/);
    expect(code(SERVICE)).not.toMatch(/Math\.random|fake|mock/i);
  });

  it("counts only existing production tables", () => {
    const allowed = [
      "workers",
      "profiles",
      "companies",
      "company_need_public_intakes",
      "customer_requests",
      "organizations",
    ];
    const used = [...svc.matchAll(/count\(sb, "([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const t of used) expect(allowed).toContain(t);
  });

  it("declares the honest 15–25 consented-profile target", () => {
    expect(svc).toMatch(/CONSENTED_PROFILE_TARGET = \{ min: 15, max: 25 \}/);
  });
});

describe("launch-readiness page is honest and gated", () => {
  const page = read(PAGE);

  it("re-asserts requireSuperadmin", () => {
    expect(page).toMatch(/requireSuperadmin\(locale\)/);
  });

  it("renders unknown as — and never a percentage or ready badge", () => {
    expect(page).toMatch(/"—"/);
    const src = code(PAGE);
    expect(src).not.toMatch(/%|percent|toFixed/);
    expect(src).not.toMatch(/\bready\b.*badge/i);
  });

  it("links the operator to the company-need intake queue", () => {
    expect(page).toMatch(/\/dashboard\/admin\/company-need-intakes/);
  });
});

describe("supporting truth artifacts exist", () => {
  it("the gap analysis doc exists and the page references it", () => {
    expect(
      existsSync(
        join(WEB_ROOT, "..", "..", "docs", "launch", "real-supply-readiness-gap-v1.md"),
      ),
    ).toBe(true);
    expect(read(PAGE)).toMatch(/real-supply-readiness-gap-v1\.md/);
  });

  it("the control room links to the readiness view", () => {
    const hub = read("app/[locale]/dashboard/admin/page.tsx");
    expect(hub).toMatch(/\/dashboard\/admin\/launch-readiness/);
  });

  it("readiness copy exists in every active locale", () => {
    for (const locale of ["en", "lt", "ru", "nl", "de"]) {
      const catalog = JSON.parse(read(`messages/${locale}.json`)) as {
        adminLaunchReadiness?: { supply?: { total?: string } };
      };
      expect(
        catalog.adminLaunchReadiness?.supply?.total,
        `${locale} adminLaunchReadiness`,
      ).toBeTruthy();
    }
  });
});
