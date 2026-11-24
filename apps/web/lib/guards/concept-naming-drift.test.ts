import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Concept naming drift guard (audit PR7 — concept map v1).
 *
 * The in-app product has ONE canonical transaction vocabulary:
 * opportunity (work demand) / service offering / service request /
 * accepted request / booking. "Order" (LT "užsakymas", RU "заказ") is a
 * PHANTOM concept — copy only, zero data model (audit §9 #2) — and was
 * purged in PR7. This guard keeps it out of the served in-app catalogs so
 * the duplicate concept cannot quietly drift back in.
 *
 * Explicitly allowed: the customer ROLE words — LT "užsakovas", RU
 * "заказчик" — which are correct Lithuanian/Russian for "client/customer"
 * and have nothing to do with the phantom order object.
 *
 * Scope: in-app namespaces only. Landing/public marketing copy is on hold
 * by owner instruction and is NOT covered here on purpose.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Top-level catalog namespaces that render inside the authenticated app. */
const INAPP_NAMESPACES = [
  "spaces",
  "marketMap",
  "roleDashboards",
  "roles",
  "features",
  "auth",
  "marketplace",
  "bookings",
  "communication",
  "workerInvitations",
  "demandReadback",
  "opportunities",
  "serviceOfferings",
  "professions",
  "playerCard",
  "nav",
] as const;

/** Locale → phantom-order pattern. Word-boundary / lookahead built so the
 *  legitimate customer-role words never match:
 *  lt: bans užsakym* (order noun) + užsakyk* (order verb); allows užsakov*.
 *  en: bans order/orders/ordering as words; "border"/"reorder" don't match.
 *  ru: bans заказ* except заказчик* (customer role). */
const PHANTOM: Record<string, RegExp> = {
  lt: /užsakym|užsakyk/iu,
  en: /\b(?:orders?|ordering)\b/i,
  ru: /заказ(?!чик)/iu,
};

function flat(obj: unknown, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (typeof obj === "string") return [[prefix, obj]];
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out.push(...flat(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}

describe("phantom 'order' vocabulary stays out of in-app copy", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: no order-object wording in any in-app namespace`, () => {
      const catalog = JSON.parse(read(`messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      const offenders: string[] = [];
      for (const ns of INAPP_NAMESPACES) {
        for (const [key, value] of flat(catalog[ns], ns)) {
          if (PHANTOM[loc].test(value)) offenders.push(`${key} = ${value}`);
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }

  it("the customer-role words survive the purge (they are NOT the phantom)", () => {
    const lt = read("messages/lt.json");
    const ru = read("messages/ru.json");
    expect(lt).toMatch(/užsakov/iu);
    expect(ru).toMatch(/заказчик/iu);
  });
});

describe("no fake accepted-request → booking bridge claim", () => {
  it("calendarNote describes the destination, never an automatic conversion", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const catalog = JSON.parse(read(`messages/${loc}.json`)) as {
        marketplace: { connections: { calendarNote: string } };
      };
      const note = catalog.marketplace.connections.calendarNote;
      expect(note.trim().length, `${loc} calendarNote`).toBeGreaterThan(0);
      // The old claim promised a bridge the code does not have (audit §9 #3).
      expect(note, `${loc} calendarNote must not claim auto-conversion`).not.toMatch(
        /tampa rezervacija|becomes a booking|становится бронированием/iu,
      );
    }
  });

  it("the source no longer narrates the phantom bridge either", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).not.toMatch(/confirmed order becomes/i);
    expect(page).not.toMatch(/order loop/i);
  });
});
