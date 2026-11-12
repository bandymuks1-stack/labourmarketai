import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMUNICATION_ERROR_CODES, communicationErrorKey } from "@/lib/communication/error-copy";

/**
 * A failed send showed the server's Lithuanian developer message verbatim
 * ("Žinutė tuščia ...") to an English, Swedish or German person (Swedish
 * employer audit 2026-11-11, N-3). The composers now render the catalogue line
 * for the result CODE, in the person's language. These pins fail if a composer
 * goes back to rendering the server's text, or a code loses its line.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");
const ALL = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];
const COMPOSERS = [
  ["components", "app", "communication-composer.tsx"],
  ["components", "app", "conversation-quick-reply.tsx"],
  ["components", "app", "conversation", "chat-message-reply.tsx"],
];

describe("messaging errors read in the person's language", () => {
  it("no composer renders the server's message text", () => {
    for (const p of COMPOSERS) {
      const src = read(...p);
      expect(src, p.join("/")).not.toMatch(/setError\((result|res)\.message\)/);
      expect(src, p.join("/")).toContain("communicationErrorKey(");
    }
  });

  it("every code, and the fallback, has a line in all 11 catalogs", () => {
    for (const l of ALL) {
      const errors = JSON.parse(read("messages", `${l}.json`)).communication?.errors ?? {};
      for (const k of [...COMMUNICATION_ERROR_CODES, "generic"]) expect(errors[k], `${l} ${k}`).toBeTruthy();
    }
  });

  it("an unknown code reads as the generic line", () => {
    expect(communicationErrorKey("not_a_participant")).toBe("not_a_participant");
    expect(communicationErrorKey("something_new")).toBe("generic");
    expect(communicationErrorKey(undefined)).toBe("generic");
  });

  it("the English line is English", () => {
    const errors = JSON.parse(read("messages", "en.json")).communication.errors as Record<string, string>;
    for (const v of Object.values(errors)) expect(v).not.toMatch(/[ąčęėįšųūž]/i);
  });
});
