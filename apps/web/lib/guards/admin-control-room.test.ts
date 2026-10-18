import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Admin Owner/Operations Control Room guard (admin-control-room-map-visual-v1).
 *
 * The admin home is ONE coherent control room, not a flat grid of equal tiles:
 *   - an Overview KPI band (real aggregate counts),
 *   - control areas grouped by real purpose,
 *   - every area link resolves to a real page (nav sanity, no dead links),
 *   - internal diagnostic surfaces (project-truth, telemetry, agent-os) are
 *     explicitly flagged internal so their technical copy is not mistaken for
 *     an operational product surface.
 *
 * It also keeps admin-VISIBLE operational copy free of internal build/sprint
 * jargon. Technical detail is allowed ONLY on the internal diagnostic surfaces
 * (agentOs / telemetry namespaces), which this guard deliberately excludes.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const page = read("app/[locale]/dashboard/admin/page.tsx");

describe("admin home is a grouped control room, not a flat tile grid", () => {
  it("opens with what waits for an operator decision, then the grouped control areas", () => {
    // Owner directive 2026-09-16: the KPI band is gone — a number lives on
    // the queue it counts, and the platform's size is one sentence.
    expect(page).toMatch(/data-testid="admin-attention"/);
    expect(page).toMatch(/data-testid="admin-platform-summary"/);
    expect(page).not.toMatch(/data-testid="admin-overview-kpis"/);
    expect(page).toMatch(/data-testid="admin-control-areas"/);
    // The old flat hub of equal chips is gone.
    expect(page).not.toMatch(/data-testid="admin-tools-hub"/);
  });

  it("groups surfaces by real operational purpose", () => {
    // The control areas render `data-testid={`admin-area-${g.key}`}` from a
    // groups array; assert each purpose-group key is defined.
    expect(page).toMatch(/admin-area-/);
    for (const g of [
      "companies",
      "demand",
      "matching",
      "marketSignals",
      "quality",
      "operations",
    ]) {
      expect(page, `missing control area ${g}`).toMatch(
        new RegExp(`key:\\s*"${g}"`),
      );
    }
  });

  it("every attention row is a real queue with a real count, from real reads", () => {
    expect(page).toMatch(/admin-attention-\$\{a\.key\}/);
    // Zero waiting is said out loud, never faked as urgency.
    expect(page).toMatch(/\.filter\(\(a\) => a\.count > 0\)/);
    expect(page).toMatch(/data-testid="admin-attention-none"/);
    // Counts come from real reads, never invented numbers.
    expect(page).toMatch(/profileCount/);
    expect(page).toMatch(/incompleteCount/);
    expect(page).toMatch(/companyCount/);
  });

  it("internal diagnostic surfaces are flagged internal (not operational tiles)", () => {
    // project-truth, telemetry, agent-os each carry internal: true.
    const internalCount = (page.match(/internal:\s*true/g) ?? []).length;
    expect(internalCount).toBeGreaterThanOrEqual(3);
    expect(page).toMatch(/room\.internalBadge/);
  });
});

describe("admin control-area links all resolve to real pages (no dead links)", () => {
  const hrefs = [...page.matchAll(/href:\s*"(\/dashboard\/[^"]+)"/g)].map(
    (m) => m[1],
  );

  it("extracted at least the core admin routes", () => {
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
  });

  for (const href of [...new Set(hrefs)]) {
    it(`${href} resolves to a page.tsx`, () => {
      const rel = join(
        "app",
        "[locale]",
        href.replace(/^\//, ""),
        "page.tsx",
      );
      expect(existsSync(join(ROOT, rel)), `missing page for ${href}`).toBe(true);
    });
  }
});

describe("admin-visible operational copy carries no internal sprint/build jargon", () => {
  // Operational admin namespaces the owner USES. The internal diagnostic
  // namespaces (agentOs, telemetry) are intentionally NOT scanned — their
  // technical copy is the point of those surfaces.
  const OPERATIONAL_NS = ["admin", "adminReadiness", "needStructuring", "candidatePool"];
  const JARGON: RegExp[] = [
    /active_role/i,
    /server-side rls/i,
    /service_role/i,
    /security definer/i,
    /work package/i,
    /stripe sprint/i,
    /s4 item/i,
    /s4 migration/i,
    /task 0\d/i,
    /feat\//i,
    /\bpr[67]\b/i,
    /·\s*p0\b/i,
    /needs-migration/i,
    /migration pending/i,
    /migration not applied/i,
    /\bmigration\b/i,
    /migracij/i,
    /миграц/i,
  ];

  for (const loc of ["en", "lt", "ru"] as const) {
    const msg = JSON.parse(read(`messages/${loc}.json`));
    for (const ns of OPERATIONAL_NS) {
      if (!msg[ns]) continue;
      const blob = JSON.stringify(msg[ns]);
      for (const re of JARGON) {
        it(`${loc}/${ns} has no ${re.source}`, () => {
          const m = blob.match(re);
          expect(m, `jargon in ${loc}/${ns}: "${m?.[0]}"`).toBeNull();
        });
      }
    }
  }
});
