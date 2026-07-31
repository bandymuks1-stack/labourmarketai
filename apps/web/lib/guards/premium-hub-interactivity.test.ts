import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Premium hub interactivity guard (user-journey root-cause repair v1,
 * dashboard sweep follow-up).
 *
 * Owner finding: on the MAIN /dashboard the hub blocks rendered their stat
 * tiles, identity headers, project image block and the market-map preview as
 * plain <div>s — button-looking, dead. Contract pinned here:
 *
 *   - every stat tile that counts something the user can open IS a link to
 *     the EXACT section it counts (not a generic page);
 *   - identity headers / preview zones are full-surface links with an
 *     accessible name and a visible focus ring;
 *   - a zero value keeps its link — the destination owns the honest empty
 *     state + next action;
 *   - purely informational meters (completeness, readiness) stay progressbar
 *     semantics, never button-styled;
 *   - every href used by the hub resolves to an existing route/anchor.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const primitives = read("components/app/premium-hub/premium-hub-primitives.tsx");
/* W3 row 1: `premium-hub-person-card.tsx` is DELETED. It was a second, lesser
   rendering of the canonical player card, and it carried the only
   availability/location/pay editor. Both moved into the `player-card` RESULT,
   which is asserted below — the deep-link contract this file protects still
   has to hold, it just holds somewhere else now. */
/** Code only — a doc comment that NAMES what was removed is not a
 *  reintroduction of it. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const playerCard = read("components/app/worker-player-card.tsx");
const playerCardResult = read("components/app/workspace/player-card-result.tsx");
const company = read("components/app/premium-hub/premium-hub-company-card.tsx");
const project = read("components/app/premium-hub/premium-hub-project-card.tsx");
const map = read("components/app/premium-hub/premium-hub-market-map.tsx");
const data = read("components/app/premium-hub/premium-hub-data.ts");

describe("shared primitives carry the interaction contract", () => {
  it("HubStat with href renders a full-surface Link with focus ring + accessible name", () => {
    const stat = primitives.slice(primitives.indexOf("export function HubStat"));
    expect(stat).toMatch(/if \(href\) \{/);
    expect(stat).toMatch(/<Link[\s\S]*?focus-visible:ring-2/);
    expect(stat).toMatch(/aria-label=\{openHint \? `\$\{label\} — \$\{openHint\}` : label\}/);
    expect(stat).toMatch(/hover:border-brand-blue/);
  });
  it("HubStat without href stays affordance-free (no hover/cursor on the passive branch)", () => {
    const stat = primitives.slice(
      primitives.indexOf("export function HubStat"),
      primitives.indexOf("export function HubZoneLink"),
    );
    const passive = stat.slice(stat.lastIndexOf("return ("));
    expect(passive).not.toMatch(/hover:|cursor-pointer/);
  });
  it("HubZoneLink is a real Link with aria-label + focus ring", () => {
    expect(primitives).toMatch(/export function HubZoneLink/);
    const zone = primitives.slice(primitives.indexOf("export function HubZoneLink"));
    expect(zone).toMatch(/aria-label=\{ariaLabel\}/);
    expect(zone).toMatch(/focus-visible:ring-2/);
  });
});

describe("the person block LEFT the hub — and its contract went with it", () => {
  it("the hub no longer renders a person block at all", () => {
    const screen = read("components/app/premium-hub/premium-hub-screen.tsx");
    expect(screen).not.toMatch(/PremiumHubPersonCard/);
    // …and it no longer threads the worker-only editor through itself.
    expect(screen).not.toMatch(/workEditor/);
    // Comments stripped: the module's own note EXPLAINS that PersonVM and
    // loadPerson were removed, and a guard that could not tell prose from code
    // would forbid explaining the removal.
    expect(stripComments(data), "PersonVM is dead code once the block is gone")
      .not.toMatch(/PersonVM|loadPerson/);
  });

  it("the canonical card still deep-links every number to its section", () => {
    // The SAME contract the hub person block held: a visible number is a door
    // to the exact section it counts. It is the canonical card's now.
    expect(playerCard).toContain('href="/dashboard/profile#capabilities"');
    expect(playerCard).toContain('href="/dashboard/journal#journal-entries"');
  });

  it("no completeness percentage meter anywhere (human-first v1)", () => {
    // The user-visible completenessPct meter was removed — real counts only.
    expect(playerCard).not.toMatch(/completenessPct/);
    expect(primitives).not.toMatch(/HubProgress[\s\S]{0,400}href/);
  });

  it("a non-worker gets NO worker-only editing controls", () => {
    // The hard acceptance condition for row 1, and the half that cannot be
    // browser-proven here: every local fixture identity HAS a `workers` row,
    // and inventing a half-onboarded account to make a screenshot is the
    // fabricated state this platform bans. So it is pinned in code, at both
    // ends of the chain.
    const loader = read("lib/player-card/player-card-result.ts");
    // 1. The server returns no editor when there is no worker row.
    expect(loader).toMatch(/if \(!worker\?\.id\) return null;/);
    // 2. The result type makes "no editor" representable, not an empty object.
    expect(loader).toMatch(/workEditor: WorkEditorVM \| null/);
    // 3. The component renders the editor ONLY when the server sent one.
    expect(playerCardResult).toMatch(
      /view\.workEditor && view\.workEditorLabels \?/,
    );
    // 4. And the editor writes through the canonical save path, where the
    //    REAL authorization lives — the null above is a UI decision, never
    //    the security boundary.
    expect(read("components/app/work-card-editor.tsx")).toMatch(
      /use(ActionState|FormState)|action=\{/,
    );
  });

  it("the card result computes no score of its own", () => {
    // The whole reason the card may be trusted: it renders counts of the
    // person's own rows. A total, a rating or a percentage introduced HERE
    // would be exactly the fabricated reputation the platform bans.
    expect(stripComments(playerCardResult)).not.toMatch(
      /score|rating|percent|★|totalPoints/i,
    );
  });
});

describe("company card — team / projects / invitations are real doors", () => {
  it("header opens the company space", () => {
    expect(company).toMatch(/hub-company-space-link/);
    expect(company).toContain('href="/dashboard/company"');
  });
  it("stats link to the exact sections (anchors / canonical list)", () => {
    expect(company).toContain('"/dashboard/company#company-team"');
    expect(company).toContain('"/dashboard/projects"');
    expect(company).toContain('"/dashboard/company#company-invitations"');
  });
  it("both company-page anchors exist", () => {
    expect(read("app/[locale]/dashboard/company/page.tsx")).toMatch(/id="company-team"/);
    expect(read("components/app/company-workers-section.tsx")).toMatch(/id="company-invitations"/);
  });
});

describe("project card — project, team and photos open the exact zones", () => {
  it("view model carries the real project id", () => {
    expect(data).toMatch(/interface ProjectVM \{[\s\S]*?id: string \| null/);
    expect(data).toMatch(/id: p\.id/);
  });
  it("title zone and image block are links into the project", () => {
    expect(project).toMatch(/hub-project-title-link/);
    expect(project).toMatch(/hub-project-image-link/);
    expect(project).toMatch(/\/dashboard\/projects\/\$\{project\.id\}/);
  });
  it("team → operations board; photos → gallery anchor", () => {
    expect(project).toMatch(/\/dashboard\/projects\/\$\{project\.id\}\/operations/);
    expect(project).toMatch(/#project-gallery/);
  });
  it("the gallery anchor exists on the project page", () => {
    expect(read("app/[locale]/dashboard/projects/[id]/page.tsx")).toMatch(/id="project-gallery"/);
  });
  it("readiness stays an informational meter", () => {
    expect(project).toMatch(/<HubProgress\s/);
  });
});

describe("market map card — the preview zone is one door to the canonical map", () => {
  it("preview + signal stats are wrapped in a single link to /dashboard/market-map", () => {
    expect(map).toMatch(/hub-map-open-link/);
    expect(map).toContain('href="/dashboard/market-map"');
  });
  it("the canonical market map route exists (never /dashboard/market, which has no page)", () => {
    expect(() => read("app/[locale]/dashboard/market-map/page.tsx")).not.toThrow();
    expect(map).not.toMatch(/dashboard\/market["'#]/);
  });
});

describe("locale copy for the hub open-actions (active locales)", () => {
  for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
    it(`${loc}: openHint + per-block open labels exist`, () => {
      const hub = (JSON.parse(read(`messages/${loc}.json`)) as {
        premiumHub: {
          openHint: string;
          person: { openProfile: string };
          company: { openSpace: string };
          project: { open: string; openGallery: string };
          map: { open: string };
        };
      }).premiumHub;
      for (const v of [
        hub.openHint,
        hub.person.openProfile,
        hub.company.openSpace,
        hub.project.open,
        hub.project.openGallery,
        hub.map.open,
      ]) {
        expect(v?.trim().length).toBeGreaterThan(0);
      }
    });
  }
});
