import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Marketplace ↔ opportunities bridge guard (quality-train PR D).
 *
 * The decided model (docs/launch/marketplace-opportunities-bridge-v1.md):
 * two entry points into ONE supply/demand system, labels kept distinct,
 * both halves reachable from the dashboard hub, cross-linked page-to-page.
 * This guard keeps the bridge from silently un-bridging — and keeps the
 * deeper (owner-gated) bridges from being improvised as copy.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

// Control room PR B: the hub cards moved from hard-coded page markup into
// the ONE dashboard module registry, rendered by the registry-driven grid
// in both branches. The bridge is now pinned at the registry level.
const REGISTRY = read("lib/dashboard/dashboard-module-registry.ts");
const DASH = read("app/[locale]/dashboard/page.tsx");

describe("the hub carries BOTH halves of the one supply/demand system", () => {
  it("supply half: offer + discover modules", () => {
    expect(REGISTRY).toMatch(/id: "services",\s*\n\s*surfaceRoute: "\/dashboard\/services"/);
    expect(REGISTRY).toMatch(
      /id: "service_requests",\s*\n\s*surfaceRoute: "\/dashboard\/service-requests"/,
    );
    // ...rendered by the one grid in both branch layouts.
    expect((DASH.match(/<DashboardModuleGrid\b/g) ?? []).length).toBe(2);
  });

  it("demand half: worker-gated opportunities module", () => {
    // Worker-only: org roles post demand via their demand-intake section —
    // showing them a worker consumption surface would be a fake bridge.
    expect(REGISTRY).toMatch(
      /id: "opportunities",[\s\S]{0,600}surfaceRoute: "\/dashboard\/opportunities",[\s\S]{0,600}roles: \["worker"\]/,
    );
  });

  it("every hub destination is a real page", () => {
    for (const href of [
      "/dashboard/services",
      "/dashboard/service-requests",
      "/dashboard/opportunities",
    ]) {
      const rel = join("app", "[locale]", ...href.split("/").filter(Boolean));
      expect(
        existsSync(join(ROOT, rel, "page.tsx")),
        `${href} must be a real page`,
      ).toBe(true);
    }
  });
});

describe("the two halves stay cross-linked page-to-page", () => {
  it("service-requests → opportunities (matching connection)", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/href: "\/dashboard\/opportunities"/);
  });

  it("opportunities → service-requests + bookings (next-step bridge)", () => {
    const page = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toMatch(/dashboard\/service-requests/);
    expect(page).toMatch(/dashboard\/bookings/);
  });
});

describe("bridge copy exists in every served locale — labels stay distinct", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: marketplace.hubOpportunities + note are non-empty`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        marketplace: Record<string, string>;
      };
      for (const key of ["hubOpportunities", "hubOpportunitiesNote"]) {
        expect(
          msgs.marketplace[key]?.trim().length,
          `${loc}: marketplace.${key}`,
        ).toBeGreaterThan(0);
      }
      // Concept-map discipline (PR #642): the new keys must not smuggle the
      // purged phantom "order" vocabulary back in.
      const blob = (
        msgs.marketplace.hubOpportunities + msgs.marketplace.hubOpportunitiesNote
      ).toLowerCase();
      expect(blob).not.toMatch(/užsakym|заказ|(^|\W)order(s|\W|$)/);
    });
  }
});

describe("the owner-gated bridges stay documented, not improvised", () => {
  it("the decision doc exists and enumerates the owner decisions", () => {
    const doc = read("../../docs/launch/marketplace-opportunities-bridge-v1.md");
    expect(doc).toMatch(/two entry points into ONE\s+supply\/demand system/i);
    expect(doc).toMatch(/owner decisions — HARD STOP/);
    expect(doc).toMatch(/Accepted service request → booking bridge/);
    expect(doc).toMatch(/Buyer pipeline merge/);
  });

  it("no automatic accepted-request → booking claim anywhere in marketplace copy", () => {
    // The schema has no such bridge (booking_requests anchors on demand) —
    // the UI must not promise one until the owner decides the model.
    for (const loc of ["lt", "en", "ru"] as const) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        marketplace: Record<string, unknown>;
      };
      const blob = JSON.stringify(msgs.marketplace).toLowerCase();
      expect(blob, loc).not.toMatch(
        /automatiškai sukuria rezervacij|automatically creates a booking|автоматически создает бронирование/,
      );
    }
  });
});
