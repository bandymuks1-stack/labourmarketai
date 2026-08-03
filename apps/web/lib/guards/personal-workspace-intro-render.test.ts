import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import { deriveWorkerReadiness } from "@/lib/player-card/readiness";
import { derivePersonalWorkspaceIntro } from "@/lib/workspace/personal-workspace-intro";
import { resolvePersonalWorkspaceLabels } from "@/lib/workspace/personal-workspace-labels";
import { PersonalWorkspaceIntro } from "@/components/app/workspace/personal-workspace-intro";

/**
 * "Mano erdvė" RENDER proof (S2).
 *
 * The real client component, rendered to static markup with labels resolved
 * from the REAL message catalogs by the REAL resolver, across the
 * role / workspace / readiness matrix and every ACTIVE locale. This is the
 * DOM-level evidence behind the PR: what the person actually sees in each
 * state, not just what the model returns.
 */

const APP = join(__dirname, "..", "..");
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

const catalogs: Record<string, Record<string, unknown>> = {};
const catalog = (loc: string): Record<string, unknown> =>
  (catalogs[loc] ??= JSON.parse(
    readFileSync(join(APP, "messages", `${loc}.json`), "utf8"),
  ));

/** A `getTranslations`-shaped translator over a real catalog subtree. A missing
 *  key returns a VISIBLE marker so the assertions below catch it. */
function scoped(loc: string, ns: string) {
  const root = ns
    .split(".")
    .reduce<Record<string, unknown>>(
      (o, k) => (o?.[k] ?? {}) as Record<string, unknown>,
      catalog(loc),
    );
  const fn = (key: string) => {
    const v = key
      .split(".")
      .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], root);
    return typeof v === "string" ? v : `MISSING:${ns}.${key}`;
  };
  return fn as unknown as Parameters<typeof resolvePersonalWorkspaceLabels>[0];
}

const labelsFor = (loc: string) =>
  resolvePersonalWorkspaceLabels(
    scoped(loc, "personalWorkspace"),
    scoped(loc, "playerCard.readinessSteps.pillar"),
    scoped(loc, "conversation.chat"),
  );

function card(over: Partial<WorkerPlayerCard> = {}): WorkerPlayerCard {
  return {
    displayName: null,
    skillsDeclared: 0,
    journalSupportedSkills: 0,
    candidateSkills: 0,
    evidenceEntries: 0,
    attentionInstructions: 0,
    workCardConfirmed: false,
    verifiedSkills: [],
    locationCountry: null,
    ...over,
  } as unknown as WorkerPlayerCard;
}

const FULL = {
  professionSlug: "carpenter",
  availabilityStatus: "available",
  skillsDeclared: 3,
  evidenceEntries: 4,
  journalSupportedSkills: 2,
  workCardConfirmed: true,
} as Partial<WorkerPlayerCard>;

const base = {
  identity: "person" as const,
  workspaceKind: "personal" as const,
  signedIn: true,
  hasWorkerProfile: true,
  displayName: "Jonas Petraitis",
};

const model = (
  over: Partial<Parameters<typeof derivePersonalWorkspaceIntro>[0]> = {},
) =>
  derivePersonalWorkspaceIntro({
    ...base,
    readiness: deriveWorkerReadiness(card()),
    ...over,
  });

const render = (
  intro: ReturnType<typeof derivePersonalWorkspaceIntro>,
  locale: string = "lt",
): string =>
  renderToStaticMarkup(
    createElement(PersonalWorkspaceIntro, {
      intro,
      labels: labelsFor(locale),
      onAction: () => {},
    }),
  );

describe("what each kind of account actually sees", () => {
  it("a NEW worker sees the space, the one next step, and no invented state", () => {
    const html = render(model());
    expect(html).toContain("Mano erdvė");
    expect(html).toContain("Jonas Petraitis");
    expect(html).toContain("Asmeninė erdvė");
    expect(html).toContain("Mano darbo profilis");
    expect(html).toContain("Darbo pasiruošimas");
    expect(html).toContain("Pradėti nuo savęs");
    // Nothing is met yet — the "already set" line must be absent, not "0".
    expect(html).not.toContain("personal-workspace-intro-known");
    expect(html).toContain("personal-workspace-intro-next");
  });

  it("a PARTIAL profile names what is known and the single most important gap", () => {
    const html = render(
      model({
        readiness: deriveWorkerReadiness(
          card({ professionSlug: "welder", skillsDeclared: 2 } as Partial<WorkerPlayerCard>),
        ),
      }),
    );
    expect(html).toContain("Jau nurodyta:");
    expect(html).toContain("Profesija nurodyta");
    expect(html).toContain("Pridėti įgūdžiai");
    expect(html).toContain("Svarbiausia dabar:");
    expect(html).toContain("Prieinamumas nurodytas");
    expect(html).toContain("Nurodyti, kada galiu dirbti");
  });

  it("a COMPLETE profile is never offered a completion CTA", () => {
    const html = render(model({ readiness: deriveWorkerReadiness(card(FULL)) }));
    expect(html).toContain("Viskas, kas svarbiausia, jau nurodyta.");
    expect(html).toContain("Peržiūrėti mano darbo profilį");
    expect(html).not.toContain("Papildyti mano darbo profilį");
    expect(html).not.toContain("Svarbiausia dabar:");
  });

  it("a readiness failure says so plainly — no raw state, no readiness CTA", () => {
    const html = render(model({ readiness: null }));
    expect(html).toContain("Darbo pasiruošimo dabar parodyti nepavyko");
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/needs_migration|SQLSTATE|undefined|null|Error/);
  });

  it.each([
    ["company-only / agency / customer identity", { identity: "company" as const }],
    ["an organization workspace", { workspaceKind: "organization" as const }],
    ["an account with no work profile", { hasWorkerProfile: false, readiness: null }],
    ["a signed-out visitor", { signedIn: false }],
  ])("%s renders NOTHING at all", (_label, over) => {
    expect(render(model(over))).toBe("");
  });

  it("a name-less worker gets an honest neutral header, never an invented name", () => {
    const html = render(model({ displayName: null }));
    expect(html).toContain("Asmeninė erdvė");
    expect(html).not.toContain("·"); // no dangling separator where a name would be
  });
});

describe("the rendered surface is honest and reachable", () => {
  const html = render(
    derivePersonalWorkspaceIntro({
      ...base,
      readiness: deriveWorkerReadiness(
        card({ professionSlug: "welder" } as Partial<WorkerPlayerCard>),
      ),
    }),
  );

  it("shows no percentage, score, rating, ring or verification claim", () => {
    expect(html).not.toMatch(/%|\bscore\b|\brating\b|OVR|progressbar|verified/i);
    expect(html).not.toMatch(/\b\d+\s*(iš|of|\/)\s*\d+\b/);
  });

  it("every action is a real focusable button with a visible focus ring", () => {
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(buttons.length).toBeLessThanOrEqual(3); // 1 primary + at most 2 secondary
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      expect(b).toContain("focus-visible:ring-2");
    }
  });

  it("secondary actions use the canonical pill (44px touch target)", () => {
    const pills = html.match(/<button[^>]*rounded-full[^>]*>/g) ?? [];
    expect(pills.length).toBeGreaterThan(0);
    for (const p of pills) expect(p).toContain("min-h-11");
  });

  it("the action row wraps instead of overflowing a narrow screen", () => {
    expect(html).toMatch(/class="flex flex-wrap items-center gap-2"/);
    expect(html).toMatch(/flex flex-wrap gap-x-3 gap-y-1/);
  });

  it("carries the canonical card surface, not a hand-rolled one", () => {
    expect(html).toContain("card-border");
  });
});

describe("every ACTIVE locale renders real copy", () => {
  it.each(ACTIVE_LOCALES)("%s has no missing key and no leaked identifier", (locale) => {
    for (const readiness of [
      deriveWorkerReadiness(card()),
      deriveWorkerReadiness(card({ professionSlug: "welder" } as Partial<WorkerPlayerCard>)),
      deriveWorkerReadiness(card(FULL)),
    ]) {
      const html = render(derivePersonalWorkspaceIntro({ ...base, readiness }), locale);
      expect(html, `${locale}`).not.toContain("MISSING:");
      // No camelCase action/pillar key ever reaches the screen as copy.
      expect(html, `${locale}`).not.toMatch(
        />\s*(startWithYourself|whenICanWork|whereICanWork|addSkills|addExperienceEvidence|viewWorkProfile|completeWorkProfile|whatICanDo|workCard)\s*</,
      );
      expect(html.length, `${locale}`).toBeGreaterThan(200);
    }
    // The unavailable state must be localized too.
    const degraded = render(
      derivePersonalWorkspaceIntro({ ...base, readiness: null }),
      locale,
    );
    expect(degraded, `${locale}`).not.toContain("MISSING:");
  });
});
