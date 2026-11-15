import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  PUBLIC_INTENTS,
  PUBLIC_INTENT_IDS,
  MORE_GOAL_ID,
  goalFromFragment,
  goalHref,
  goalIdFromFragment,
} from "@/lib/navigation/public-intents";
import {
  AREA_ICONS,
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
 *     the sentence entry;
 *  2. one rail component for goals, functions and professions; one panel;
 *     only one rail inside the panel at a time;
 *  3. the URL is the state, as a FRAGMENT of the page (real links,
 *     pushState, Back closes) — no new public screen is added;
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
/** CardRail mounts in the navigator: goals, functions, professions. */
const navigatorRails = 5;
const server = read("components/navigation/goal-navigation.tsx");
const rail = read("components/navigation/card-rail.tsx");

describe("the choice is the first screen", () => {
  it("mounts once, first, carrying the page's h1; the owner's line and the entry follow", () => {
    // Landing V3 (owner, 2026-11-13): the one line now sits directly under
    // the h1, INSIDE the navigator (`lead`), so it is read before the choice;
    // the sentence entry follows as the alternative way to say the same need.
    expect(landing.match(/<LandingIntentChoice\b/g)).toHaveLength(1);
    const body = landing.slice(landing.lastIndexOf("<NextIntlClientProvider"));
    expect(body).toMatch(/<LandingIntentChoice\s+lead=\{tV3\("lead"\)\}/);
    expect(landing).not.toMatch(/<h1\b/);
    expect(body.indexOf("<LandingIntentChoice")).toBeLessThan(body.indexOf("<PublicEntry"));
    expect(navigator).toMatch(/\{lead && \(\s*<p\s+data-testid="goal-lead"/);
    // On a phone the first four goals show whole, two across; the other two
    // sit under one "more" control — never a carousel.
    expect(body).toMatch(/phoneMore=\{\{ ids: \["partners", "agencies"\], label: tV3\("moreChoices"\) \}\}/);
  });

  it("the sentence entry and the request doors stay", () => {
    expect(landing).toMatch(/<PublicEntry/);
    // The request doors stay, inside ONE closed "send a request" block beside
    // the sentence field (owner P0 2026-11-13: no three cards that read like
    // the goals again). The block carries the title and the #request anchor.
    // The three request doors live behind ONE "submit a request" entry.
    expect(landing).toMatch(/<LandingNeedPath locale=\{locale\} \/>/);
    expect(readFileSync(join(APP_ROOT, "components/marketing/landing-v3.tsx"), "utf8")).toMatch(
      /<LandingRequestDoors locale=\{locale\} embedded \/>/,
    );
    const need = readFileSync(join(APP_ROOT, "components/marketing/landing-v3.tsx"), "utf8");
    expect(need).toMatch(/<details\s+id="request"\s+data-testid="landing-need-path"/);
    // Sent open (wide screens show the services without a tap; also the safe
    // state with no script) and folded on a narrow screen before first paint
    // — unless the address asks for one of its forms.
    expect(need).toMatch(/data-testid="landing-need-path"\s+open\s/);
    expect(need).toMatch(/window\.matchMedia\("\(max-width: 1023px\)"\)\.matches&&location\.hash\.indexOf\("#request"\)!==0\)d\.removeAttribute\("open"\)/);
    expect(need.match(/<LandingRequestDoors /g)).toHaveLength(1);
    // A goal's action can open one form directly: `/#request=b2b`.
    const form = readFileSync(join(APP_ROOT, "components/marketing/landing-request-doors-form.tsx"), "utf8");
    expect(form).toMatch(/const wanted = requestDoorFromFragment\(window\.location\.hash\);/);
    expect(form).toMatch(/if \(block instanceof HTMLDetailsElement\) block\.open = true;/);
  });

  it("the home mounts the one navigator; no second goal view or page exists", () => {
    expect(choice).toMatch(
      /<GoalNavigation headingLevel="h1" phoneLayout="grid" lead=\{lead\} phoneMore=\{phoneMore\} \/>/,
    );
    expect(existsSync(join(APP_ROOT, "components/navigation/goal-rail.tsx"))).toBe(false);
    // A new public screen is an owner decision (constitution A-09): the goal
    // state is a fragment of this page, not a route.
    expect(existsSync(join(APP_ROOT, "app/[locale]/(marketing)/start"))).toBe(false);
  });
});

describe("one rail, one panel", () => {
  it("goals, functions and professions all use the one card rail", () => {
    // Goals, the live panel's functions and professions, and the functions of
    // the early (pre-script) panels.
    // … plus the phone's "more" part, which shows the remaining goals in the
    // same cards (Landing V3).
    expect(navigator.match(/<CardRail\b/g)).toHaveLength(5);
    expect(navigator).toMatch(/testId="goal-rail"/);
    expect(navigator).toMatch(/testId="function-rail"/);
    expect(navigator).toMatch(/testId="profession-rail"/);
  });

  it("no goal chosen means no panel; inside it only one rail shows", () => {
    expect(navigator).toMatch(/\{active && \(\s*<div\s+data-testid="goal-panel"/);
    expect(navigator).toMatch(/\{!showProfessions && \(\s*<CardRail/);
    expect(navigator).toMatch(/\{showProfessions && \(/);
    // (On a phone in the no-swipe layout the profession rail is replaced by
    // the list, so the rail sits in a wrapper that hides it there.)
    expect(navigator).toMatch(/\{!fullList && \(\s*<div className=\{phoneMore \? "max-sm:hidden" : undefined\}>\s*<CardRail/);
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
    expect(rail).toMatch(/phoneGrid \? "w-auto" : "w-\[5\.75rem\]", "sm:w-auto sm:min-w-40 sm:flex-1"/);
    // The grid is phones only: from `sm` the track is the same flex rail.
    expect(rail).toMatch(/phoneGrid \? "grid grid-cols-3 sm:flex" : "flex"/);
    expect(rail).toMatch(/compact && "hidden sm:\[display:-webkit-box\]"/);
  });

  it("motion respects reduced motion and nothing auto-advances", () => {
    expect(rail).toMatch(/prefers-reduced-motion: reduce/);
    expect(rail).toMatch(/motion-reduce:transition-none/);
    expect(rail + navigator).not.toMatch(/setInterval|autoplay/i);
  });
});

describe("the URL is the state — a fragment, not a page", () => {
  it("the active goal is read from the fragment; choosing pushes it without a jump", () => {
    expect(navigator).toMatch(/useSyncExternalStore\(subscribeToFragment, readFragment, readServerFragment\)/);
    // The fragment names a card of THIS navigator, or nothing opens.
    // A goal id that no longer exists (`orders`) resolves to the goal that
    // now holds what it held, so an old link never opens nothing.
    expect(navigator).toMatch(
      /goals\.find\(\(g\) => g\.id === canonicalGoalId\(goalIdFromFragment\(fragment\)\)\) \?\? null/,
    );
    expect(navigator).toMatch(/window\.history\.pushState\(\s*(?:\/\/[^\n]*\n\s*)*\{ \[GOAL_DEPTH_KEY\]: goalDepth\(\) \+ 1 \},/);
    // Close reads the depth from the CURRENT history entry (Codex P2 on
    // c1caca4): a running count of selections went too far after Back.
    expect(navigator).toMatch(/const depth = goalDepth\(\);/);
    expect(navigator).toMatch(/window\.history\.go\(-depth\)/);
    // Close always ends with NO goal open, even when the origin entry is a
    // shared goal link (Codex P2 on ecd546d).
    expect(navigator).toMatch(/window\.addEventListener\("popstate", clearGoal, \{ once: true \}\);\s*window\.history\.go\(-depth\)/);
    expect(navigator).toMatch(/if \(depth === 0\) \{[\s\S]{0,120}clearGoal\(\)/);
    expect(navigator).not.toMatch(/useRef|pushed\.current/);
    expect(navigator).toMatch(/addEventListener\("popstate", onChange\)/);
  });

  it("a goal chosen while the page is starting is kept", () => {
    // The fragment the person last asked for is put back if the router drops
    // it silently — only during start-up, and never after a Close or Back.
    expect(navigator).toMatch(/const \[bootFragment\] = useState\(\(\) =>/);
    expect(navigator).toMatch(/askedFragment = goalIdFromFragment\(now\) \? now : "";/);
    // …read from the navigation itself, so a router rewrite that lands
    // between the navigation and its event cannot erase the choice.
    expect(navigator).toMatch(/const now = went \? new URL\(went\)\.hash : window\.location\.hash;/);
    expect(navigator).toMatch(/const wanted = askedFragment \?\? \(goalIdFromFragment\(bootFragment\) \? bootFragment : ""\);/);
    // …and only on the page it was asked on — never written onto the next
    // page while the router is moving there.
    expect(navigator).toMatch(/const \[bootPath\] = useState\(\(\) =>/);
    expect(navigator).toMatch(/if \(window\.location\.pathname !== bootPath\) return;/);
    expect(navigator).toMatch(/if \(!wanted \|\| window\.location\.hash !== ""\) return;/);
    // The other way round: a goal closed during start-up stays closed even
    // if the router writes its remembered address back.
    expect(navigator).toMatch(/if \(askedFragment === "" && goalIdFromFragment\(window\.location\.hash\)\) \{/);
    // One-off checks during start-up only — no repeating timer.
    expect(navigator).toMatch(/STARTUP_CHECKS_MS\.map\(\(ms\) => window\.setTimeout\(restore, ms\)\)/);
    expect(navigator).toMatch(/STARTUP_CHECKS_MS = \[[^\]]*5000\] as const/);
  });

  it("the first tap does not wait for the scripts: every goal's panel is sent, shown by :target", () => {
    // An anchor carrying the goal's fragment as its id, directly followed by
    // that goal's panel, hidden until the address targets the anchor.
    expect(navigator).toMatch(/id=\{`\$\{GOAL_FRAGMENT_PREFIX\.slice\(1\)\}\$\{goal\.id\}`\}\s+data-goal-anchor=""/);
    expect(navigator).toMatch(/data-testid="goal-panel-early"/);
    expect(navigator).toMatch(/"hidden \[\[data-goal-anchor\]:target\+&\]:flex"/);
    // Close works with no script: a plain link to the navigator's own
    // anchor, which targets no goal (and is not a dead `#`).
    expect(navigator).toMatch(/const NAVIGATOR_ID = "goals";/);
    expect(navigator).toMatch(/id=\{NAVIGATOR_ID\}/);
    expect(navigator).toMatch(/href=\{`#\$\{NAVIGATOR_ID\}`\}\s+data-testid="goal-panel-early-close"/);
    // Taken out for good once the component is alive, and never beside the
    // live panel.
    expect(navigator).toMatch(/\{!started &&\s+!active &&\s+goals\.map\(/);
    expect(navigator).toMatch(/const \[started, setStarted\] = useState\(false\);/);
  });

  it("goal cards are real links to that fragment; only known goals open a panel", () => {
    expect(server).toMatch(/href: goalHref\(intent\.id\)/);
    for (const id of PUBLIC_INTENT_IDS) {
      expect(goalHref(id)).toBe(`#goal=${id}`);
      expect(goalFromFragment(goalHref(id))).toBe(id);
    }
    for (const bad of ["", "#", "#goal=", "#goal=admin", "#goal=work/..", "#other=work"]) {
      expect(goalFromFragment(bad), bad).toBeNull();
    }
    // The navigator's own reader takes any well-formed id and nothing else;
    // an id with no card of that name opens nothing (checked above).
    expect(goalIdFromFragment("#goal=more")).toBe(MORE_GOAL_ID);
    for (const bad of ["", "#", "#goal=", "#goal=work/..", "#goal=<x>", "#other=work", "#goal=Work"]) {
      expect(goalIdFromFragment(bad), bad).toBeNull();
    }
    expect(rail).toMatch(/if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0\) return;/);
  });

  it("the server renders the rail alone, so the landing stays one static page", () => {
    expect(navigator).toMatch(/const readServerFragment = \(\) => "";/);
    expect(server).not.toMatch(/cookies\(|headers\(|searchParams/);
  });
});

describe("two actions to a function", () => {
  it("a function card is the function itself, built from the one intent list", () => {
    expect(server).toMatch(/PUBLIC_INTENTS\.map\(/);
    expect(server).toMatch(/functions: intent\.links\.map\(\(link\) => \(\{[\s\S]{0,260}href: link\.href\.startsWith\("\/#"\) \? link\.href\.slice\(1\) : link\.href/);
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

describe("an optional More card (signed-in homes: the areas that belong to no goal)", () => {
  it("is one extra card after the goals with the fixed id, opened by its own fragment", () => {
    expect(navigator).toMatch(/more\?: Omit<NavigatorGoal, "id" \| "hasCatalogue">;/);
    expect(navigator).toMatch(
      /more \? \[\.\.\.ownGoals, \{ \.\.\.more, id: MORE_GOAL_ID, hasCatalogue: false \}\] : ownGoals/,
    );
    expect(MORE_GOAL_ID).toBe("more");
    expect(goalHref(MORE_GOAL_ID)).toBe("#goal=more");
    // Still one rail and one panel: the card goes through the same list.
    expect(navigator.match(/<CardRail/g)!.length).toBe(navigatorRails);
  });

  it("the public landing passes none: its remaining links sit behind the header's More", () => {
    expect(server).not.toMatch(/more=/);
  });
});

describe("the pin slot (signed-in homes build on it)", () => {
  it("is a sibling of the card's link, never nested in it, with its own name and state", () => {
    const link = rail.slice(rail.indexOf("<CardLink"), rail.indexOf("</CardLink>"));
    expect(link).not.toMatch(/<button/);
    expect(rail).toMatch(/<\/CardLink>\s*\{card\.pin && \(\s*<button/);
    expect(rail).toMatch(/aria-pressed=\{card\.pin\.pressed\}/);
    expect(rail).toMatch(/aria-label=\{card\.pin\.label\}/);
    expect(rail).toMatch(/absolute right-0 top-0 inline-flex size-11/);
  });

  it("the shared icon set carries the signed-in areas' icons", () => {
    for (const key of Object.values(AREA_ICONS)) expect(NAV_CARD_ICONS[key]).toBeTruthy();
  });

  it("signed-in destinations are never prefetched from a public page", () => {
    expect(rail).toMatch(/prefetch=\{href\.startsWith\("\/dashboard"\) \? false : undefined\}/);
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
        expect(value, `${loc} ${group}.${key}`).not.toMatch(/level\s*\d|#goal|\/dashboard|prototype|sample|\bdemo\b/i);
        if (loc !== "en") expect(value, `${loc} ${group}.${key} untranslated`).not.toBe(en[group][key]);
      }
    }
  });
});
