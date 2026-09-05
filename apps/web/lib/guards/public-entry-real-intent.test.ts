import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE PUBLIC ENTRY UNDERSTANDS A REAL SENTENCE — and never pretends.
 *
 * Owner directive 2026-09-05 (Gemini runtime check, item 8): the landing
 * "must never pretend a canned scenario is the user's answer". The frozen
 * design contract of the same day (package P1) closed that for good: the
 * scripted hero scenario is GONE, and the entry reads the visitor's own
 * sentence through the ONE deterministic conversation router. This guard
 * pins what makes that honest:
 *
 *   1. no scenario module and no scripted-scenario import anywhere under
 *      components/marketing — a worked example cannot come back quietly;
 *   2. ONE router: the entry classifies through `classifyIntent` from
 *      lib/conversation/intent-router and defines no regex vocabulary of
 *      its own (no second intent list — contract §5 P1 DO-NOT-DUPLICATE);
 *   3. an unreadable sentence gets ONE question with exactly TWO chips —
 *      the first-run families `work` / `hire` — never a guessed answer;
 *   4. the sentence NEVER enters telemetry: the `landing_intent` event
 *      carries the routed id, the family and the resolution only;
 *   5. the sentence reaches the conversation root through the EXISTING
 *      auth return path (`lib/auth/redirect.ts`), not a second channel;
 *   6. the entry copy of every routed locale carries no "illustrative" /
 *      "example data" framing and no self-certainty score.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const COMPONENT = "components/marketing/public-entry.tsx";
const HOOK = "lib/marketing/public-entry.ts";
const FOCUS = "app/[locale]/focus-landing/focus-landing.tsx";
const ROUTED_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

type Entry = Record<string, unknown>;
function entryOf(locale: string): Entry {
  const json = JSON.parse(read(`messages/${locale}.json`)) as {
    landing?: { entry?: Entry; hero?: Record<string, unknown> };
  };
  return json.landing?.entry ?? {};
}
function flatValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) flatValues(v, out);
  }
  return out;
}

describe("the scripted scenario is gone, not relabelled", () => {
  it("the hero scenario modules no longer exist", () => {
    expect(existsSync(join(APP, "components/marketing/hero-live-demo.tsx"))).toBe(false);
    expect(existsSync(join(APP, "components/app/market-map/landing-scenario.ts"))).toBe(false);
  });

  it("the landing renders the entry where the scenario used to play", () => {
    // Comments stripped: the file's own history may NAME the retired hero.
    const focus = stripComments(read(FOCUS));
    expect(focus).toContain('import { PublicEntry } from "@/components/marketing/public-entry"');
    expect(focus).toContain("<PublicEntry");
    expect(focus).not.toContain("HeroLiveDemo");
    expect(focus).not.toContain("landing-scenario");
  });

  it("the entry imports no scripted scenario and no map", () => {
    const src = stripComments(read(COMPONENT));
    expect(src).not.toMatch(/landing-scenario|LANDING_SCENARIOS|routeQuestion|MarketMap/);
  });

  it("the landing.hero namespace keeps only the headline copy", () => {
    for (const locale of ROUTED_LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        landing: { hero: Record<string, unknown> };
      };
      expect(Object.keys(json.landing.hero).sort(), `${locale}.landing.hero`).toEqual([
        "headline",
        "sub",
      ]);
    }
  });
});

describe("ONE router — the entry classifies through the conversation router and owns no vocabulary", () => {
  const hook = stripComments(read(HOOK));
  const component = stripComments(read(COMPONENT));

  it("the hook imports classifyIntent from the one deterministic router", () => {
    expect(hook).toContain('from "@/lib/conversation/intent-router"');
    expect(hook).toMatch(/import \{[^}]*classifyIntent[^}]*\}/);
    expect(hook).toContain("classifyIntent(sentence)");
  });

  it("neither module defines a regex vocabulary of its own", () => {
    for (const [name, src] of [
      [HOOK, hook],
      [COMPONENT, component],
    ] as const) {
      // A second keyword table has to MATCH something: `.test(`, `.match(`,
      // `matchAll(` or a built `RegExp`. None of those may appear — the only
      // regex the hook holds is the whitespace collapse inside `.replace(`.
      for (const needle of [".test(", ".match(", "matchAll(", "new RegExp("]) {
        expect(src, `${name} must not carry patterns of its own (${needle})`).not.toContain(
          needle,
        );
      }
    }
  });

  it("the family is a projection of the intent registry, not a parallel list of sentences", () => {
    expect(hook).toContain('from "@/lib/conversation/intent-registry"');
    expect(hook).toContain("INTENT_REGISTRY[intent]");
    expect(hook).toContain('from "@/lib/onboarding/first-run-intent"');
  });

  it("the component reads through the hook, not the router directly", () => {
    expect(component).toContain('from "@/lib/marketing/public-entry"');
    expect(component).not.toContain("lib/conversation/");
  });
});

describe("unrecognised → ONE question with exactly TWO chips", () => {
  const component = stripComments(read(COMPONENT));

  it("the chips are the two first-run families work / hire", () => {
    expect(component).toMatch(/QUESTION_CHIPS = \["work", "hire"\] as const/);
    expect(component).toContain('data-testid="entry-question"');
    expect(component).toContain('data-testid="entry-chip"');
  });

  it("the question is announced, never swallowed", () => {
    const at = component.indexOf('data-testid="entry-question"');
    const block = component.slice(Math.max(0, at - 200), at);
    expect(block).toContain('role="status"');
    expect(block).toContain('aria-live="polite"');
  });

  it("every routed locale carries the question and both chips", () => {
    for (const locale of ROUTED_LOCALES) {
      const entry = entryOf(locale);
      expect(typeof entry.unrecognised, `${locale}.unrecognised`).toBe("string");
      const chips = entry.chips as Record<string, string>;
      expect(Object.keys(chips).sort(), `${locale}.chips`).toEqual(["hire", "work"]);
    }
  });
});

describe("the sentence never enters telemetry", () => {
  const component = read(COMPONENT);

  it("the landing_intent event exists in the funnel registry", () => {
    expect(read("lib/telemetry/funnel-events.ts")).toContain('landingIntent: "landing_intent"');
    expect(component).toContain("FUNNEL_EVENTS.landingIntent");
  });

  it("every trackFunnel call carries only bounded ids — never the sentence or the draft", () => {
    const calls = [...component.matchAll(/trackFunnel\(([\s\S]*?)\}\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) {
      expect(call).not.toMatch(/sentence|draft|text\b|\.value/);
      // The metadata keys the entry may use — all bounded scalars.
      const keys = [...call.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
      for (const k of keys) {
        expect(["surface", "step", "intent", "resolution", "cta_id"]).toContain(k);
      }
    }
  });
});

describe("the sentence reaches the conversation through the existing return path", () => {
  const hook = stripComments(read(HOOK));

  it("uses lib/auth/redirect's buildReturnValue and the conversation root", () => {
    expect(hook).toContain('from "@/lib/auth/redirect"');
    expect(hook).toContain("buildReturnValue(CONVERSATION_ROOT, query)");
    expect(hook).toContain('const CONVERSATION_ROOT = "/dashboard"');
    expect(hook).toContain('PUBLIC_ENTRY_SAY_PARAM = "say"');
  });

  it("the doors are the two real auth doors, carrying ?next=", () => {
    expect(hook).toMatch(/`\/\$\{locale\}\/auth\/\$\{door\}`/);
    expect(hook).toContain("`${base}?next=${encodeURIComponent(next)}`");
    expect(read(COMPONENT)).toContain('door("signup")');
    expect(read(COMPONENT)).toContain('door("login")');
  });

  it("no storage side channel", () => {
    for (const rel of [HOOK, COMPONENT]) {
      expect(stripComments(read(rel))).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    }
  });
});

describe("the entry copy is honest in every routed locale", () => {
  const ILLUSTRATIVE =
    /iliustrac|illustrat|иллюстрат|illustratie|scenarij|scenario|сценар|Szenario|pavyzdin[ėe]s? (?:pokalb|sprend)|example (?:conversation|decision)/i;
  const CERTAINTY =
    /\b(confidence|certainty|accuracy|patikimum|увереннос|достоверност|betrouwbaarheid|zuverlässigkeit)/i;

  for (const locale of ROUTED_LOCALES) {
    it(`${locale}: no illustrative / scenario framing, no certainty score, no percentage`, () => {
      const values = flatValues(entryOf(locale));
      expect(values.length).toBeGreaterThan(30);
      for (const v of values) {
        expect(v, `${locale}: "${v}"`).not.toMatch(ILLUSTRATIVE);
        expect(v, `${locale}: "${v}"`).not.toMatch(CERTAINTY);
        expect(v, `${locale}: "${v}"`).not.toMatch(/\d\s*%/);
      }
    });

    it(`${locale}: the three examples and the per-intent lines are present`, () => {
      const entry = entryOf(locale);
      expect(Object.keys(entry.examples as Entry).sort()).toEqual(["hire", "internship", "work"]);
      const understood = entry.understood as Record<string, string>;
      for (const intent of ["need-workers", "find-work", "opportunities"]) {
        expect(understood[intent], `${locale}.understood.${intent}`).toBeTypeOf("string");
      }
      const family = entry.family as Record<string, string>;
      expect(Object.keys(family).sort()).toEqual(["agency", "education", "hire", "student", "work"]);
    });
  }
});
