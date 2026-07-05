import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Clickability / actionability guard (owner browser-smoke repair,
 * 2026-07-05 — "Daugiau niekas nepasispaudžia").
 *
 * The one rule, pinned: if it looks clickable it must be clickable; if it is
 * not clickable it must look like plain information; if an action is
 * unavailable, the UI explains why; every numeric card either navigates to
 * what it counts or sits under an explicit monitoring-only note.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const workCard = read("components/app/work-card.tsx");
const playerCard = read("components/app/worker-player-card.tsx");
const adminPage = read("app/[locale]/dashboard/admin/page.tsx");
const adminReviewLib = read("lib/buyer/admin-request-review.ts");
const launchBoard = read("components/app/admin-launch-board.tsx");
const companyPage = read("app/[locale]/dashboard/company/page.tsx");
const companyNext = read("components/app/company-next-actions.tsx");
const startCompany = read("app/[locale]/dashboard/start/company/page.tsx");
const brigades = read("components/app/team-brigades-panel.tsx");
const readback = read("components/app/demand-requests-readback.tsx");
const mapShell = read("components/app/market-map-shell.tsx");
const mapLegend = read("components/app/map-layers-legend.tsx");
const mapPage = read("app/[locale]/dashboard/market-map/page.tsx");
const mapBase = read("components/app/market-map-base.tsx");
const notifPanel = read("components/app/notification-panel.tsx");
const evidenceStrip = read("components/app/evidence-status-strip.tsx");
const readinessPanel = read("components/app/worker-readiness-panel.tsx");

describe("1+2. counters navigate or are covered by monitoring-only notes", () => {
  it("worker player-card stat tiles are Links with real targets", () => {
    expect(playerCard).toMatch(/href="\/dashboard\/profile#capabilities"/);
    expect(playerCard).toMatch(/href="\/dashboard\/profile#candidate-skills"/);
    expect(playerCard).toMatch(/href="\/dashboard\/journal#journal-entries"/);
    expect(playerCard).toMatch(/href="\/dashboard\/communication"/);
    // The Stat renderer itself is a Link (rule A: real element + focus state).
    expect(playerCard).toMatch(/function Stat\([\s\S]{0,700}<Link/);
  });
  it("work-card skill/record tiles navigate; passive tile has no card border", () => {
    expect(workCard).toMatch(/href="\/dashboard\/profile#capabilities"/);
    expect(workCard).toMatch(/href="\/dashboard\/journal#journal-entries"/);
    // Passive StatTile branch renders WITHOUT the bordered-card look.
    expect(workCard).toMatch(/<div className="flex flex-col gap-0\.5 p-3" data-testid=\{testid\}>/);
  });
  it("admin KPI band: queue counters link, the rest sit under the monitoring note", () => {
    expect(adminPage).toMatch(/href: "#request-review"/);
    expect(adminPage).toMatch(/href: "\/dashboard\/admin\/need-structuring"/);
    expect(adminPage).toMatch(/data-testid="admin-kpi-monitoring-note"/);
    expect(adminPage).toMatch(/data-testid="admin-drafts-monitoring-note"/);
    expect(adminPage).toMatch(/id="request-review"/);
  });
  it("launch signal tiles carry the monitoring-only note", () => {
    expect(launchBoard).toMatch(/data-testid="admin-launch-signals-monitoring-note"/);
  });
  it("company ops counters navigate to their sections/queues", () => {
    expect(companyPage).toMatch(/key: "pending", value: pendingCount, href: "#company-team"/);
    expect(companyPage).toMatch(/key: "review", value: reviewCount, href: `\/\$\{locale\}\/dashboard\/inbox`/);
    expect(companyPage).toMatch(/data-testid="company-ops-team-link"/);
  });
});

describe("3. readiness incomplete rows act", () => {
  it("worker readiness panel unmet rows are Links (pre-existing model, pinned)", () => {
    expect(readinessPanel).toMatch(/<Link[\s\S]{0,400}ArrowRight/);
  });
  it("work-card '+ missing' chips are Links to their fill surface", () => {
    expect(workCard).toMatch(/PAGE_TARGET\[dim\] \?\? "#work-card"/);
    expect(workCard).toMatch(/id="work-card"/);
  });
});

describe("4. admin action queue has a click path (P0)", () => {
  it("review rows fetch profile_id and link to the inspect page", () => {
    expect(adminReviewLib).toMatch(/select\("id, title, need_summary, status, created_at, profile_id"\)/);
    expect(adminReviewLib).toMatch(/readonly profileId: string;/);
    expect(adminPage).toMatch(/admin-request-review-open-/);
    expect(adminPage).toMatch(/\/dashboard\/admin\/users\/\$\{r\.profileId\}/);
  });
});

describe("5+6. company identity and create-vs-edit", () => {
  it("company name opens the identity readback", () => {
    expect(companyNext).toMatch(/data-testid="company-name-link"/);
    expect(companyNext).toMatch(/href="\/dashboard\/start\/company"/);
  });
  it("setup heading says CREATE for new, EDIT for existing", () => {
    expect(startCompany).toMatch(/company \? t\("formTitleEdit"\) : t\("formTitleCreate"\)/);
    for (const loc of ["lt", "en", "ru"] as const) {
      const setup = JSON.parse(read(`messages/${loc}.json`)).roleDashboards
        .company.setup;
      expect(typeof setup.formTitleCreate).toBe("string");
      expect(typeof setup.formTitleEdit).toBe("string");
      expect(setup.formTitleCreate).not.toBe(setup.formTitleEdit);
    }
  });
});

describe("7. waiting-review chip explains itself", () => {
  it("active awaiting_confirmation links to the evidence-report explanation", () => {
    expect(evidenceStrip).toMatch(/data-testid="evidence-awaiting-review-link"/);
    expect(evidenceStrip).toMatch(/href="\/dashboard\/reports\/evidence"/);
  });
});

describe("8. map surfaces", () => {
  it("no fake filter pills — scope note is plain text", () => {
    const filters = mapShell.slice(
      mapShell.indexOf('data-testid="market-map-filters"'),
      mapShell.indexOf('data-testid="market-map-filters"') + 900,
    );
    expect(filters).not.toMatch(/rounded-full/);
  });
  it("incomplete layer rows carry a fix href to a real target", () => {
    expect(mapLegend).toMatch(/data-testid="map-layer-fix-link"/);
    expect(mapPage).toMatch(/href: hasPreferredLocation \? undefined : "#market-map-base"/);
    expect(mapBase).toMatch(/id="market-map-base"/);
  });
  it("my-signals place chips are neutral data, not filter-styled", () => {
    const sig = read("components/app/market-map-my-signals.tsx");
    expect(sig).not.toMatch(/rounded-full border border-brand-blue\/40 bg-brand-blue\/5 px-2 py-0\.5 text-xs text-brand-blue/);
  });
});

describe("9. notifications honest", () => {
  it("raw type enum never rendered — mapped with neutral fallback", () => {
    expect(notifPanel).not.toMatch(/>\{n\.type\}</);
    expect(notifPanel).toMatch(/tTypes\("generic"\)/);
    for (const loc of ["lt", "en", "ru"] as const) {
      const g = JSON.parse(read(`messages/${loc}.json`)).auth.notifications
        .types?.generic;
      expect(typeof g === "string" && g.length > 0, `${loc} generic`).toBe(true);
    }
  });
});

describe("B. passive elements look passive (no hover-glow on dead cards)", () => {
  it("work-card and player-card sections dropped the hover lift", () => {
    expect(workCard).not.toMatch(/glow-hover/);
    expect(workCard).not.toMatch(/hover:shadow-card-hover/);
    expect(playerCard).not.toMatch(/glow-hover/);
    expect(playerCard).not.toMatch(/hover:shadow-card-hover/);
  });
  it("brigade member names are plain text, not button-pills", () => {
    const seg = brigades.slice(
      brigades.indexOf("team.members.map"),
      brigades.indexOf("team.members.map") + 400,
    );
    expect(seg).not.toMatch(/rounded-full border/);
  });
  it("readback never prints a raw status enum", () => {
    expect(readback).toMatch(/labels\.status\[r\.status\] \?\? labels\.statusOther/);
    expect(readback).not.toMatch(/\?\? r\.status\}/);
  });
});

describe("10+11. tap targets and no payment work", () => {
  it("new interactive tiles/chips carry mobile-safe min-height", () => {
    expect(playerCard).toMatch(/min-h-11 flex-col gap-0\.5 rounded-md/);
    expect(workCard).toMatch(/min-h-11 flex-col gap-0\.5 rounded-md/);
    expect(workCard).toMatch(/min-h-11 items-center gap-1 rounded-md border border-brand-orange/);
  });
  it("no payment strings entered any touched file", () => {
    for (const src of [workCard, playerCard, adminPage, companyPage, mapShell, notifPanel]) {
      expect(src).not.toMatch(/stripe|checkout|payment_intent/i);
    }
  });
});
