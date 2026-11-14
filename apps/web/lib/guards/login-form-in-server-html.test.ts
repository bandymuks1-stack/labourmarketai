import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Speed P0 (2026-11-12). The login page arrived with NO form in its HTML: the
 * form called `useSearchParams()`, which makes Next leave a component out of a
 * prerendered page. Mobile lab: the form painted at 6.9 s and pushed the
 * consent banner down (layout shift 0.154). After: 2.2 s and 0.
 */
describe("the login form is part of the server HTML", () => {
  const root = join(__dirname, "..", "..");
  const form = readFileSync(join(root, "components", "app", "login-form.tsx"), "utf8");
  const page = readFileSync(join(root, "app", "[locale]", "auth", "login", "page.tsx"), "utf8");
  const hook = readFileSync(join(root, "lib", "auth", "use-url-query.ts"), "utf8");

  it("the form does not call useSearchParams()", () => {
    expect(form).not.toMatch(/import \{[^}]*useSearchParams[^}]*\} from "next\/navigation"/);
    expect(form).toContain("const searchParams = useUrlQuery();");
  });

  it("the page renders the form directly, with no empty Suspense fallback", () => {
    expect(page).not.toContain("fallback={null}");
    expect(page).toContain("<LoginForm");
  });

  it("the query hook gives the server and the first client render an empty query", () => {
    expect(hook).toContain("useSyncExternalStore(subscribe, readClient, readServer)");
    expect(hook).toContain('const readServer = (): string => "";');
  });

  it("the return path still goes through the open-redirect check", () => {
    expect(form).toContain("getSafeReturnPath(nextParam, locale)");
  });
});
