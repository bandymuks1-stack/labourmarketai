import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CORE_NAV_IDS, getCoreNavItems } from "@/lib/config/navigation";

/**
 * EVERY CONTEXT GETS THE SAME CORE, AND THERE IS ONE CALENDAR.
 *
 * ── §11, owner walk 2026-09-27
 *
 * "Tas pats kalendorius gali rodyti skirtingą teisėtai prieinamą informaciją
 * pagal kontekstą, bet nekurk trijų kalendorių."
 *
 * Audited person / company / agency / institution after the #1881 nav repair,
 * and the parity is structural rather than lucky — which is the part worth
 * pinning, because it is easy to break by being helpful:
 *
 *   · `getCoreNavItems()` takes NO context, role or workspace argument. There is
 *     one core list and every authenticated context is served the same one, from
 *     the same catalogue. A "company nav" or an "agency nav" would be the second
 *     nav model that #1881 removed.
 *   · `/dashboard/planning` is the ONE calendar. `lib/planning/planning.ts`
 *     scopes it by RIGHTS — the caller's own rows plus organizations they manage
 *     (`manages_organization`) — so an org context sees more through the SAME
 *     surface instead of getting its own.
 *
 * ── THE NEAR MISS THIS RECORDS
 *
 * `/dashboard/company/planning` exists and is NOT a second calendar: it is the
 * workforce capacity zone (`getWorkforce` → requirements → `assessCapacity` →
 * `buildGapTimeline` → `recommendActions`), and it is named differently to a
 * person — "Darbo jėgos planavimas" against the calendar's "Kalendorius". Two
 * capabilities, two names, one route each. It is called out here so that a later
 * reader who notices two routes containing "planning" does not "consolidate"
 * them, and equally so that nobody turns it INTO a calendar.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

describe("§11 — one core nav for every context", () => {
  it("the core list is context-free: no role, workspace or org argument", () => {
    // If this ever takes a context, each context can be given a different core,
    // which is how a second nav model starts.
    expect(getCoreNavItems.length, "getCoreNavItems takes no arguments").toBe(0);
    const nav = read("lib/config/navigation.ts");
    const coreFn = nav.slice(
      nav.indexOf("export function getCoreNavItems"),
      nav.indexOf("export function getAdvancedNavItems"),
    );
    expect(coreFn.length).toBeGreaterThan(0);
    for (const forbidden of ["activeRole", "workspace", "organization", "isAdmin"]) {
      expect(coreFn, `the core must not branch on ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  /**
   * THE ONE AUDITED EXCEPTION, and why it is written down rather than excluded
   * silently. `dashboard/company/planning` shares the leaf name "planning" with
   * the calendar and is NOT a copy of it: it is the workforce capacity zone,
   * proven distinct by the two tests in the next block (different modules,
   * different human name, no calendar read). The first version of this test
   * flagged it, which is exactly the review this pair of rules is for — so the
   * exception carries its justification instead of a silent skip.
   */
  const AUDITED_NOT_A_COPY = new Set(["company/planning"]);

  it("every core destination is one route, shared by all contexts", () => {
    // No `.../company/journal`, `.../agency/planning` sibling of a core
    // destination — that is the "three calendars" shape, one context at a time.
    const items = getCoreNavItems();
    expect(items.length).toBe(CORE_NAV_IDS.length);
    for (const item of items) {
      if (item.href === "/dashboard") continue;
      const leaf = item.href.replace("/dashboard/", "");
      for (const ctx of ["company", "agency", "institution"]) {
        if (AUDITED_NOT_A_COPY.has(`${ctx}/${leaf}`)) continue;
        const rival = join(WEB, "app", "[locale]", "dashboard", ctx, leaf, "page.tsx");
        expect(
          existsSync(rival),
          `${ctx}/${leaf} would be a per-context copy of a core destination`,
        ).toBe(false);
      }
    }
  });

  it("the audited exception is still real — it must not quietly disappear", () => {
    // ANTI-VACUITY: if the workforce zone is ever deleted or moved, the
    // exemption above stops describing anything and must be removed with it,
    // rather than sitting there excusing a future per-context calendar.
    for (const exempt of AUDITED_NOT_A_COPY) {
      expect(
        existsSync(join(WEB, "app", "[locale]", "dashboard", exempt, "page.tsx")),
        `${exempt} is exempted but does not exist`,
      ).toBe(true);
    }
  });
});

describe("§11 — one calendar, scoped by rights", () => {
  it("the calendar reads org data through the SAME module, by rights", () => {
    const planning = read("lib/planning/planning.ts");
    // Rights-based widening, not a separate org calendar.
    expect(planning).toMatch(/manages_organization/);
    expect(planning).toMatch(/organization/);
  });

  it("the workforce zone is a DIFFERENT capability, not a second calendar", () => {
    const zone = "app/[locale]/dashboard/company/planning/page.tsx";
    expect(existsSync(join(WEB, zone)), "the workforce zone exists").toBe(true);
    const src = read(zone);
    // It is capacity planning…
    expect(src).toMatch(/getWorkforce|assessCapacity|buildGapTimeline|planning-zone-view/);
    // …and it must not become the calendar: no booking/leave calendar read here.
    expect(src).not.toMatch(/from "@\/lib\/planning\/calendar-result"/);
    expect(src).not.toMatch(/loadCalendarResult/);
  });

  it("the two are named differently to a person, in every routed locale", () => {
    // The §4 lesson: two real objects must never share a human name. A company
    // person must be able to tell "Kalendorius" from "Darbo jėgos planavimas".
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const m = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        Record<string, unknown>
      >;
      const calendar = (m.features as Record<string, { label?: string }> | undefined)
        ?.planning?.label;
      const zone = (m.workforcePlanning as { title?: string } | undefined)?.title;
      expect(calendar, `${locale} calendar label`).toBeTruthy();
      expect(zone, `${locale} workforce zone title`).toBeTruthy();
      expect(zone, `${locale}: the two surfaces must not share a name`).not.toBe(
        calendar,
      );
    }
  });
});
