import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMPOSER_ERROR_KEY_SET } from "@/lib/communication/composer-error-key";

/**
 * A failed send showed the server's Lithuanian developer message verbatim to
 * an English, Swedish or German person (Swedish employer audit 2026-11-11,
 * N-3). The main composer already reads the line for the result CODE in the
 * person's language (`composerErrorKey`, #3229); the two reply boxes must use
 * that SAME key system and catalogue, never a second one and never the
 * server's text. These pins fail if a reply box goes back to `res.message` or
 * grows its own error catalogue.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");
const ACTIVE = ["de", "en", "lt", "nl", "pl", "ru"];
const COMPOSERS = [
  ["components", "app", "communication-composer.tsx"],
  ["components", "app", "conversation-quick-reply.tsx"],
  ["components", "app", "conversation", "chat-message-reply.tsx"],
];

describe("messaging errors read in the person's language, from one key system", () => {
  it("no composer or reply box renders the server's message text", () => {
    for (const p of COMPOSERS) {
      const src = read(...p);
      expect(src, p.join("/")).not.toMatch(/setError\((result|res)\.message\)/);
      expect(src, p.join("/")).toContain("composerErrorKey(");
    }
  });

  it("the reply boxes read the composer's own catalogue", () => {
    for (const p of COMPOSERS.slice(1)) {
      expect(read(...p), p.join("/")).toContain('useTranslations("communication.composer.errors")');
    }
  });

  it("there is no second messaging error catalogue", () => {
    for (const l of ACTIVE) {
      expect(JSON.parse(read("messages", `${l}.json`)).communication.errors, l).toBeUndefined();
    }
  });

  it("every key has a line in every active catalog", () => {
    for (const l of ACTIVE) {
      const errors = JSON.parse(read("messages", `${l}.json`)).communication.composer.errors as Record<string, string>;
      for (const k of COMPOSER_ERROR_KEY_SET) expect(errors[k], `${l} ${k}`).toBeTruthy();
    }
  });
});
