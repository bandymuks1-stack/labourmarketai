import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contact-open failure honesty guard (Core Product Sprint Train v2, Wagon 4 —
 * contact permission + counterpart identity).
 *
 * Owner directive: communication must be honest — if contact is not allowed,
 * show a restricted state; never a fake thread, never a fake "sent". The
 * "message worker / message company" entry points run a server action that may
 * legitimately fail (no permission, target gone, RLS-blocked). It must surface
 * that honestly, not silently bounce the user with an unread `?error=` param
 * that no page reads.
 *
 * This guard locks the honest failure path:
 *   1. the action sends failures to the messages list with `?notice=cannot_open`
 *      and never invents a conversation on failure;
 *   2. the action never resurrects the old silent `?error=messaging` bounce;
 *   3. the messages list reads that notice and renders a locked, system-limited
 *      restricted state (not a normal banner, not a fake-success toast);
 *   4. the copy exists in every served locale and states nothing was sent.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const SERVED = ["lt", "en", "ru"] as const;

const ACTION = "lib/communication/open-conversation-action.ts";
const LIST = "app/[locale]/dashboard/communication/page.tsx";

describe("the message-open action fails to an honest restricted notice", () => {
  const action = read(ACTION);

  it("routes failures to the messages list with ?notice=cannot_open", () => {
    expect(action).toMatch(/dashboard\/communication\?notice=cannot_open/);
    // Both failure branches (no target profile + open failed) use it.
    expect(action).toMatch(/if \(!profileId\) redirect\(cannotOpen\)/);
    expect(action).toMatch(/if \(!result\.ok\) redirect\(cannotOpen\)/);
  });

  it("no longer silently bounces with the unread ?error=messaging param", () => {
    expect(action).not.toMatch(/error=messaging/);
  });

  it("only redirects to a real conversation on a successful open (no fake thread)", () => {
    // The /communication/<id> redirect is reached solely from result.data.id.
    expect(action).toMatch(/redirect\(`\/\$\{locale\}\/dashboard\/communication\/\$\{result\.data\.id\}`\)/);
  });
});

describe("the messages list renders the failure as a locked restricted state", () => {
  const list = read(LIST);

  it("reads the notice from searchParams", () => {
    expect(list).toMatch(/searchParams/);
    expect(list).toMatch(/notice === "cannot_open"/);
  });

  it("renders a locked, system-limited treatment keyed off that flag", () => {
    expect(list).toMatch(/showCannotOpen &&/);
    expect(list).toMatch(/data-testid="communication-cannot-open"/);
    expect(list).toMatch(/<Lock\b/);
    expect(list).toMatch(/t\("cannotOpen\.title"\)/);
    expect(list).toMatch(/t\("cannotOpen\.body"\)/);
  });
});

describe("honest copy exists in every served locale and says nothing was sent", () => {
  for (const loc of SERVED) {
    it(`${loc}: communication.cannotOpen.title + .body are present and non-empty`, () => {
      const c = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          communication?: { cannotOpen?: Record<string, string> };
        }
      ).communication?.cannotOpen;
      expect(c?.title?.trim().length, `${loc} cannotOpen.title`).toBeGreaterThan(0);
      expect(c?.body?.trim().length, `${loc} cannotOpen.body`).toBeGreaterThan(0);
    });
  }

  it("the body never implies a message was delivered/sent (no fake success)", () => {
    // Each served locale must state, in its own words, that nothing was sent.
    const sentNothing: Record<(typeof SERVED)[number], RegExp> = {
      en: /nothing was sent/i,
      lt: /niekas neišsiųsta/i,
      ru: /ничего не отправлено/i,
    };
    for (const loc of SERVED) {
      const body = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          communication?: { cannotOpen?: { body?: string } };
        }
      ).communication?.cannotOpen?.body ?? "";
      expect(body, `${loc} must state nothing was sent`).toMatch(sentNothing[loc]);
    }
  });
});
