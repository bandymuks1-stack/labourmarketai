import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  projectSentInvitationItem,
  type SentInvitationPlanningInput,
} from "@/lib/planning/planning-model";
import {
  DISCOVERY_READ_LIMIT,
  filterByCategory,
  normalizeDiscoveryCategory,
  normalizeDiscoveryCountry,
} from "@/lib/marketplace/service-requests-shared";

/**
 * Window 6, lane G — one identity, many contexts; the services loop.
 *
 * Measured on production (walk-multi-context-services, build ca96605b):
 *   G-H1  the company home's "nearest deadline" fact read
 *         "e2e-chat-student-…@labourmarket.ai — 2026-09-18" — an invitee's
 *         e-mail address used as a label.
 *   G-E1  provider discovery was an UNBOUNDED flat list (no limit, no filter).
 *   the provider could accept/decline but never write the note the requester's
 *         side already renders ("Paslaugos teikėjo pastaba").
 *   empty lists said "nothing here" without the next real step.
 *
 * These pins keep each of those fixed at the canonical layer.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function sentInvitation(over: Partial<SentInvitationPlanningInput> = {}): SentInvitationPlanningInput {
  return {
    id: "i1",
    status: "pending",
    invitedName: null,
    invitedEmail: "somebody@example.com",
    expiresAt: "2026-09-18T10:00:00Z",
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
    ...over,
  };
}

describe("G-H1 — an e-mail address is never a planning label", () => {
  it("a sent invitation without a name projects a NULL label (the renderers own the fallback noun)", () => {
    const item = projectSentInvitationItem(sentInvitation());
    expect(item.label).toBeNull();
    expect(item.counterpart).toBeNull();
    expect(JSON.stringify(item)).not.toMatch(/@/);
  });

  it("a named invitee keeps the name (trimmed) as the label", () => {
    const item = projectSentInvitationItem(sentInvitation({ invitedName: "  Jonas  " }));
    expect(item.label).toBe("Jonas");
    expect(item.counterpart).toBe("Jonas");
  });

  it("the pure mapper never reads invitedEmail into a rendered field", () => {
    const src = read("lib/planning/planning-model.ts");
    const fn = src.slice(src.indexOf("export function projectSentInvitationItem"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toMatch(/:\s*row\.invitedEmail/);
    expect(body).not.toMatch(/\?\s*row\.invitedName\s*:\s*row\.invitedEmail/);
  });

  it("the work-context panel renders the fallback noun + status for a label-less deadline (never a bare identifier)", () => {
    const src = read("lib/world-state/work-context-server.ts");
    expect(src).toMatch(/namespace:\s*"planning"/);
    expect(src).toMatch(/tPlanning\(`fallback\.\$\{d\.sourceType\}`\)/);
    expect(src).toMatch(/tAll\(d\.statusKey\)/);
  });

  for (const loc of ["lt", "en", "ru", "de", "nl"] as const) {
    it(`${loc}: planning.fallback.invitation exists for the panel to use`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        planning?: { fallback?: Record<string, string> };
      };
      expect(m.planning?.fallback?.invitation?.trim()).toBeTruthy();
    });
  }
});

describe("G-E1 — discovery is bounded and its filters are safe", () => {
  it("the discovery read carries an explicit limit and only an exact country equality", () => {
    const src = read("lib/marketplace/service-requests.ts");
    const fn = src.slice(src.indexOf("export async function listDiscoverableOfferings"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/\.limit\(DISCOVERY_READ_LIMIT\)/);
    expect(body).toMatch(/\.eq\("location_country", country\)/);
    // never a scan-shaped filter on the free-text category column
    expect(body).not.toMatch(/ilike/);
    expect(body).not.toMatch(/\.(eq|like|ilike|textSearch)\("category_slug"/);
    expect(DISCOVERY_READ_LIMIT).toBeLessThanOrEqual(200);
  });

  it("country normalizes to a 2-letter code or nothing — never passed through raw", () => {
    expect(normalizeDiscoveryCountry("lt")).toBe("LT");
    expect(normalizeDiscoveryCountry(" LT ")).toBe("LT");
    expect(normalizeDiscoveryCountry("Lithuania")).toBeNull();
    expect(normalizeDiscoveryCountry("L")).toBeNull();
    expect(normalizeDiscoveryCountry("")).toBeNull();
    expect(normalizeDiscoveryCountry(undefined)).toBeNull();
    expect(normalizeDiscoveryCountry("';--")).toBeNull();
  });

  it("category is a bounded in-memory substring match over the page", () => {
    expect(normalizeDiscoveryCategory("  ")).toBeNull();
    expect(normalizeDiscoveryCategory("x".repeat(500))?.length).toBe(80);
    const rows = [
      { id: "a", categorySlug: "buhalterija" },
      { id: "b", categorySlug: "DI sprendimai, Automatizacija" },
      { id: "c", categorySlug: null },
    ];
    expect(filterByCategory(rows, null).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(filterByCategory(rows, "BUHAL").map((r) => r.id)).toEqual(["a"]);
    expect(filterByCategory(rows, "automat").map((r) => r.id)).toEqual(["b"]);
    expect(filterByCategory(rows, "nėra").map((r) => r.id)).toEqual([]);
  });

  it("the page applies the filter from plain GET params and renders it back", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/normalizeDiscoveryCountry\(sp\.country\)/);
    expect(page).toMatch(/normalizeDiscoveryCategory\(sp\.category\)/);
    expect(page).toMatch(/listDiscoverableOfferings\(\{ country \}\)/);
    expect(page).toMatch(/filterByCategory\(/);
    const section = read("components/app/marketplace-loop-section.tsx");
    expect(section).toMatch(/method="get"/);
    expect(section).toMatch(/name="country"/);
    expect(section).toMatch(/name="category"/);
    expect(section).toMatch(/testId="marketplace-discover-filtered-empty"/);
  });
});

describe("the request → response loop reads back on BOTH sides", () => {
  it("the provider can send a note with the decision (the RPC's p_note, previously unreachable)", () => {
    const section = read("components/app/marketplace-loop-section.tsx");
    expect(section).toMatch(/data-testid="marketplace-incoming-note"/);
    expect(section).toMatch(/respondToRequest\(r\.id, "accepted", noteById\[r\.id\] \?\? null\)/);
    expect(section).toMatch(/respondToRequest\(r\.id, "declined", noteById\[r\.id\] \?\? null\)/);
    // and the requester's side still renders it
    expect(section).toMatch(/data-testid="marketplace-outgoing-note"/);
    expect(section).toMatch(/labels\.providerNote/);
  });
});

describe("honest empty states — every empty list says why and the next real step", () => {
  it("the provider inbox's empty state is derived from the caller's OWN active-offering count", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/listOwnServiceOfferings\(\)/);
    expect(page).toMatch(/r\.status === "active"/);
    expect(page).toMatch(/ownActive === 0\s*\?\s*t\("incomingEmptyNoActive"\)/);
    expect(page).toMatch(/t\("incomingEmptyHasActive", \{ count: ownActive \}\)/);
    // the CTA exists ONLY when there is nothing active (no fake CTA otherwise)
    expect(page).toMatch(/incomingEmptyCta: ownActive === 0 \? t\("linkToServices"\) : null/);
  });

  it("the discover empty state explains itself and never promises a notification path that does not exist", () => {
    const section = read("components/app/marketplace-loop-section.tsx");
    expect(section).toMatch(/why=\{labels\.discoverEmptyWhy\}/);
    expect(section).toMatch(/next=\{labels\.discoverEmptyNext\}/);
    expect(section).toMatch(/why=\{labels\.outgoingEmptyWhy\}/);
    expect(section).toMatch(/why=\{labels\.incomingEmptyWhy\}/);
    const lt = (JSON.parse(read("messages/lt.json")) as { marketplace: Record<string, string> }).marketplace;
    // The event-notification layer emits nothing in production (window 5 §2.2),
    // so the copy must not claim "we will notify you".
    expect(lt.discoverEmptyNext).not.toMatch(/pranešime,? kai/i);
    expect(lt.discoverEmptyNext).toMatch(/dar nesiunčiame/i);
  });

  const KEYS = [
    "discoverEmptyWhy",
    "discoverEmptyNext",
    "discoverFilteredEmpty",
    "outgoingEmptyWhy",
    "incomingEmptyNoActive",
    "incomingEmptyHasActive",
    "filterCountry",
    "filterCategory",
    "filterApply",
    "filterClear",
    "responseNoteLabel",
    "responseNotePlaceholder",
  ] as const;
  for (const loc of ["lt", "en", "ru", "de", "nl"] as const) {
    it(`${loc}: every new marketplace key is present and non-empty (parity with the locales that carry the namespace)`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as { marketplace: Record<string, string> }).marketplace;
      for (const k of KEYS) expect(m[k]?.trim(), `${loc}.marketplace.${k}`).toBeTruthy();
      expect(m.incomingEmptyHasActive).toMatch(/\{count, plural/);
    });
  }
});
