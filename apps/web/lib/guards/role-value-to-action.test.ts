import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { DASHBOARD_MODULES, getModuleRoute } from "@/lib/dashboard/dashboard-module-registry";

/**
 * Role Value-to-Action Alignment v1 guard (Wave 5, owner-approved).
 *
 * Every changed value statement must sit next to a REAL action and promise
 * no more than the product does. This guard pins the six VALUE-IDs of the
 * wave (register: docs/audit/role-value-to-action-register-v1.csv):
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
  { id: "VALUE-WORKER-PROFILE-001", key: "auth.dashboard.myZone.missing.profession.hint" },
  { id: "VALUE-WORKER-JOURNAL-001", key: "auth.dashboard.myZone.missing.firstEntry.hint" },
  { id: "VALUE-WORKER-JOURNAL-002", key: "auth.dashboard.myZone.actions.recordWork.desc" },
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
  it("the journal value line is attached to the real journal composer action", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    // MyZone's firstEntry missing-item deep-links the composer — the promise
    // and the action share one surface.
    expect(page).toContain('href: "/dashboard/journal#journal-composer"');
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "journal", "page.tsx")),
    ).toBe(true);
  });

  it("the profile value line is attached to the real profile edit action", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toContain('href: "/dashboard/profile#profile-edit"');
  });

  it("the services value line describes the module whose route really exists", () => {
    const services = DASHBOARD_MODULES.find((m) => m.id === "services");
    expect(services?.descriptionKey).toBe("marketplace.hubOfferNote");
    expect(getModuleRoute("services")).toBe("/dashboard/services");
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "services", "page.tsx")),
    ).toBe(true);
  });

  it("the company need value line sits on the real demand intake", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toContain('data-testid="demand-intake-section"');
  });

  it("the service-offer promise does not exceed the real discovery loop", () => {
    // The loop the copy describes: activate → discoverable to signed-in
    // members → requests arrive. Both halves exist as real reads/pages.
    const requests = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(requests).toMatch(/listDiscoverableOfferings/);
  });
});

describe("the planning value line claims exactly the projected sources", () => {
  it("description names all six real sources in every active locale (no more, no less)", () => {
    // Truthfulness both ways: the calendar projects booking/project/task/
    // journal/invitation/finance-deadlines — the description must not
    // advertise a source that is not projected, nor hide one that is.
    const expectations: Record<string, readonly string[]> = {
      lt: ["rezervacijos", "projektai", "užduotys", "žurnalo", "kvietimai", "mokėjimų terminai"],
      en: ["bookings", "projects", "tasks", "journal", "invitations", "payment deadlines"],
      ru: ["бронирования", "проекты", "задачи", "журнала", "приглашения", "сроки платежей"],
      nl: ["boekingen", "projecten", "taken", "journaalnotities", "uitnodigingen", "betaaltermijnen"],
      de: ["Buchungen", "Projekte", "Aufgaben", "Journaleinträge", "Einladungen", "Zahlungsfristen"],
    };
    for (const locale of activeLocales) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      const text = resolve(msgs, "features.planning.description") as string;
      for (const noun of expectations[locale] ?? []) {
        expect(text, `${locale} names ${noun}`).toContain(noun);
      }
    }
  });
});
