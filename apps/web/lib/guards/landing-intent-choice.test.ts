import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PUBLIC_INTENTS, PUBLIC_INTENT_IDS, goalHref } from "@/lib/navigation/public-intents";
import {
  FUNCTION_ICONS,
  GOAL_ICONS,
  PROFESSION_ICONS,
} from "@/lib/navigation/nav-card-icons";
import { CATALOGUE_PROFESSION_SLUGS } from "@/lib/navigation/profession-sectors";
import { NAV_CARD_ICONS } from "@/components/navigation/nav-card-icon";

/**
 * THE GOAL NAVIGATOR (owner-approved structure 2026-11-12): six goals in one
 * rail and ONE active panel under it, on the first screen.
 *
 *  1. first screen: the navigator sits directly under the headline, before
 *     the sentence entry, and is the same component `/start/<goal>` renders;
 *  2. one rail component for goals, functions and professions; one panel;
 *     only one rail inside the panel at a time;
 *  3. the URL is the state (real links, pushState, Back closes), unknown
 *     goals are a 404;
 *  4. two actions to a function: goal card, then a card that IS the function;
 *  5. every function has its own icon and every profession a DISTINCT one;
 *  6. no level numbers, route addresses or sample labels in the UI copy;
 *  7. copy exists and is translated in all 11 locales.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const landing = read("app/[locale]/focus-landing/focus-landing.tsx");
const choice = read("components/marketing/landing-intent-choice.tsx");
const navigator = read("components/navigation/goal-navigator.tsx");
const server = read("components/navigation/goal-navigation.tsx");
const rail = read("components/navigation/card-rail.tsx");
const page = read("app/[locale]/(marketing)/start/[goal]/page.tsx");

describe("the choice is the first screen", () => {
  it("mounts once, under the headline and before the sentence entry", () => {
    expect(landing.match(/<LandingIntentChoice \/>/g)).toHaveLength(1);
    const headline = landing.indexOf('{tHero("headline")}');
    const body = landing.slice(landing.lastIndexOf("<NextIntlClientProvider"));
    expect(headline).toBeGreaterThan(-1);
    expect(body.indexOf("{promise}")).toBeLessThan(body.indexOf("<LandingIntentChoice />"));
    expect(body.indexOf("<LandingIntentChoice />")).toBeLessThan(body.indexOf("<PublicEntry"));
  });

  it("the sentence entry and the request doors stay", () => {
    expect(landing).toMatch(/<PublicEntry/);
    expect(landing).toMatch(/<LandingRequestDoors locale=\{locale\} \/>/);
  });

  it("home and /start/<goal> render the SAME navigator", () => {
    expect(choice).toMatch(/<GoalNavigation \/>/);
    expect(page).toMatch(/<GoalNavigation headingLevel="h1" \/>/);
    expect(existsSync(join(APP_ROOT, "components/navigation/goal-rail.tsx"))).toBe(false);
  });
});

describe("one rail, one panel", () => {
  it("goals, functions and professions all use the one card rail", () => {
    expect(navigator.match(/<CardRail\b/g)).toHaveLength(3);
    expect(navigator).toMatch(/testId="goal-rail"/);
    expect(navigator).toMatch(/testId="function-rail"/);
    expect(navigator).toMatch(/testId="profession-rail"/);
  });

  it("no goal chosen means no panel; inside it only one rail shows", () => {
    expect(navigator).toMatch(/\{active && \(\s*<div\s+data-testid="goal-panel"/);
    expect(navigator).toMatch(/\{!showProfessions && \(\s*<CardRail/);
    expect(navigator).toMatch(/\{showProfessions && \(/);
    expect(navigator).toMatch(/\{!fullList && \(\s*<CardRail/);
  });

  it("the switch appears only for a goal with a catalogue; Close is a named button", () => {
    expect(navigator).toMatch(/\{active\.hasCatalogue && \(/);
    expect(navigator).toMatch(/data-testid="goal-panel-close"/);
    expect(navigator).toMatch(/aria-pressed=\{tab === key\}/);
  });

  it("the rail is a native scroller: swipe is the browser's, selection never resets it", () => {
    expect(rail).toMatch(/snap-x snap-mandatory[^"]*overflow-x-auto/);
    expect(rail).not.toMatch(/scrollTo\(|scrollLeft\s*=/);
    // Fade + dots + the word on touch widths; arrows only when it overflows.
    expect(rail).toMatch(/mask-image:linear-gradient/);
    expect(rail).toMatch(/\{overflows && \(\s*<p[\s\S]{0,200}md:hidden/);
    expect(rail).toMatch(/\{overflows && \(\s*<button/);
    expect(rail).toMatch(/hidden size-11[^"]*md:inline-flex/);
  });

  it("phone goal cards are compact with no description; wide cards carry it", () => {
    expect(rail).toMatch(/w-\[5\.75rem\] sm:w-auto/);
    expect(rail).toMatch(/compact && "hidden sm:\[display:-webkit-box\]"/);
  });

  it("motion respects reduced motion and nothing auto-advances", () => {
    expect(rail).toMatch(/prefers-reduced-motion: reduce/);
    expect(rail).toMatch(/motion-reduce:transition-none/);
    expect(rail + navigator).not.toMatch(/setInterval|autoplay/i);
  });
});

describe("the URL is the state", () => {
  it("the active goal is read from the path; choosing pushes the goal's address", () => {
    expect(navigator).toMatch(/GOAL_PATH\.exec\(pathname\)/);
    expect(navigator).toMatch(/window\.history\.pushState\(null, "", `\/\$\{locale\}\/start\/\$\{card\.id\}`\)/);
    expect(navigator).toMatch(/window\.history\.go\(-1\)/);
  });

  it("goal cards are real links to the same address (works without JavaScript)", () => {
    expect(server).toMatch(/href: goalHref\(intent\.id\)/);
    expect(PUBLIC_INTENT_IDS.map((id) => goalHref(id))).toEqual(
      PUBLIC_INTENT_IDS.map((id) => `/start/${id}`),
    );
    expect(rail).toMatch(/if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0\) return;/);
  });

  it("every goal is a static page and an unknown goal is a 404", () => {
    expect(page).toMatch(/PUBLIC_INTENT_IDS\.map\(\(goal\) => \(\{ goal \}\)\)/);
    expect(page).toMatch(/export const dynamicParams = false;/);
    expect(page).toMatch(/if \(!isPublicIntentId\(goal\)\) notFound\(\);/);
    expect(read("app/sitemap.ts")).toMatch(/"\/start\/work"/);
  });
});

describe("two actions to a function", () => {
  it("a function card is the function itself, built from the one intent list", () => {
    expect(server).toMatch(/PUBLIC_INTENTS\.map\(/);
    expect(server).toMatch(/functions: intent\.links\.map\(\(link\) => \(\{[\s\S]{0,80}href: link\.href/);
    expect(server + navigator).not.toMatch(/href[=:]\s*["'`]\/(?!jobs["'`]|["'`])/);
  });

  it("each card says whether it opens now or asks for sign-in when opened", () => {
    expect(server).toMatch(/link\.account \? t\("nav\.signInWhenOpen"\) : t\("nav\.opensNow"\)/);
  });

  it("a profession card opens the filtered board directly; search and the full list sit beside it", () => {
    expect(navigator).toMatch(/<form action=\{`\/\$\{locale\}\/jobs`\} method="get"/);
    expect(navigator).toMatch(/data-testid="profession-full-list"/);
    expect(navigator).toMatch(/data-testid="sector-chips"/);
  });
});

describe("icons: one per function, a distinct one per profession", () => {
  it("every function of every goal has an icon that exists", () => {
    for (const intent of PUBLIC_INTENTS) {
      expect(NAV_CARD_ICONS[GOAL_ICONS[intent.id]], intent.id).toBeTruthy();
      for (const link of intent.links) {
        const key = FUNCTION_ICONS[link.id as keyof typeof FUNCTION_ICONS];
        expect(key, `${link.id} has no icon`).toBeTruthy();
        expect(NAV_CARD_ICONS[key], link.id).toBeTruthy();
      }
    }
  });

  it("within one goal no two functions share an icon", () => {
    for (const intent of PUBLIC_INTENTS) {
      const keys = intent.links.map((l) => FUNCTION_ICONS[l.id as keyof typeof FUNCTION_ICONS]);
      expect(new Set(keys).size, intent.id).toBe(keys.length);
    }
  });

  it("every catalogue profession has its own icon, never shared", () => {
    const icons = PROFESSION_ICONS as Record<string, string>;
    for (const slug of CATALOGUE_PROFESSION_SLUGS) {
      expect(icons[slug], `${slug} has no icon`).toBeTruthy();
      expect(NAV_CARD_ICONS[icons[slug] as keyof typeof NAV_CARD_ICONS], slug).toBeTruthy();
    }
    const used = CATALOGUE_PROFESSION_SLUGS.map((s) => icons[s]);
    expect(new Set(used).size).toBe(used.length);
  });

  it("the icon tile is a fixed square — the slot a photograph takes later", () => {
    expect(rail).toMatch(/flex size-10 shrink-0 items-center justify-center rounded-lg/);
  });
});

describe("copy", () => {
  const LOCALES = readdirSync(join(APP_ROOT, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  type Nav = { siteNav: { nav: Record<string, string>; start: Record<string, string> } };
  const of = (loc: string) => (JSON.parse(read(`messages/${loc}.json`)) as Nav).siteNav;
  const en = of("en");

  it.each(LOCALES)("%s: every navigator string exists, translated, with no internal vocabulary", (loc) => {
    const mine = of(loc);
    for (const group of ["nav", "start"] as const) {
      expect(Object.keys(mine[group]).sort()).toEqual(Object.keys(en[group]).sort());
      for (const [key, value] of Object.entries(mine[group])) {
        expect(value.trim(), `${loc} ${group}.${key}`).not.toBe("");
        expect(value).not.toContain("[EN]");
        // No level numbers, route addresses or sample labels in the UI.
        expect(value, `${loc} ${group}.${key}`).not.toMatch(/level\s*\d|\/start|\/dashboard|prototype|sample|\bdemo\b/i);
        if (loc !== "en") expect(value, `${loc} ${group}.${key} untranslated`).not.toBe(en[group][key]);
      }
    }
  });
});
