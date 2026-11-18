import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import { COMPOSER_ERROR_KEY_SET, composerErrorKey } from "./composer-error-key";

/**
 * Chat audit 2026-11-11, defect 6: a failed send showed the server's message
 * text — Lithuanian for every reader, and for some failures the raw database
 * error. The composer now renders `communication.composer.errors.<key>` from
 * the failure CODE, and the server keeps database text in its log only.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("composer send errors", () => {
  it("every failure code maps to a key; unknown codes get the generic one", () => {
    expect(composerErrorKey("rate_limited")).toBe("rateLimited");
    expect(composerErrorKey("not_a_participant")).toBe("notParticipant");
    expect(composerErrorKey("insert_failed")).toBe("sendFailed");
    expect(composerErrorKey("something_new")).toBe("sendFailed");
    expect(composerErrorKey(undefined)).toBe("sendFailed");
  });

  it.each(activeLocales)("%s has copy for every key", (locale) => {
    const m = JSON.parse(read(`messages/${locale}.json`)) as {
      communication?: { composer?: { errors?: Record<string, string> } };
    };
    for (const key of COMPOSER_ERROR_KEY_SET) {
      expect(m.communication?.composer?.errors?.[key]?.trim(), `${locale}: ${key}`).toBeTruthy();
    }
  });

  it("the composer renders the translated key, never the server's message text", () => {
    const src = read("components/app/communication-composer.tsx");
    expect(src).toContain("composer.errors.${composerErrorKey(result.code)}");
    expect(src).not.toMatch(/setError\(result\.message\)/);
  });

  it("the server never puts database error text into a user-facing message", () => {
    const core = read("lib/communication/communication-core.ts");
    expect(core).not.toMatch(/message:\s*`[^`]*\$\{[^}]*(error|msg)[^}]*\}/);
  });
});
