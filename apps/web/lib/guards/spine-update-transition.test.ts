import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — the streamed spine never forces a page boundary into client rendering.
 *
 * SpineStream resolves the bell and badges after first paint and pushes them
 * into the auth context. Pages hold context consumers (forms read the
 * displayed workspace through useAuthOptional), so an URGENT update that lands
 * while the page is still streaming makes React client-render the page's
 * boundary and leave the late server HTML behind as a hidden duplicate
 * (`div#S:n[hidden]`, role-journeys J-DEC, #3487). The update must be a
 * transition. The J-DEC walk checks that no hidden segment is left.
 *
 * A transition is not enough on its own (#3539, ST-1). React 19.2 queues a
 * streamed segment for up to ~300 ms before revealing it (`$RC` marks the
 * boundary `$~`), and a context change that reaches a boundary in that state
 * client-renders it even inside a transition: the page then exists twice for
 * that window. So the spine is kept OUT of the context value: the context
 * holds a store that never changes, and readers subscribe to it through
 * `useSyncExternalStore`, which re-renders only mounted readers. ST-1 and
 * E-3 (signup-isolated) check one copy after a reload.
 */
const WEB = resolve(__dirname, "../..");
const hydrator = readFileSync(resolve(WEB, "components/app/spine-hydrator.tsx"), "utf8");
const context = readFileSync(resolve(WEB, "lib/auth/context.tsx"), "utf8");
/** The provider's memoized context value, up to the Provider element. */
const providerValue = context.slice(
  context.indexOf("useMemo<AuthContextBase>("),
  context.indexOf("return <AuthContext.Provider"),
);

describe("the streamed spine is applied as a transition", () => {
  it("SpineHydrator wraps applySpine in startTransition", () => {
    expect(hydrator).toMatch(/import \{ startTransition, useEffect \} from "react";/);
    expect(hydrator).toMatch(/startTransition\(\(\) => \{\s*applySpine\(notifications, badges\);\s*\}\);/);
  });

  it("nothing calls applySpine outside that transition", () => {
    const calls = hydrator.match(/applySpine\(/g) ?? [];
    expect(calls.length).toBe(1);
  });
});

describe("a spine update never changes the auth context value (#3539)", () => {
  it("the provider keeps the spine in a store, not in React state", () => {
    expect(context).toMatch(/const \[spine\] = useState\(\(\) =>\s*createSpineStore\(/);
    expect(context).not.toMatch(/setNotifications|setBadges/);
  });

  it("the context value carries the store and no spine data", () => {
    expect(providerValue.length).toBeGreaterThan(0);
    expect(providerValue).toMatch(/\bspine,/);
    expect(providerValue).not.toMatch(/\bnotifications\b|\bbadges\b/);
  });

  it("readers subscribe through useSyncExternalStore, hydrating with the server snapshot", () => {
    expect(context).toMatch(/useSyncExternalStore\(store\.subscribe, store\.get, store\.getInitial\)/);
    expect(context).toMatch(
      /export function useAuth\(\): AuthContextValue \{\s*const v = useWithSpine\(useContext\(AuthContext\)\);/,
    );
    expect(context).toMatch(
      /export function useAuthOptional\(\): AuthContextValue \| null \{\s*return useWithSpine\(useContext\(AuthContext\)\);/,
    );
  });
});
