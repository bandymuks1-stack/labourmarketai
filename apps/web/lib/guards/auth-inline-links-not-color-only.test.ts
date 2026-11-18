import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The "already have an account? Sign in" / "no account? Sign up" links are
 * marked as links by more than colour.
 *
 * Measured with axe at 390 px in all six active locales: on /auth/signup the
 * gold sign-in link sat inside muted text at 1.29:1 against it (WCAG 1.4.1
 * needs 3:1 or a non-colour cue), so the first page of the worker path had a
 * serious violation in every language. Both auth forms now underline the
 * in-sentence link.
 */

const ROOT = resolve(__dirname, "../..");

function linkClass(file: string, marker: string): string {
  const src = readFileSync(resolve(ROOT, file), "utf8").replace(/\r\n/g, "\n");
  // The in-sentence link is the one whose label is not followed by an arrow
  // (the "… →" ones are standalone links, not text inside a sentence).
  const at = src.indexOf(`${marker}\n`);
  expect(at, `${file} renders ${marker}`).toBeGreaterThan(-1);
  const open = src.lastIndexOf("<Link", at);
  const tag = src.slice(open, at);
  const cls = /className="([^"]*)"/.exec(tag);
  expect(cls, `${file} link has a className`).not.toBeNull();
  return cls![1]!;
}

describe("auth forms — in-sentence links are not colour-only", () => {
  it("signup: the sign-in link is underlined", () => {
    expect(linkClass("components/app/signup-form.tsx", '{t("login_link")}')).toMatch(/\bunderline\b/);
  });

  it("login: the sign-up link is underlined", () => {
    expect(linkClass("components/app/login-form.tsx", '{t("signup_link")}')).toMatch(/\bunderline\b/);
  });
});
