import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

import { buildPlayerCardMinimum } from "@/lib/identity/player-card-minimum";
import { readinessNextSteps } from "@/lib/player-card/readiness-steps";
import type { WorkerReadiness } from "@/lib/player-card/readiness";

/**
 * PLAYER CARD / WORKER PROFILE — LAUNCH GUARDS (PR9).
 *
 * Pins the launch-grade properties of the ONE worker identity surface:
 * canonical slugs, honest evidence tiers, no fake verification, no
 * construction fallback, honest missing-actions, safe avatar degrade,
 * §20 preferred-location boundary, §18-marked marketing concept cards, and
 * a single card system (no duplicate routes).
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("1. canonical slugs — labels are localization, never identity", () => {
  it("profile page localizes skills via the skillNames namespace over slugs", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(/skillNames/);
    expect(page).toMatch(/skills\s*\(\s*slug\s*\)|skills\(slug\)/);
  });
});

describe("2. no construction fallback on real surfaces", () => {
  it("the real card system contains no construction default", () => {
    // Comments stripped — prose like "forbidden by construction" is fine;
    // CODE defaulting to a trade is not.
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
    for (const rel of [
      "components/app/worker-player-card.tsx",
      "lib/player-card/player-card.ts",
      "lib/identity/player-card-minimum.ts",
    ]) {
      const src = stripComments(read(rel)).toLowerCase();
      expect(src, rel).not.toMatch(/construction|statyba|"tiler"|"mason"|bricklay/);
    }
  });

  it("the fictional FIFA concept card is imported ONLY by marketing surfaces", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(APP_ROOT, dir), {
        withFileTypes: true,
      }) as Dirent[]) {
        const rel = `${dir}/${name.name}`;
        if (name.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(name.name)) {
          const src = read(rel);
          if (/from\s+"@\/components\/app\/player-card"/.test(src)) offenders.push(rel);
        }
      }
    };
    walk("components/app");
    walk("app/[locale]/dashboard");
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

describe("3. journal-derived skills show their evidence basis", () => {
  it("the CV cards map the three honest tiers", () => {
    const src = read("components/app/cv-engagement-cards.tsx");
    expect(src).toMatch(/manager_confirmed/);
    expect(src).toMatch(/work_journal/);
    // verified label fires ONLY on the real signal
    expect(src).toMatch(/verified\s*\|\|\s*.*manager_confirmed|manager_confirmed.*\|\|\s*.*verified/);
  });
});

describe("4. no fake verified labels", () => {
  it("marketing concept cards carry a DEFAULT-ON placeholder marker (§18)", () => {
    // PR15 hardening: consumers read the shared prod-forced constant, never
    // the raw env var (see lib/guards/placeholder-marker-prod.test.ts).
    const src = read("components/app/player-card.tsx");
    expect(src).toMatch(/showMarker = showPlaceholderMarkers/);
    expect(src).not.toMatch(/NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS\s*===/);
  });

  it("the showcase renders the CANONICAL card with a visible not-a-real-person line (owner audit §3.7)", () => {
    const showcase = read("components/marketing/player-card-showcase.tsx");
    // Landing = product: the SAME WorkerPlayerCard, never the FUT concept.
    expect(showcase).toMatch(/WorkerPlayerCard/);
    expect(showcase).not.toMatch(/<PlayerCard\b/);
    expect(showcase).toMatch(/conceptNote/);
    for (const [locale, needle] of [
      ["en", "not a real person"],
      ["lt", "ne realus asmuo"],
      ["ru", "не реальный человек"],
    ] as const) {
      const j = JSON.parse(read(`messages/${locale}.json`)) as {
        playercards?: { conceptNote?: string };
      };
      expect(j.playercards?.conceptNote ?? "", locale).toContain(needle);
    }
  });
});

describe("5. empty profile gets honest next actions (never a percentage)", () => {
  it("minimum contract reports ALL essentials missing for an empty source", () => {
    const empty = buildPlayerCardMinimum({});
    expect([...empty.missing].sort()).toEqual(
      ["about", "avatar", "headline", "location", "name", "skills"].sort(),
    );
    expect(empty.present).toEqual([]);
    // No percentage/score anywhere in the shape.
    expect(JSON.stringify(empty)).not.toMatch(/percent|score/i);
  });

  it("readiness steps map every unmet pillar to a REAL route", () => {
    const readiness = {
      pillars: [
        { key: "availability", met: false },
        { key: "journal", met: false },
        { key: "skills", met: true },
      ],
    } as unknown as WorkerReadiness;
    const steps = readinessNextSteps(readiness);
    expect(steps.length).toBe(2);
    for (const s of steps) expect(s.href.startsWith("/dashboard")).toBe(true);
  });

  it("the profile hub carries the availability pillar and the opportunities action", () => {
    const hub = read("components/app/profile-hub-overview.tsx");
    expect(hub).toMatch(/pillars\.availability/);
    expect(hub).toMatch(/\/dashboard#work-card/);
    expect(hub).toMatch(/profile-hub-opportunities-link/);
    // The deep-link target exists on the dashboard.
    expect(read("app/[locale]/dashboard/advanced/page.tsx")).toMatch(/id="work-card"/);
  });
});

describe("6. avatar is optional and never breaks", () => {
  it("null avatar yields a monogram, not a crash or fake face", () => {
    const card = buildPlayerCardMinimum({ avatarUrl: null, fullName: "Jonas Petraitis" });
    expect(card.avatarUrl).toBeNull();
    expect(card.initials).toBe("JP");
    expect(card.missing).toContain("avatar");
  });
});

describe("7. preferred city stays worker-owned (§20)", () => {
  it("no profile/card surface reads preferred_locations for OTHER users", () => {
    for (const rel of [
      "app/[locale]/dashboard/profile/page.tsx",
      "components/app/worker-player-card.tsx",
      "components/app/profile-hub-overview.tsx",
      "lib/player-card/player-card.ts",
    ]) {
      expect(read(rel), rel).not.toMatch(/preferred_locations/);
    }
    // The ONLY readers stay the own-context builder (own rows) and the
    // owner-scoped market-map fetcher — pinned in location-matching guards.
    expect(read("lib/opportunities/worker-subject.ts")).toMatch(
      /eq\("profile_id", profileId\)/,
    );
  });
});

describe("8./9. one card system, no duplicate routes, mobile-safe", () => {
  it("the standalone player-card route stays a redirect (no second surface)", () => {
    // W1: the redirect-only page file is gone; the redirect itself remains.
    expect(isCanonicallyRedirected("/dashboard/player-card", "/dashboard/journal")).toBe(true);
  });

  it("exactly one profile page exists under the dashboard", () => {
    expect(existsSync(join(APP_ROOT, "app", "[locale]", "dashboard", "profile", "page.tsx"))).toBe(true);
    expect(
      existsSync(join(APP_ROOT, "app", "[locale]", "dashboard", "profile2")) ||
        existsSync(join(APP_ROOT, "app", "[locale]", "dashboard", "worker-profile")),
    ).toBe(false);
  });

  it("hub pillars keep mobile tap targets and a responsive grid", () => {
    const hub = read("components/app/profile-hub-overview.tsx");
    expect(hub).toMatch(/min-h-\[3\.25rem\]/);
    expect(hub).toMatch(/sm:grid-cols-2 lg:grid-cols-4/);
  });
});

describe("10. opportunities/interest links stay real", () => {
  it("profile links to the real opportunities board", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(/profile-opportunities-link/);
    expect(page).toMatch(/\/dashboard\/opportunities/);
    expect(
      existsSync(join(APP_ROOT, "app", "[locale]", "dashboard", "opportunities", "page.tsx")),
    ).toBe(true);
  });
});
