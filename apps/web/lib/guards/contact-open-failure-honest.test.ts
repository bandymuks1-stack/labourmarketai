import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { locales as CANONICAL_LOCALES } from "@/lib/i18n/config";

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
 *   4. the copy exists in EVERY canonical locale (doctrine §2.4 — new i18n keys
 *      land in all 11 in the same PR) and states nothing was sent.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** The full canonical locale set (§2.4). Imported from config so this guard
 *  tracks the set automatically — a new locale added there with no cannotOpen
 *  copy (or no "nothing was sent" phrase below) fails this guard. */
const CANONICAL = CANONICAL_LOCALES;

/** Per-locale phrase that asserts nothing was sent — the no-fake-success
 *  guarantee, checked in each locale's own words. Every canonical locale MUST
 *  have an entry; a missing one fails the parity test below. */
const NOTHING_SENT: Record<string, RegExp> = {
  en: /nothing was sent/i,
  lt: /niekas neišsiųsta/i,
  ru: /ничего не отправлено/i,
  lv: /nekas netika nosūtīts/i,
  et: /midagi ei saadetud/i,
  nl: /er is niets verzonden/i,
  de: /es wurde nichts gesendet/i,
  da: /der blev ikke sendt noget/i,
  no: /ingenting ble sendt/i,
  sv: /inget skickades/i,
  pl: /nic nie zostało wysłane/i,
};

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

describe("honest copy exists in EVERY canonical locale and says nothing was sent", () => {
  it("covers the full canonical set (11 locales, §2.4) — no missing locale", () => {
    // If config grows/shrinks, this is the single line that flags it.
    expect(CANONICAL.length).toBeGreaterThanOrEqual(11);
  });

  for (const loc of CANONICAL) {
    it(`${loc}: communication.cannotOpen.title + .body are present and non-empty`, () => {
      const c = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          communication?: { cannotOpen?: Record<string, string> };
        }
      ).communication?.cannotOpen;
      expect(c?.title?.trim().length, `${loc} cannotOpen.title`).toBeGreaterThan(0);
      expect(c?.body?.trim().length, `${loc} cannotOpen.body`).toBeGreaterThan(0);
    });

    it(`${loc}: body states nothing was sent (no fake success)`, () => {
      const phrase = NOTHING_SENT[loc];
      // Force a phrase to exist for every canonical locale — a new locale with
      // no entry here fails loudly rather than silently skipping the check.
      expect(phrase, `no NOTHING_SENT phrase for locale ${loc}`).toBeTruthy();
      const body = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          communication?: { cannotOpen?: { body?: string } };
        }
      ).communication?.cannotOpen?.body ?? "";
      expect(body, `${loc} must state nothing was sent`).toMatch(phrase);
    });
  }
});
