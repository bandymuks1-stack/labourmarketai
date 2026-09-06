import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

/**
 * W7-S1: `worker-setup-journey.tsx` was ABSORBED into the profile hub. The
 * journey is still a GUIDE over canonical surfaces with the same 5 steps, the
 * same copy namespace and the same destinations — it is no longer a separate
 * component. Every assertion below is unchanged in intent and re-pointed at
 * the surface that now renders it.
 */
const JOURNEY = read("components/app/profile-hub-overview.tsx");
const STEP_KEYS = ["goal", "experience", "review", "location", "availability"];

describe("Wagon 4 — the guide exists and a fresh worker can reach it in one click", () => {
  it("profile page mounts the surface that carries the journey", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(/<ProfileHubOverview/);
    expect(JOURNEY).toMatch(/id="setup-journey"/);
  });

  /**
   * Window 6 (2026-09-06): the post-onboarding destination changed. The
   * owner contract 2026-09-04 §3/§4A/§7 (conversation = primary control
   * layer; CLEAR NEXT ACTION over information overload; progressive
   * disclosure) supersedes the July pin that sent a fresh worker straight to
   * the profile wall. The chat's first turn greets the person, names what
   * the profile still lacks and offers the profile as a chip — so the
   * journey is one click away. The page itself is unchanged and reachable.
   */
  it("completeOnboarding sends a fresh worker to the conversation, not the profile wall", () => {
    const actions = read("lib/auth/actions.ts");
    expect(actions).toMatch(/worker:\s*`\/\$\{locale\}\/dashboard`,/);
    expect(actions).not.toMatch(/worker:\s*`[^`]*profile#setup-journey`/);
  });

  it("the other identities keep their own first screens", () => {
    const actions = read("lib/auth/actions.ts");
    expect(actions).toMatch(/company:\s*`\/\$\{locale\}\/dashboard\/company`/);
    expect(actions).toMatch(/agency:\s*`\/\$\{locale\}\/dashboard\/company`/);
    expect(actions).toMatch(/customer:\s*`\/\$\{locale\}\/dashboard\/buyer`/);
  });

  it("the chat offers the profile as a chip and the registry routes it to the journey page", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/\{ id: "profile", label: labels\.chipProfile \}/);
    expect(chat).toMatch(/case "profile":/);
    const registry = read("lib/conversation/action-registry.ts");
    expect(registry).toMatch(/id: "worker\.complete-profile"[\s\S]*?advancedRoute: "\/dashboard\/profile"/);
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

  it("self-gates: renders no steps for a non-worker identity", () => {
    // The hub itself renders for every identity (it is also the non-worker's
    // overview); the JOURNEY inside it self-gates on the player card, exactly
    // as the standalone component did with `if (!card) return null`.
    expect(JOURNEY).toMatch(/playerCard\s*$/m);
    expect(JOURNEY).toMatch(/\?\s*\[\s*$/m);
    expect(JOURNEY).toMatch(/steps\.length > 0 &&/);
  });

  it("each step links to an existing canonical surface", () => {
    // In-page anchors now, because the guide renders ON the profile page —
    // the destinations are the same editors as before.
    expect(JOURNEY).toMatch(/href: "#profile-edit"/);
    // The `id="work-card"` anchor died with the second dashboard (W3
    // Package 4); the location step now opens the work-card capability's
    // canonical home — the player-card result in the workspace panel.
    expect(JOURNEY).toMatch(/\/dashboard\?result=player-card/);
    expect(JOURNEY).not.toMatch(/href: "\/dashboard#work-card"/);
    expect(JOURNEY).toMatch(/href: "#cv-availability"/);
    // the profile anchors actually exist on their target page
    const profile = read("app/[locale]/dashboard/profile/page.tsx");
    expect(profile).toMatch(/id="profile-edit"/);
    expect(profile).toMatch(/id="cv-availability"/);
    // …and the player-card result really carries the editor.
    expect(
      existsSync(join(APP, "app", "[locale]", "dashboard", "page.tsx")),
    ).toBe(true);
    expect(read("components/app/workspace/player-card-result.tsx")).toMatch(
      /<WorkCardEditor/,
    );
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
