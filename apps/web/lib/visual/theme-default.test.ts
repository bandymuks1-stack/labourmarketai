import { describe, expect, it } from "vitest";

import { THEME_BOOTSTRAP_SCRIPT, defaultThemeForPath, resolveTheme } from "./theme-default";

/** Runs the real inline bootstrap against a fake page and storage. */
function bootstrap(pathname: string, stored: string | null, storageThrows = false): string | undefined {
  const dataset: Record<string, string> = {};
  const fakeStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("blocked");
      return k === "theme" ? stored : null;
    },
  };
  new Function("location", "localStorage", "document", THEME_BOOTSTRAP_SCRIPT)(
    { pathname },
    fakeStorage,
    { documentElement: { dataset } },
  );
  return dataset.theme;
}

describe("the page's default theme (owner decision 2026-10-28)", () => {
  it("the public site opens light", () => {
    for (const p of ["/lt", "/lt/", "/en/jobs", "/lt/jobs/123", "/lt/pricing", "/lt/legal/terms", "/lt/auth/signup", "/lt/auth/login", "/lt/invite/abc", "/ru/business/x"]) {
      expect(defaultThemeForPath(p), p).toBe("light");
    }
  });
  it("the signed-in workspace keeps its dark default", () => {
    for (const p of ["/lt/dashboard", "/lt/dashboard/journal", "/en/onboarding", "/lt/cv", "/lt/cv/print"]) {
      expect(defaultThemeForPath(p), p).toBe("dark");
    }
  });
  it("a look-alike public path is not the workspace", () => {
    expect(defaultThemeForPath("/lt/dashboarding")).toBe("light");
    expect(defaultThemeForPath("/lt/cvs")).toBe("light");
  });
  it("a saved choice always wins, on every page", () => {
    expect(resolveTheme("dark", "/lt")).toBe("dark");
    expect(resolveTheme("light", "/lt/dashboard")).toBe("light");
    expect(resolveTheme("bogus", "/lt")).toBe("light");
    expect(resolveTheme(null, "/lt/dashboard")).toBe("dark");
  });
});

describe("the pre-paint bootstrap runs the same rule", () => {
  it("no choice: public light, workspace dark", () => {
    expect(bootstrap("/lt", null)).toBe("light");
    expect(bootstrap("/lt/dashboard", null)).toBe("dark");
  });
  it("a saved choice wins", () => {
    expect(bootstrap("/lt", "dark")).toBe("dark");
    expect(bootstrap("/lt/dashboard", "light")).toBe("light");
  });
  it("storage blocked: the page's default, never undefined", () => {
    expect(bootstrap("/lt/auth/signup", null, true)).toBe("light");
    expect(bootstrap("/lt/onboarding", null, true)).toBe("dark");
  });
});

describe("client-side navigation re-resolves the default (review on #2849)", () => {
  it("ThemeReapply re-runs on every pathname change, so workspace -> public opens light", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "..", "components", "app", "theme-reapply.tsx"), "utf8");
    expect(src).toMatch(/const pathname = usePathname\(\);/);
    expect(src).toMatch(/\}, \[pathname\]\);/);
    expect(src).toMatch(/resolveTheme\(localStorage\.getItem\("theme"\), window\.location\.pathname\)/);
  });
});
