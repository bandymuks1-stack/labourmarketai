import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 4 — Guided Onboarding and CV Understanding (UX Recovery Train).
 *
 * The wagon's journey (registration → work goal → experience → review →
 * location → availability → profile ready) is delivered as a GUIDE over the
 * canonical surfaces — not a second subsystem. This guard pins:
 *   1. the guide exists on the profile page and a fresh worker lands on it;
 *   2. every done-state comes from the REAL readiness signals (never a
 *      fabricated score, never model-confidence values);
 *   3. the journey copy exists in EVERY served locale and stays plain
 *      worker language (no architecture vocabulary);
 *   4. each step links to an existing canonical surface.
 */

const APP = process.cwd();
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const JOURNEY = read("components/app/worker-setup-journey.tsx");
const STEP_KEYS = ["goal", "experience", "review", "location", "availability"];

describe("Wagon 4 — the guide exists and fresh workers land on it", () => {
  it("profile page mounts WorkerSetupJourney", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(/<WorkerSetupJourney \/>/);
  });

  it("completeOnboarding sends a fresh worker to the setup journey", () => {
    const actions = read("lib/auth/actions.ts");
    expect(actions).toMatch(
      /worker:\s*`\/\$\{locale\}\/dashboard\/profile#setup-journey`/,
    );
  });
});

describe("Wagon 4 — honest done-states, no fake understanding", () => {
  it("derives every state from the real readiness model", () => {
    expect(JOURNEY).toMatch(/deriveWorkerReadiness/);
    expect(JOURNEY).toMatch(/getWorkerPlayerCard/);
  });

  it("never shows a score, percentage or model confidence", () => {
    expect(JOURNEY).not.toMatch(/confidence/i);
    expect(JOURNEY).not.toMatch(/\bscore\b/i);
    // the visible progress is a done-of-total count, not a percent
    expect(JOURNEY).not.toMatch(/%/);
  });

  it("self-gates: renders nothing for a non-worker identity", () => {
    expect(JOURNEY).toMatch(/if \(!card\) return null/);
  });

  it("each step links to an existing canonical surface", () => {
    expect(JOURNEY).toMatch(/\/dashboard\/profile#profile-edit/);
    expect(JOURNEY).toMatch(/\/dashboard#work-card/);
    expect(JOURNEY).toMatch(/\/dashboard\/profile#cv-availability/);
    // the anchors actually exist on their target pages
    const profile = read("app/[locale]/dashboard/profile/page.tsx");
    expect(profile).toMatch(/id="profile-edit"/);
    expect(profile).toMatch(/id="cv-availability"/);
    const dashboard = read("app/[locale]/dashboard/page.tsx");
    expect(dashboard).toMatch(/id="work-card"/);
  });
});

describe("Wagon 4 — journey copy in every served locale, plain language", () => {
  const locales = readdirSync(join(APP, "messages"))
    .filter((f) => f.endsWith(".json") && !f.includes("/"))
    .map((f) => f.replace(".json", ""));

  const FORBIDDEN = [
    /intelligence/i,
    /intelekt/i,
    /žvalgyb/i,
    /parser/i,
    /schema/i,
    /pipeline/i,
    /registr/i,
    /normaliz/i,
    /confidence/i,
    /\bAI\b/,
  ];

  it("scans a meaningful locale set", () => {
    expect(locales.length).toBeGreaterThanOrEqual(11);
  });

  for (const locale of locales) {
    it(`${locale}: setupJourney block complete and architecture-free`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        setupJourney?: {
          title?: string;
          readyTitle?: string;
          subtitle?: string;
          readyBody?: string;
          progress?: string;
          steps?: Record<string, { title?: string; hint?: string }>;
        };
      };
      const j = messages.setupJourney;
      expect(j?.title?.trim().length, `${locale} title`).toBeGreaterThan(0);
      expect(j?.readyTitle?.trim().length).toBeGreaterThan(0);
      expect(j?.subtitle?.trim().length).toBeGreaterThan(0);
      expect(j?.readyBody?.trim().length).toBeGreaterThan(0);
      expect(j?.progress).toMatch(/\{done\}/);
      for (const key of STEP_KEYS) {
        expect(j?.steps?.[key]?.title?.trim().length, `${locale} ${key}.title`).toBeGreaterThan(0);
        expect(j?.steps?.[key]?.hint?.trim().length, `${locale} ${key}.hint`).toBeGreaterThan(0);
      }
      const blob = JSON.stringify(j);
      for (const banned of FORBIDDEN) {
        expect(blob, `${locale} leaks ${banned}`).not.toMatch(banned);
      }
    });
  }
});
