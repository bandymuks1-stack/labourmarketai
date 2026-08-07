import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";

const COMPONENTS = join(__dirname, "..", "..", "components", "app");
const MESSAGES = join(__dirname, "..", "..", "messages");

/**
 * UX audit 2026-08-07, pinned at origin/main 779357aa.
 *
 * Two findings, two guards. Both were reproduced in a real browser before the
 * fix and re-proved after it; these tests exist so neither can come back
 * silently.
 */

describe("auth forms cannot fall back to a GET that leaks credentials", () => {
  /**
   * Every auth form is a client component whose submit is handled in
   * `onSubmit`. A form with no `method` defaults to GET, so a submit issued
   * BEFORE React hydrates serialises every field into the query string.
   * Reproduced against the login form:
   *   /lt/auth/login?email=…&password=…
   * — which lands in browser history, the access log and any Referer.
   *
   * `method="post"` is a pre-hydration fallback, not a real endpoint: the
   * values travel in a request body that nothing reads.
   */
  const FORMS = [
    "login-form.tsx",
    "signup-form.tsx",
    "forgot-password-form.tsx",
    "reset-password-form.tsx",
  ] as const;

  for (const file of FORMS) {
    it(`${file} declares method="post"`, () => {
      const src = readFileSync(join(COMPONENTS, file), "utf8");
      const openTags = src.match(/<form[^>]*>/g) ?? [];
      expect(openTags.length).toBeGreaterThan(0);
      for (const tag of openTags) {
        expect(tag, `<form> in ${file} must carry method="post"`).toContain(
          'method="post"',
        );
      }
    });
  }
});

describe("command finder offers the canonical destinations with no history", () => {
  /**
   * `/dashboard` deliberately renders no tab row — the owner ruling recorded
   * in conversation-header.tsx makes the journal, calendar, messages and the
   * card PROJECTIONS opened from the conversation, one channel of which is
   * this command search. That ruling stands.
   *
   * But recents come from localStorage, so a first session opened the finder
   * as a bare input, and the measured home carried zero links: a first-time
   * person had no visible route to a calendar, an inbox or a map at all.
   * The starters close that hole using the SAME registry rows — no second
   * navigation model and no new route.
   */
  const src = readFileSync(join(COMPONENTS, "command-finder.tsx"), "utf8");

  const starterIds = (
    src.match(/const STARTER_COMMAND_IDS: readonly string\[\] = \[([\s\S]*?)\]/)?.[1] ?? ""
  )
    .split(",")
    .map((s) => s.trim().replace(/^["']|["'],?$/g, ""))
    .filter(Boolean);

  it("declares a non-empty starter list", () => {
    expect(starterIds.length).toBeGreaterThanOrEqual(4);
  });

  it("every starter id resolves to a real registry entry", () => {
    for (const id of starterIds) {
      const entry = COMMAND_REGISTRY.find((e) => e.id === id);
      expect(entry, `STARTER_COMMAND_IDS contains unknown id "${id}"`).toBeDefined();
    }
  });

  it("covers the core work loop plus the map", () => {
    const routes = starterIds.map(
      (id) => COMMAND_REGISTRY.find((e) => e.id === id)?.route ?? "",
    );
    for (const required of [
      "/dashboard/journal",
      "/dashboard/planning",
      "/dashboard/communication",
      "/dashboard/market-map",
    ]) {
      expect(routes, `starters must reach ${required}`).toContain(required);
    }
  });

  it("renders starters only when there is no query and no history", () => {
    expect(src).toContain("query.trim().length > 0 || recentEntries.length > 0");
  });

  it("has a startersLabel in every locale that ships the finder", () => {
    for (const locale of ["lt", "en", "de", "nl", "ru"]) {
      const messages = JSON.parse(
        readFileSync(join(MESSAGES, `${locale}.json`), "utf8"),
      ) as { commandFinder?: Record<string, string> };
      expect(
        messages.commandFinder?.startersLabel,
        `${locale}.json is missing commandFinder.startersLabel`,
      ).toBeTruthy();
    }
  });
});
