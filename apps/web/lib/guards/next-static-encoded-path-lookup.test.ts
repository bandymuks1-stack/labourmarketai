/**
 * Guard — a static file is served under EVERY percent-encoding of its path.
 *
 * Production defect, 2026-11-12 (build 875759b2): the marketing layout chunk
 *   /_next/static/chunks/app/%5Blocale%5D/(marketing)/layout-<hash>.js   → 200
 *   /_next/static/chunks/app/%5Blocale%5D/%28marketing%29/layout-<hash>.js → 404
 * A browser behind a URL-normalising proxy (a corporate security gateway)
 * requests the second spelling, the chunk fails to load, and the whole home
 * page becomes the global error screen.
 *
 * Root cause, in Next 15.5.24 `server/lib/router-utils/filesystem.js`: items are
 * registered with `encodeURIComponent` per segment, which leaves `( ) ! ' * ~`
 * as they are. The lookup tries the path as requested, then the decoded path,
 * then `encodeURIPath(curItemPath)` — the path AS REQUESTED, encoded once more
 * (`%28` → `%2528`), never the decoded path encoded the way items are stored.
 * So `[locale]/(marketing)` and `%5Blocale%5D/(marketing)` resolve, and a path
 * with encoded parentheses does not.
 *
 * `patches/next@15.5.24.patch` adds one more attempt: encode the DECODED path.
 * nginx forwards the request URI untouched (ops/vps/labourmarket.ai.nginx.conf,
 * `proxy_pass` without a URI), so the fix belongs in the server that answers,
 * and it ships with the normal release — no VPS step.
 *
 * This guard fails if a Next upgrade (or a lost patch) drops the attempt. The
 * live proof is `.github/workflows/reachability-probe.yml`, which requests the
 * fully encoded spelling of every route-group chunk in production.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
const NEXT_DIR = dirname(require_.resolve("next/package.json"));

/** The standalone server runs the CJS copy; the ESM twin is patched to match. */
const COPIES = [
  ["cjs", join(NEXT_DIR, "dist", "server", "lib", "router-utils", "filesystem.js"), "(0, _encodeuripath.encodeURIPath)"],
  ["esm", join(NEXT_DIR, "dist", "esm", "server", "lib", "router-utils", "filesystem.js"), "encodeURIPath"],
] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("Next resolves a static file under every encoding of its path (patches/next@*.patch)", () => {
  for (const [kind, file, encode] of COPIES) {
    it(`${kind}: the decoded path is re-encoded and looked up`, () => {
      const src = readFileSync(file, "utf8").replace(/\s+/g, " ");
      const attempt = new RegExp(
        `if \\(!matchedItem && curDecodedItemPath !== curItemPath\\) \\{ matchedItem = items\\.has\\(${escape(encode)}\\(curDecodedItemPath\\)\\); if \\(matchedItem\\) curItemPath = curDecodedItemPath; \\}`,
      );
      expect(src, `${kind}: the decoded-path lookup is missing — patch lost or Next upgraded`).toMatch(attempt);
    });
  }

  it("the reason holds: items keep parentheses, and encoding a requested %28 never finds them", () => {
    const encodeURIPath = (p: string) => p.split("/").map((s) => encodeURIComponent(s)).join("/");
    const stored = encodeURIPath("/_next/static/chunks/app/[locale]/(marketing)/layout-a.js");
    expect(stored).toBe("/_next/static/chunks/app/%5Blocale%5D/(marketing)/layout-a.js");
    const requested = "/_next/static/chunks/app/%5Blocale%5D/%28marketing%29/layout-a.js";
    expect(encodeURIPath(requested)).not.toBe(stored); // what Next tries on its own
    expect(encodeURIPath(decodeURIComponent(requested))).toBe(stored); // what the patch adds
  });
});
