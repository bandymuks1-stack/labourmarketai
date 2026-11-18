import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { FEATURES } from "@/lib/config/feature-availability";
import { DASHBOARD_MODULES, getModuleRoute } from "@/lib/dashboard/dashboard-module-registry";

/**
 * Role Value-to-Action Alignment v1 guard (Wave 5, owner-approved).
 *
 * Every changed value statement must sit next to a REAL action and promise
 * no more than the product does. This guard pins the wave's VALUE-IDs
 * (register: docs/audit/role-value-to-action-register-v1.csv). The three
 * worker statements carried by the MyZone control room left with the second
 * dashboard — W3 Package 4 deleted /dashboard/advanced — so the surviving
 * IDs are pinned here:
 *
 *  - the statements resolve in every ACTIVE locale;
 *  - no banned technical vocabulary or unsupported guarantee appears in
 *    the changed namespaces;
 *  - each statement's action target is a real route;
 *  - the journal value line stays attached to the real journal action;
 *  - the planning description claims exactly the sources the canonical
 *    calendar really projects.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

type Messages = Record<string, unknown>;
const resolve = (msgs: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (node, k) =>
      node && typeof node === "object" ? (node as Messages)[k] : undefined,
    msgs,
  );

/** The wave's changed statements — one entry per VALUE-ID. */
const VALUE_KEYS: readonly { id: string; key: string }[] = [
  { id: "VALUE-PROVIDER-SERVICES-001", key: "marketplace.hubOfferNote" },
  { id: "VALUE-COMPANY-NEED-001", key: "auth.dashboard.wow.demand.hire.body" },
  { id: "VALUE-ALL-PLANNING-001", key: "features.planning.description" },
];

/** Technical implementation vocabulary banned from user-facing copy. */
const BANNED_TECH = /\b(RPC|API|RLS|migracij|migration|duomenų baz|database|backend|endpoint)\b/i;
/** Guarantee-shaped promises the product cannot back. */
const BANNED_GUARANTEES =
  /garantuoj|guarantee|гарант|garandeer|garantier|automatiškai įdarbin|automatically hired/i;
/** False-availability markers (doctrine §18 bans "demo" repo-wide already). */
const BANNED_AVAILABILITY = /coming soon|netrukus pasirodys|скоро появится/i;

describe("changed value statements resolve honestly in every active locale", () => {
  for (const locale of activeLocales) {
    const msgs = JSON.parse(read(`messages/${locale}.json`));
    for (const { id, key } of VALUE_KEYS) {
      it(`${locale}: ${id} resolves and stays clean`, () => {
        const value = resolve(msgs, key);
        expect(typeof value, `${key} must resolve`).toBe("string");
        const text = value as string;
        expect(text.length).toBeGreaterThan(0);
        expect(text, "no technical vocabulary").not.toMatch(BANNED_TECH);
        expect(text, "no unsupported guarantee").not.toMatch(BANNED_GUARANTEES);
        expect(text, "no false availability").not.toMatch(BANNED_AVAILABILITY);
        // European cross-sector direction: a value line never narrows the
        // product to one country or one trade.
        expect(text).not.toMatch(/tik Lietuv|only in Lithuania|tik statyb|construction only/i);
      });
    }
  }
});

describe("each value line sits next to its REAL action", () => {
  // The journal / profile MyZone value lines died with their statements
  // (W3 Package 4) — no surface renders them, so there is nothing left to
  // sit next to an action.

  it("the services value line describes the module whose route really exists", () => {
    const services = DASHBOARD_MODULES.find((m) => m.id === "services");
    expect(services?.descriptionKey).toBe("marketplace.hubOfferNote");
    expect(getModuleRoute("services")).toBe("/dashboard/services");
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "services", "page.tsx")),
    ).toBe(true);
  });

  it("the company need value line sits on the real demand intake", () => {
    // W3 rows 7/8/25: the intake's one mount is the company page.
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    expect(page).toContain('data-testid="demand-intake-section"');
  });

  it("the service-offer promise does not exceed the real discovery loop", () => {
    // The loop the copy describes: activate → discoverable to signed-in
    // members → requests arrive. Both halves exist as real reads/pages.
    const requests = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(requests).toMatch(/listDiscoverableOfferings/);
  });
});

describe("the planning value line claims only what production proved", () => {
  // Owner P0 2026-11-11 supersedes the earlier "name all six sources" pin: an
  // active description may say only what a production walk proved
  // (lib/guards/catalog-status-evidence.test.ts — description = its claim
  // sentences, each with a walk run id). No walk shows every source on the
  // calendar, so the copy says what calendar-planning proved: a company's plan
  // for its people and the person's own calendar. A source named in the copy
  // must still be one the calendar really projects.
  const SOURCE_NOUNS: Record<string, Record<string, string>> = {
    en: { booking: "bookings", project: "projects", task: "tasks", journal: "journal", invitation: "invitations", finance: "payment deadlines" },
    lt: { booking: "rezervacijos", project: "projektai", task: "užduotys", journal: "žurnalo", invitation: "kvietimai", finance: "mokėjimų terminai" },
  };
  it("the calendar still projects every source the copy could name", () => {
    const model = read("lib/planning/planning-model.ts");
    for (const kind of Object.keys(SOURCE_NOUNS.en)) expect(model).toContain(`"${kind}",`);
  });
  it("the planning description is built from walk-proven claims", () => {
    const planning = FEATURES.find((f) => f.key === "planning");
    expect(planning?.availability).toBe("active");
    expect(planning?.claims?.map((c) => c.register).sort()).toEqual(["3.14", "5.11"]);
  });
  it("no source is advertised beyond those claims (en, lt)", () => {
    for (const [locale, nouns] of Object.entries(SOURCE_NOUNS)) {
      const text = resolve(JSON.parse(read(`messages/${locale}.json`)), "features.planning.description") as string;
      for (const noun of Object.values(nouns)) expect(text, `${locale} names ${noun} without a walk`).not.toContain(noun);
    }
  });
});
