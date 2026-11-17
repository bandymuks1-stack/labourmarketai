import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readPublicEntry } from "@/lib/marketing/public-entry";
import {
  companyNeedEntryHref,
  entryRequestRoute,
  PUBLIC_ENTRY_FORM_SOURCE,
  PUBLIC_ENTRY_MAX_CHARS,
} from "@/lib/marketing/public-entry-carry";
import { parseCompanyNeedPrefill } from "@/lib/staffing/company-need-prefill";

/**
 * A HIRING OR CONTRACTOR SENTENCE ON THE HOME PAGE CAN BE SENT WITHOUT AN ACCOUNT
 * (employer path P0 2026-11-15, F4). The page says a request can be sent without
 * registration, and the public need form and the project request both work signed
 * out, yet the sentence "I need 5 warehouse workers" got only sign-up and sign-in.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, "..", "..", rel), "utf8");
const examples = (locale: string) =>
  (JSON.parse(read(`messages/${locale}.json`)) as { landing: { entry: { examples: Record<string, string> } } })
    .landing.entry.examples;

function routeFor(sentence: string, chosen: string | null = null) {
  const reading = readPublicEntry(sentence);
  return entryRequestRoute(reading.kind === "recognised" ? reading.intent : null, chosen, sentence);
}

describe("which sentences get the no-account request first", () => {
  for (const locale of ["lt", "en"] as const) {
    const ex = examples(locale);

    it(`${locale}: a worker need opens the need form, written with the sentence`, () => {
      const route = routeFor(ex.hire);
      expect(route?.kind).toBe("need-form");
      if (route?.kind !== "need-form") return;
      expect(route.href.pathname).toBe("/company-need");
      // The form reads it through its own bounded prefill.
      const prefill = parseCompanyNeedPrefill(new URLSearchParams(route.href.query));
      expect(prefill.description).toBe(ex.hire);
      expect(prefill.entry).toBe(PUBLIC_ENTRY_FORM_SOURCE);
    });

    it(`${locale}: a job for someone to do opens the project request on the landing`, () => {
      expect(routeFor(ex.needService)).toEqual({ kind: "project", href: "/#request=project" });
    });

    it(`${locale}: looking for work, offering services or capacity keep the doors they had`, () => {
      for (const key of ["work", "professional", "offerService", "offerCapacity", "logWork"] as const) {
        expect(routeFor(ex[key]), key).toBeNull();
      }
    });
  }

  it("an unread sentence answered with the hire chip opens the need form too; the work chip does not", () => {
    expect(entryRequestRoute(null, "hire", "zzzz qqqq")?.kind).toBe("need-form");
    expect(entryRequestRoute(null, "work", "zzzz qqqq")).toBeNull();
  });

  it("the sentence is capped exactly as the entry caps it", () => {
    const href = companyNeedEntryHref("x".repeat(PUBLIC_ENTRY_MAX_CHARS + 50));
    expect(href.query.description).toHaveLength(PUBLIC_ENTRY_MAX_CHARS);
    expect(companyNeedEntryHref("   ").query).toEqual({ from: PUBLIC_ENTRY_FORM_SOURCE });
  });
});

describe("the entry shows it first, and sign-up second", () => {
  const entry = read("components/marketing/public-entry.tsx");

  it("the request leads the row, then sign-up, then sign-in", () => {
    const at = (needle: string) => entry.indexOf(needle);
    expect(at('testId="entry-request"')).toBeGreaterThan(-1);
    expect(at('testId="entry-request"')).toBeLessThan(at('{door("signup")}'));
    expect(at('{door("signup")}')).toBeLessThan(at('{door("login")}'));
    // Its label is the request block's own title: no new copy.
    expect(entry).toMatch(/\{requestLabel\}/);
    expect(read("app/[locale]/focus-landing/focus-landing.tsx")).toMatch(/requestLabel=\{tDoors\("title"\)\}/);
  });

  it("sign-up is no longer the primary button when a request leads, and still carries the sentence", () => {
    expect(entry).toMatch(/buttonLinkClassName\(kind === "signup" && !requestRoute \? "primary" : "secondary"\)/);
    expect(entry).toMatch(/relPath=\{entryDoorHref\(locale, kind, sentence\)\}/);
  });

  it('"sign in to save your request" is said only when no request can be sent here', () => {
    expect(entry).toMatch(/\{requestRoute \? null : \(\s*<p[^>]*>\s*\{t\("nextHint"\)\}/);
  });
});
