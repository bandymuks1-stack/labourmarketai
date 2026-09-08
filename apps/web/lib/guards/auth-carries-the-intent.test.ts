import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  entryDoorHref,
  sentenceFromReturnPath,
} from "@/lib/marketing/public-entry";
import { AUTH_CLIENT_MESSAGE_ROOTS } from "@/lib/i18n/client-messages";

/**
 * THE REQUEST SURVIVES THE DOOR, AND THE PERSON CAN SEE THAT IT DID
 * (owner window 11 §21).
 *
 * The mechanism already existed: the landing puts the visitor's sentence in
 * `?next=/dashboard?say=…` and the existing return-path resolves it after
 * auth. What the owner's production walk found is the other half — the login
 * screen showed a headline, a Google button and two fields, and said nothing
 * about the request that had brought them there. A request you cannot see is
 * a request you assume was lost.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

describe("the sentence survives the round trip", () => {
  it("comes back out of the value the door put it in", () => {
    const href = entryDoorHref("lt", "login", "Ieškau brigados objektui");
    const next = decodeURIComponent(new URL(href, "https://x").searchParams.get("next")!);
    expect(sentenceFromReturnPath(next)).toBe("Ieškau brigados objektui");
  });

  it("yields nothing — never throws — for every shape that carries no sentence", () => {
    for (const value of [
      null,
      undefined,
      "",
      "/dashboard",
      "/dashboard?other=1",
      "?say=",
      "%%%",
    ]) {
      expect(sentenceFromReturnPath(value as string | null)).toBeNull();
    }
  });

  it("a broken percent-escape decodes to inert text instead of throwing", () => {
    // `URLSearchParams` is lenient: a truncated escape becomes U+FFFD rather
    // than an exception. That is acceptable BECAUSE the value is only ever
    // rendered as text inside a <p> — it never reaches a URL, a request or
    // markup. What must not happen is a throw on the login page.
    const out = sentenceFromReturnPath("/dashboard?say=%E0%A4%A");
    expect(typeof out === "string" || out === null).toBe(true);
    expect((out ?? "").length).toBeLessThanOrEqual(200);
  });

  it("is capped exactly like the outbound half", () => {
    const long = "a".repeat(500);
    const out = sentenceFromReturnPath(`/dashboard?say=${encodeURIComponent(long)}`);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(200);
  });
});

describe("both auth doors show the carried request", () => {
  for (const form of ["components/app/login-form.tsx", "components/app/signup-form.tsx"]) {
    it(`${form} renders it from the SAME \`next\` it already reads`, () => {
      const src = read(form);
      expect(src).toMatch(/<AuthCarriedIntent next=\{nextParam\} \/>/);
      expect(src).toMatch(/from "@\/components\/app\/auth-carried-intent"/);
    });
  }

  it("renders nothing when there is no sentence — most sign-ins carry none", () => {
    const src = read("components/app/auth-carried-intent.tsx");
    expect(src).toMatch(/if \(!sentence\) return null;/);
  });
});

describe("the copy lives where the auth pages can actually read it", () => {
  /**
   * THE TRAP THIS PINS. The auth layout ships a deliberately narrow client
   * message pick (~28 KB instead of the ~300 KB union). A component on an
   * auth page reading a namespace outside that pick renders THE KEY ITSELF —
   * next-intl resolves a missing key to its own name, and that has reached
   * production before. The first draft of this component read
   * `landing.entry.*`, which is exactly outside the pick.
   */
  it("the namespace it reads is inside the auth client pick", () => {
    const src = read("components/app/auth-carried-intent.tsx");
    const ns = src.match(/useTranslations\("([^"]+)"\)/)?.[1];
    expect(ns).toBeTruthy();
    const root = ns!.split(".")[0];
    expect(
      AUTH_CLIENT_MESSAGE_ROOTS as readonly string[],
      `"${root}" is not shipped to auth pages — the label would render as its own key`,
    ).toContain(root);
  });

  for (const loc of ACTIVE) {
    it(`[${loc}] both strings exist and are real copy`, () => {
      const doc = JSON.parse(read(`messages/${loc}.json`)) as {
        auth: { carriedIntent?: { label?: string; hint?: string } };
      };
      const v = doc.auth.carriedIntent ?? {};
      expect(v.label, `${loc}: auth.carriedIntent.label`).toBeTypeOf("string");
      expect(v.hint, `${loc}: auth.carriedIntent.hint`).toBeTypeOf("string");
      expect((v.label ?? "").trim().length).toBeGreaterThan(2);
      expect((v.hint ?? "").trim().length).toBeGreaterThan(20);
      expect(v.hint ?? "").not.toContain("[EN]");
    });
  }
});
