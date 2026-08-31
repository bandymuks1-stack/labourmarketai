import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * THE LANDING, AS THE BROWSER SEES IT — page.tsx plus everything it renders.
 *
 * WHY THIS EXISTS. Four guards asserted things about the landing by grepping
 * `app/[locale]/page.tsx` for a literal string. That worked while
 * the page was one long file. When the landing was recomposed into
 * `<HeroLiveDemo>`, `<FinalCtaBand>` and friends, every one of those guards went
 * red — not because a CTA had been removed, but because it had moved one file
 * down. Four red guards that mean "the file changed shape" teach the team to
 * ignore them, and an ignored guard protects nothing.
 *
 * Reading the COMPOSED tree fixes the false negative and makes the guard
 * STRONGER at the same time: `href="/company-need"` now has to exist somewhere
 * the landing actually renders, and it keeps having to exist no matter how the
 * page is later split up. A genuinely deleted CTA still fails.
 *
 * DELIBERATELY CRUDE. This is a static import walk, not a bundler: it follows
 * `@/components/...` and relative imports from the landing page, and stops
 * there. It cannot prove a component is reachable at runtime — only that it is
 * in the tree. That is exactly the strength the previous form had, applied to
 * the right set of files.
 */

/** Every `@/…` or relative import in a source file, as repo-relative paths. */
function importsOf(webRoot: string, rel: string, src: string): string[] {
  const dir = join(webRoot, rel, "..");
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
    const spec = m[1];
    let abs: string | null = null;
    if (spec.startsWith("@/")) abs = join(webRoot, spec.slice(2));
    else if (spec.startsWith(".")) abs = resolve(dir, spec);
    if (!abs) continue;
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      const candidate = `${abs}${ext}`;
      if (existsSync(candidate)) {
        out.push(candidate.slice(webRoot.length + 1).replace(/\\/g, "/"));
        break;
      }
    }
  }
  return out;
}

export const LANDING_PAGE = "app/[locale]/page.tsx";

/**
 * THE LANDING HAS TWO ARMS (owner command 2026-08-22 §2 + P0 entry-point fix
 * 2026-08-31): the canonical page statically renders FOCUS for every visitor
 * without an explicit choice, and the middleware rewrites the locale root to
 * the cookie-gated LIVE route for visitors who explicitly chose it. "The
 * landing, as the browser sees it" is therefore the union of both trees —
 * a CTA or baseline component is still shipped if EITHER arm renders it,
 * and genuinely deleting it from the arm that owns it still fails the guard.
 */
export const LANDING_ARM_PAGES = [
  LANDING_PAGE,
  "app/[locale]/live-market-review/page.tsx",
] as const;

/**
 * Every file in the landing's render tree, page first, deduped and depth-capped.
 *
 * The cap keeps a guard from silently becoming a whole-repo grep the day
 * someone imports a barrel file: an assertion that passes because it matched
 * something 12 modules away is not an assertion about the landing.
 */
export function landingTreeFiles(webRoot: string, maxDepth = 3): string[] {
  const seen = new Set<string>();
  let frontier = [...LANDING_ARM_PAGES];
  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const rel of frontier) {
      if (seen.has(rel)) continue;
      const abs = join(webRoot, rel);
      if (!existsSync(abs)) continue;
      seen.add(rel);
      next.push(...importsOf(webRoot, rel, readFileSync(abs, "utf8")));
    }
    frontier = next;
  }
  return [...seen];
}

/** The landing's composed source — what the guards assert against. */
export function landingTreeSource(webRoot: string, maxDepth = 3): string {
  return landingTreeFiles(webRoot, maxDepth)
    .map((rel) => readFileSync(join(webRoot, rel), "utf8"))
    .join("\n");
}
