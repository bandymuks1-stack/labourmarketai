import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FEATURES } from "@/lib/config/feature-availability";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "@/lib/config/navigation";

/**
 * Guard: P0 system-operation fixes (2026-06-16) — real-user delivery bugs.
 *
 * Locks the three operation fixes so they cannot silently regress:
 *   1. Request sent to a worker must be REACHABLE by the recipient — the
 *      communication inbox is a first-class primary-nav surface with an unread
 *      badge, so an incoming request is actually noticed.
 *   2. Company need / work-order submit must surface the REAL cause — a missing
 *      RPC/column maps to an honest "needs DB update" state, not a generic
 *      "try again" that hides it.
 *   3. Mobile skills save must not hang on "Įrašoma…" — the save promise is
 *      bounded by a timeout so the pending state always clears.
 *
 * Static, secret-free, no-DB. Runs in CI via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("P0.1 request delivery: communication is a reachable primary-nav surface", () => {
  it("communication is an ACTIVE feature routed to the inbox", () => {
    const f = FEATURES.find((x) => x.key === "communication");
    expect(f, "communication feature must exist").toBeTruthy();
    expect(f?.availability).toBe("active");
    expect(f?.safeToShowInPrimaryNav).toBe(true);
    expect(f?.primaryRoute).toBe("/dashboard/communication");
  });

  it("communication appears in the derived primary nav", () => {
    const item = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === "communication");
    expect(item, "communication must be a visible primary nav item").toBeTruthy();
    expect(item?.href).toBe("/dashboard/communication");
  });

  it("the communication route exists", () => {
    expect(() => read("app/[locale]/dashboard/communication/page.tsx")).not.toThrow();
  });

  it("both nav surfaces render an unread badge (desktop tabs + mobile bottom-nav)", () => {
    const tabs = read("components/app/dashboard-tabs.tsx");
    const bottom = read("components/app/bottom-nav.tsx");
    expect(tabs).toMatch(/badges\?:/);
    expect(tabs).toMatch(/dashboard-tab-badge-/);
    expect(bottom).toMatch(/badges\?:/);
    expect(bottom).toMatch(/bottom-nav-badge-/);
  });

  it("the dashboard layout feeds a REAL unread count into the badges", () => {
    // The unread fetch moved into the notification spine (quality-train
    // PR B) — the layout consumes the spine, the spine reads the one real
    // unread helper, and the badge chain stays unbroken.
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(/getSpineCounts\(\)/);
    expect(layout).toMatch(/badges=\{navBadges\}/);
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(/getUnreadConversationCount/);
    expect(spine).toMatch(/communication: counts\.unreadConversations/);
  });

  it("the unread count is a real query (counterpart messages vs last_read — audit PR5)", () => {
    const src = read("lib/communication/unread.ts");
    expect(src).toMatch(/conversation_participants/);
    expect(src).toMatch(/last_read_at/);
    // Real semantics: someone ELSE's message newer than the caller's
    // last_read_at — not just never-opened threads.
    expect(src).toMatch(/neq\("author_id", user\.id\)/);
    expect(src).toMatch(/Date\.parse\(m\.created_at\) > Date\.parse\(lastRead\)/);
  });
});

describe("P0.2 work-order submit: honest error instead of a generic 'try again'", () => {
  const action = read("lib/demand/demand-request.ts");

  it("classifies a missing RPC / table / column as needs_migration", () => {
    expect(action).toMatch(/needs_migration/);
    // 42883 undefined_function, PGRST202 fn-not-in-cache, 42P01 undefined_table,
    // 42703 undefined_column — these must not collapse into save_failed.
    expect(action).toMatch(/42883/);
    expect(action).toMatch(/PGRST202/);
    expect(action).toMatch(/42P01/);
    expect(action).toMatch(/classifyDbError/);
  });

  it("logs the error code (not just the message) for prod diagnosis", () => {
    expect(action).toMatch(/error\.code/);
  });

  it("the submit button surfaces the needs_migration state to the user", () => {
    const btn = read("components/app/demand-request-button.tsx");
    expect(btn).toMatch(/needsMigration/);
    expect(btn).toMatch(/demand-needs-migration/);
  });
});

describe("P0.3 mobile skills save: pending cannot hang forever", () => {
  it("the profile text-first save is bounded by withTimeout", () => {
    const flow = read("components/app/profile-text-first-flow.tsx");
    expect(flow).toMatch(/withTimeout\(\s*saveWorkerProfileText/);
  });

  it("withTimeout rejects after a ceiling so the caller's catch always runs", () => {
    const util = read("lib/async/with-timeout.ts");
    expect(util).toMatch(/Promise\.race/);
    expect(util).toMatch(/setTimeout/);
    expect(util).toMatch(/clearTimeout/);
    expect(util).toMatch(/SAVE_TIMEOUT_MS/);
  });
});
