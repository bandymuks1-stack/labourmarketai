import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * Entry-shortcut redirects guard (public audit 2026-10-10).
 *
 * `/:locale/signup` with an UNCONSTRAINED `:locale` also matched the bare
 * `/auth/signup` (locale = "auth") and sent it to `/auth/auth/signup` → 404.
 * Bare auth URLs reach people through e-mails, OAuth consoles and old links,
 * so every `/:locale/...` shortcut must constrain `:locale` to the routed
 * locales. Asserts the REAL config object, not a copy.
 */

type Redirect = { source: string; destination: string; permanent: boolean };

async function loadRedirects(): Promise<Redirect[]> {
  const mod = (await import("../../next.config")) as {
    default: { redirects?: () => Promise<Redirect[]> };
  };
  return (await mod.default.redirects?.()) ?? [];
}

/** The same semantics Next applies to `:locale(a|b)` — a single path segment from the list. */
function matches(source: string, path: string): boolean {
  const pattern = source
    .replace(/:locale\(([^)]+)\)/g, "($1)")
    .replace(/:locale\b/g, "([^/]+)");
  return new RegExp(`^${pattern}$`).test(path);
}

describe("entry shortcut redirects", () => {
  it("every /:locale shortcut constrains the locale to the routed locales", async () => {
    const shortcuts = (await loadRedirects()).filter(
      (r) => r.source.startsWith("/:locale") && !r.source.includes("/dashboard"),
    );
    expect(shortcuts.length).toBeGreaterThan(0);
    for (const r of shortcuts) {
      expect(r.source, r.source).toContain(`:locale(${activeLocales.join("|")})`);
    }
  });

  it("bare /auth/* paths are never rewritten into /auth/auth/*", async () => {
    const redirects = await loadRedirects();
    for (const path of ["/auth/signup", "/auth/login", "/auth/register"]) {
      expect(redirects.filter((r) => matches(r.source, path)).map((r) => r.source), path).toEqual([]);
    }
  });

  it("localized short forms and legal aliases still redirect", async () => {
    const redirects = await loadRedirects();
    for (const path of ["/lt/signup", "/en/login", "/de/register", "/lt/privacy", "/pl/terms"]) {
      expect(redirects.some((r) => matches(r.source, path)), path).toBe(true);
    }
  });
});
