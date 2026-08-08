import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 6 — messaging entry point wiring/honesty guard.
 *
 * Reuses the existing 0021 communication backend (conversations /
 * conversation_participants / conversation_messages) + its RLS. Entry points:
 * company → worker ("Rašyti darbuotojui") and worker → company ("Rašyti
 * įmonei"). Conversations are deduped (no duplicate direct threads), and the
 * button never renders without a resolved target (no dead button, no fake msg).
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("direct conversation helper — dedupe via existing backend", () => {
  const src = read("lib/communication/direct-conversation.ts");
  it("dedupes against existing direct conversations before creating", () => {
    expect(src).toMatch(/conversation_participants/);
    expect(src).toMatch(/kind", "direct"|kind",\s*"direct"/);
    expect(src).toMatch(/createConversation/);
  });
  it("never creates a conversation with self", () => {
    expect(src).toMatch(/otherProfileId === user\.id/);
  });
  it("creates no new table/policy (reuses 0021 tables only)", () => {
    expect(src).not.toMatch(/create table|create policy/i);
  });
});

describe("entry points wired into both directions", () => {
  it("company → worker button on the worker row", () => {
    const sec = read("components/app/company-workers-section.tsx");
    expect(sec).toMatch(/MessageButton/);
    expect(sec).toMatch(/labelKey="messageWorker"/);
    expect(sec).toMatch(/profileId=\{w\.profileId\}/);
  });
  // W7-S4: this entry point moved from `/dashboard/profile` to
  // `/dashboard/network`. The assertion's INTENT is unchanged — the
  // worker→company direction exists, exactly once, and only when a real
  // employer resolves. Only the page it is asserted against changed.
  // (Not the communication pages: `message-counterpart-restricted.test.ts`
  // bans contact buttons there, and that P0 guard stands.)
  it("worker → company button on the network page, only when employer resolves", () => {
    const page = read("app/[locale]/dashboard/network/page.tsx");
    expect(page).toMatch(/labelKey="messageCompany"/);
    expect(page).toMatch(/employerOwnerProfileId &&/);
    expect(page).toMatch(/getEmployerOwnerProfileId/);
  });

  it("the profile no longer carries a second copy of the same entry point", () => {
    // Comment-free: the profile still explains where the button went, and
    // that note names it.
    const profile = read("app/[locale]/dashboard/profile/page.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(profile).not.toMatch(/<MessageButton/);
    expect(profile).not.toMatch(/getEmployerOwnerProfileId\(/);
  });
  it("button renders nothing without a resolved profile (no dead button)", () => {
    const btn = read("components/app/message-button.tsx");
    expect(btn).toMatch(/if \(!profileId\) return null/);
  });
});

describe("messaging i18n", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale} messaging keys exist`, () => {
      const ns = (JSON.parse(read(`messages/${locale}.json`)) as {
        messaging?: Record<string, string>;
      }).messaging ?? {};
      expect(ns.messageWorker, `${locale} messaging.messageWorker`).toBeTruthy();
      expect(ns.messageCompany, `${locale} messaging.messageCompany`).toBeTruthy();
    });
  }
});
