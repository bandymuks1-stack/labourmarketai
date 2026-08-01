import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  describeConversationCard,
  deriveOriginKey,
} from "@/lib/communication/conversation-display";
import { evaluateCommunicationRequest } from "@/lib/communication/communication-eligibility";

/**
 * Message context + contact permissions honesty guard
 * (message-context-contact-permissions-p0).
 *
 * Locks the launch-base contract for communication + contact:
 *   - the thread "who started this" origin is derived ONLY from the real
 *     created_by vs the viewer — never an invented identity;
 *   - the thread DETAIL header carries the same honest who/what/context as the
 *     list (no thread that hides who/what it is);
 *   - surfaces with NO permission bridge (CV / player card / map) expose NO
 *     contact CTA (no stranger contact);
 *   - the real contact action stays permission-gated, default-closed;
 *   - no fake read/delivered/seen receipts anywhere in the thread UI.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("thread origin is the real creator-vs-viewer signal, never an invented name", () => {
  it("is null (render nothing) when it cannot be known", () => {
    expect(deriveOriginKey(null, "v")).toBeNull();
    expect(deriveOriginKey("c", null)).toBeNull();
    expect(deriveOriginKey(undefined, undefined)).toBeNull();
  });
  it("says YOU started it only when created_by === viewer", () => {
    expect(deriveOriginKey("same", "same")).toBe("origin.you");
  });
  it("says SOMEONE ELSE without ever exposing who", () => {
    expect(deriveOriginKey("creator-id", "viewer-id")).toBe("origin.other");
    // The model carries only an i18n key — never a raw id / name.
    const m = describeConversationCard({ kind: "direct", createdBy: "abc-123", viewerId: "xyz-789" });
    expect(m.originKey).toBe("origin.other");
    expect(JSON.stringify(m)).not.toContain("abc-123");
    expect(JSON.stringify(m)).not.toContain("xyz-789");
  });
  it("direct/team counterparty is RESTRICTED (details-not-shown), never a name, even with an origin", () => {
    const m = describeConversationCard({ kind: "direct", createdBy: "a", viewerId: "b" });
    expect(m.counterpartyKnown).toBe(false);
    expect(m.counterpartyRestricted).toBe(true);
    expect(m.counterpartyKey).toBe("counterparty.restricted");
  });
});

describe("thread detail header reaches list-parity (who / what / context)", () => {
  const detail = read("app/[locale]/dashboard/communication/[conversationId]/page.tsx");
  it("derives the honest card model (not just the kind chip)", () => {
    expect(detail).toContain("describeConversationCard");
    expect(detail).toMatch(/createdBy:\s*conversation\.created_by/);
    expect(detail).toMatch(/viewerId:\s*user\.id/);
  });
  it("renders counterparty + scope + origin honestly", () => {
    expect(detail).toMatch(/data-testid="thread-counterparty"/);
    expect(detail).toMatch(/data-testid="thread-scope"/);
    expect(detail).toMatch(/data-testid="thread-origin"/);
    expect(detail).toMatch(/t\(card\.counterpartyKey\)/);
    expect(detail).toMatch(/t\(card\.scopeKey\)/);
  });
});

describe("list page surfaces the honest origin", () => {
  const page = read("app/[locale]/dashboard/communication/page.tsx");
  it("passes the real creator + viewer and renders the origin line", () => {
    expect(page).toMatch(/createdBy:\s*c\.created_by/);
    expect(page).toMatch(/viewerId:\s*user\.id/);
    expect(page).toMatch(/conversation-origin-\$\{c\.id\}/);
  });
});

describe("no stranger contact: CV / player card / map expose NO contact CTA", () => {
  const NO_CONTACT_SURFACES = [
    "components/app/worker-player-card.tsx",
    "components/app/market-map/location-map.tsx",
    "components/app/market-map-base.tsx",
    "app/[locale]/dashboard/journal/page.tsx",
    "app/[locale]/dashboard/reports/evidence/page.tsx",
  ];
  for (const rel of NO_CONTACT_SURFACES) {
    if (!existsSync(join(ROOT, rel))) continue;
    it(`${rel} has no MessageButton / RequestCommunicationButton`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/MessageButton/);
      expect(src).not.toMatch(/RequestCommunicationButton/);
      expect(src).not.toMatch(/openDirectConversationAction|requestWorkerConversationAction/);
    });
  }
});

describe("the real contact action stays permission-gated (default-closed)", () => {
  it("denies when nothing is established, allows only when every fact holds", () => {
    expect(
      evaluateCommunicationRequest({ ownsDemand: false, shortlisted: false, canContact: false }),
    ).toBe("not_owner");
    expect(
      evaluateCommunicationRequest({ ownsDemand: true, shortlisted: false, canContact: false }),
    ).toBe("not_shortlisted");
    expect(
      evaluateCommunicationRequest({ ownsDemand: true, shortlisted: true, canContact: false }),
    ).toBe("not_contactable");
    expect(
      evaluateCommunicationRequest({ ownsDemand: true, shortlisted: true, canContact: true }),
    ).toBe("allowed");
  });
});

describe("no fake read/delivered/seen receipts in the thread UI", () => {
  const FAKE_RECEIPT = /\bdelivered\b|read receipt|\bseen at\b|✓✓|is typing|online now/i;
  // Strip comments first: honest source comments (e.g. "no fake 'delivered'
  // indicator") document the ABSENCE of fakery and must not trip the scan. The
  // risk is fabricated state RENDERED to the user, not documentation.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const rel of [
    "app/[locale]/dashboard/communication/page.tsx",
    "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
    "components/app/communication-composer.tsx",
  ]) {
    if (!existsSync(join(ROOT, rel))) continue;
    it(`${rel} carries no fabricated delivery/read state`, () => {
      const m = stripComments(read(rel)).match(FAKE_RECEIPT);
      expect(m, `fake receipt token in ${rel}: ${m?.[0]}`).toBeNull();
    });
  }
});

describe("honest origin copy exists in all active locales", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: communication.origin.you + .other are present and non-empty`, () => {
      const origin = (JSON.parse(read(`messages/${loc}.json`)) as Record<string, Record<string, Record<string, string>>>)
        .communication?.origin;
      for (const key of ["you", "other"] as const) {
        expect(origin?.[key]?.trim().length, `${loc}.communication.origin.${key}`).toBeGreaterThan(0);
      }
    });
  }
});
