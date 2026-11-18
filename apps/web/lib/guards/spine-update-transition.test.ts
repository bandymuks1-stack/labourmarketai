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
 */
const WEB = resolve(__dirname, "../..");
const hydrator = readFileSync(resolve(WEB, "components/app/spine-hydrator.tsx"), "utf8");

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
