import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W7-S1 — ONE profile overview.
 *
 * The W7 P1-4 inventory measured SIX components on `/dashboard/profile` all
 * answering "how complete is my profile?", ≈1350 px stacked before the first
 * editable field, with four separate renderings of the same
 * `deriveWorkerReadiness` output. W7-S1 consolidated them into
 * `ProfileHubOverview`.
 *
 * This guard pins the consolidation itself: the duplicates cannot come back,
 * and — more importantly — nothing they carried may quietly disappear. Each
 * absorbed capability is asserted at its new home. The full old→new map is
 * `docs/audits/W7_S1_PROFILE_HUB_OVERVIEW.md` §5.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const HUB = read("components/app/profile-hub-overview.tsx");
const PAGE = read("app/[locale]/dashboard/profile/page.tsx");

/** The four components absorbed into the hub, plus the grid that moved inside
 *  it. None may be re-created or re-mounted as a competing summary. */
const ABSORBED = [
  "components/app/profile-state-strip.tsx",
  "components/app/live-profile-section.tsx",
  "components/app/worker-setup-journey.tsx",
  "components/app/skills-review-banner.tsx",
] as const;

describe("W7-S1 — exactly one canonical overview", () => {
  it("the absorbed components no longer exist", () => {
    for (const rel of ABSORBED) {
      expect(existsSync(join(WEB, rel)), `${rel} must stay absorbed`).toBe(false);
    }
  });

  it("the profile page mounts exactly one ProfileHubOverview", () => {
    const mounts = PAGE.match(/<ProfileHubOverview/g) ?? [];
    expect(mounts.length).toBe(1);
  });

  it("no duplicate readiness summary is re-mounted on the page", () => {
    for (const name of [
      "ProfileStateStrip",
      "LiveProfileSection",
      "WorkerSetupJourney",
      "SkillsReviewBanner",
    ]) {
      // The consolidation note names them in prose; a JSX mount is the thing
      // that may not come back.
      expect(PAGE, `${name} must not be mounted again`).not.toMatch(
        new RegExp(`<${name}[\\s/>]`),
      );
    }
  });

  it("the CV grid renders only inside the hub, never as its own page card", () => {
    expect(PAGE).not.toMatch(/<CvCompletenessGrid/);
    expect(HUB).toMatch(/<CvCompletenessGrid sections=\{\[\.\.\.cvSections\]\} nested \/>/);
  });

  it("readiness is derived ONCE, from the canonical model", () => {
    // Code only — the docstring names both symbols when it explains the
    // consolidation, and prose must not be able to fail a call-count check.
    const code = HUB.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect((code.match(/deriveWorkerReadiness\(/g) ?? []).length).toBe(1);
    expect((code.match(/getWorkerPlayerCard\(\)/g) ?? []).length).toBe(1);
  });

  it("the three absorbed reads run as ONE parallel stage, not three awaits", () => {
    // Absorbing siblings into one component would otherwise serialise reads
    // React could previously start together — a measured TTFB regression.
    expect(HUB).toMatch(/await Promise\.all\(\[\s*getWorkerPlayerCard\(\),/);
    expect(HUB).toMatch(/getProfileOpportunitySignal\(\),/);
    expect(HUB).toMatch(/countTodayJournalEntries\(workerId\)/);
    // Exactly one top-level await in the read path.
    expect((HUB.match(/^\s+const \[playerCard/gm) ?? []).length).toBe(1);
  });

  it("skill evidence is derived ONCE on the page and passed down", () => {
    expect((PAGE.match(/deriveSkillEvidence\(/g) ?? []).length).toBe(1);
    expect(PAGE).toMatch(/skillEvidence=\{skillEvidenceSummary\}/);
  });
});

describe("W7-S1 — no capability was lost", () => {
  const CAPABILITIES: ReadonlyArray<readonly [string, RegExp]> = [
    // ── from ProfileStateStrip ──────────────────────────────────────────
    ["readiness state word", /readiness\.\$\{readiness\.level\}|readiness\.\${readiness\.level}/],
    ["freshness (newest entry date)", /profile-hub-freshness/],
    ["today's activity count", /profile-hub-activity/],
    // ── from LiveProfileSection ─────────────────────────────────────────
    ["named missing list", /profile-hub-missing/],
    ["work history", /live-profile-history/],
    ["evidence line (3 populations)", /evidenceLine/],
    ["opportunity signal", /live-profile-opportunity/],
    ["closest-match §19 basis", /closestBasis/],
    // ── from WorkerSetupJourney ─────────────────────────────────────────
    ["the 5 named steps", /steps\.\$\{s\.key\}\.title|steps\.\${s\.key}\.title/],
    ["done-of-total progress", /tStep\("progress"/],
    ["the #setup-journey deep-link anchor", /id="setup-journey"/],
    // ── from SkillsReviewBanner ─────────────────────────────────────────
    ["unsupported-skill review note", /profile-hub-review-note/],
    // ── from the hub's own prior surface ────────────────────────────────
    ["minimum-contract missing essentials", /data-card-missing=/],
    ["skill-evidence support block", /profile-hub-skill-evidence/],
    ["the one not-verified disclaimer", /profile-hub-not-verified/],
    ["one primary next action", /profile-hub-primary-action/],
    ["opportunities link", /profile-hub-opportunities-link/],
  ];

  for (const [what, re] of CAPABILITIES) {
    it(`still carries: ${what}`, () => {
      expect(HUB, `${what} disappeared from the hub`).toMatch(re);
    });
  }

  it("every absorbed destination is still reachable", () => {
    for (const href of [
      "#profile-edit",
      "#cv-availability",
      "/dashboard/journal",
      "/dashboard?result=player-card",
      "/dashboard/opportunities",
    ]) {
      expect(HUB, `${href} lost`).toContain(href);
    }
  });
});

describe("W7-S1 — the chat stays the primary control surface", () => {
  it("the hub offers a bridge into the ONE conversation", () => {
    expect(HUB).toMatch(/profile-hub-ask-workspace/);
    expect(HUB).toMatch(/href="\/dashboard"/);
  });

  it("invents no second assistant and no unread deep-link parameter", () => {
    // `?result=` is the only deep link the workspace honours. A seeded-prompt
    // parameter nothing reads would be a control promising behaviour the
    // product does not have. Checked against CODE — the prose above the link
    // has to be able to name the trap it avoids.
    const code = HUB.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/\?ask=|\?prompt=|\?q=/);
    expect(code).not.toMatch(/assistant|chatbot/i);
  });
});

describe("W7-S1 — accessibility of the surface it introduced", () => {
  it("rows and every action link meet the 44px target floor", () => {
    expect(HUB).toMatch(/min-h-11 items-start/);
    expect((HUB.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("status is never encoded by colour alone", () => {
    // Each row pairs its icon with a screen-reader state word.
    expect(HUB).toMatch(/<span className="sr-only">/);
    expect(HUB).toMatch(/t\("state\.done"\) : t\("state\.todo"\)/);
  });

  it("the disclosure is keyboard-focusable with a visible ring", () => {
    expect(HUB).toMatch(/summary[\s\S]{0,400}focus-visible:ring-2/);
  });

  it("semantic headings: the hub is an h2 with h3 subsections", () => {
    expect(HUB).toMatch(/<h2 className="truncate font-display/);
    expect(HUB).toMatch(/<h3 className="font-mono text-meta/);
    // The page keeps exactly one h1.
    expect((PAGE.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("the new copy exists in every locale that ships the hub", () => {
    for (const locale of ["lt", "en", "de", "nl", "ru"]) {
      const m = JSON.parse(read(`messages/${locale}.json`)) as {
        profileHub?: Record<string, unknown>;
      };
      const hub = m.profileHub ?? {};
      for (const key of ["doneDisclosure", "askWorkspace"]) {
        expect(
          typeof hub[key] === "string" && (hub[key] as string).trim().length > 0,
          `${locale} profileHub.${key} missing`,
        ).toBe(true);
      }
      const state = hub.state as Record<string, string> | undefined;
      expect(state?.done?.trim().length, `${locale} state.done`).toBeGreaterThan(0);
      expect(state?.todo?.trim().length, `${locale} state.todo`).toBeGreaterThan(0);
    }
  });
});

describe("W7-S1 — today's activity reads a canonical model", () => {
  it("the extracted reader exists and the hub uses it", () => {
    expect(existsSync(join(WEB, "lib/player-card/today-activity.ts"))).toBe(true);
    expect(HUB).toMatch(/countTodayJournalEntries/);
    // The surface reads models; it never counts rows itself.
    expect(HUB).not.toMatch(/\.from\(|\.rpc\(|createClient/);
  });
});
