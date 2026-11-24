import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

/**
 * PRIVATE DOCUMENTATION NEVER REACHES THE PUBLIC RUNTIME.
 *
 * This repository is PUBLIC, and the detailed capability registry, strategy and
 * security analysis are deliberately kept OUT of it (see AGENTS.md → Capability
 * pre-flight). That decision protects the GitHub surface. It says nothing about
 * the *product* surface, which is a separate and easier thing to get wrong:
 * one `readFileSync` of a doc, one `.md` dropped into `public/`, one debug route
 * that echoes a file, and internal material starts being served to visitors.
 *
 * Audited 2026-08-23: the runtime was clean on every axis below. This guard
 * exists so it stays clean by construction rather than by re-auditing, because
 * the failure is silent — nothing breaks, the content is simply published.
 *
 * WHAT THIS DOES NOT DO. It does not police what may exist in `docs/`; that is
 * an owner decision about repository visibility, not a build-time rule. It only
 * pins that documentation cannot become part of what the app serves.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");

/** App-owned source trees — everything that can end up in a response. */
const RUNTIME_DIRS = ["app", "components", "lib"] as const;
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const runtimeSources = RUNTIME_DIRS.flatMap((d) => walk(join(WEB, d))).filter(
  (f) => SOURCE_EXT.has(extname(f)) && !f.includes(".test."),
);

/** Comments legitimately cite doc paths as provenance; code must not read them. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("private documentation cannot reach the public runtime", () => {
  /**
   * The documentation trees are at the REPO ROOT (`docs/`, `runtime/`). A
   * specifier is only a documentation import if it actually RESOLVES into one
   * of them — matching the substring would flag `lib/ai/runtime/config`, which
   * is application code that merely shares a directory name.
   */
  const DOC_ROOTS = [join(REPO, "docs"), join(REPO, "runtime")];
  const escapesInto = (fromFile: string, specifier: string): boolean => {
    if (!specifier.startsWith(".")) return false;
    const target = resolve(dirname(fromFile), specifier);
    return DOC_ROOTS.some(
      (root) => target === root || target.startsWith(`${root}/`),
    );
  };
  const SPECIFIER_RE =
    /(?:^|[\s(=,])(?:import|require)\s*(?:\(\s*)?["']([^"']+)["']|from\s+["']([^"']+)["']/g;

  it("no runtime module imports from a documentation directory", () => {
    const offenders: string[] = [];
    for (const file of runtimeSources) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const m of code.matchAll(SPECIFIER_RE)) {
        const spec = m[1] ?? m[2];
        if (!spec) continue;
        // Repo-root-relative form, or a relative climb that lands in docs/.
        if (/^(?:docs|runtime)\//.test(spec) || escapesInto(file, spec)) {
          offenders.push(`${relative(REPO, file)} → ${spec}`);
        }
      }
    }
    expect(
      offenders,
      "these runtime modules import documentation — internal material would ship to visitors",
    ).toEqual([]);
  });

  it("no runtime module reads a documentation path at runtime", () => {
    const offenders: string[] = [];
    for (const file of runtimeSources) {
      const code = stripComments(readFileSync(file, "utf8"));
      // readFile/readFileSync/join(...) reaching into docs/ or runtime/.
      if (/(?:readFileSync|readFile|createReadStream)[\s\S]{0,160}?["'][^"']*(?:docs|runtime)\//.test(code)) {
        offenders.push(relative(REPO, file));
      }
    }
    expect(
      offenders,
      "these runtime modules read documentation from disk — that content becomes a response",
    ).toEqual([]);
  });

  it("nothing served from public/ is a document", () => {
    const publicDir = join(WEB, "public");
    // POSIX-normalised: `relative()` yields "\" on Windows, so the
    // `.well-known/` exemption below silently never matched there and the
    // guard failed for every Windows developer while CI (Linux) stayed
    // green. Compare one separator on every platform.
    const served = walk(publicDir).map((f) =>
      relative(publicDir, f).split(sep).join("/"),
    );
    const docs = served.filter((f) => {
      // `.well-known/` is a standards-defined public surface — security.txt
      // (RFC 9116) is MEANT to be served, and suppressing it would be worse
      // than the risk this guard exists to catch.
      if (f.startsWith(".well-known/")) return false;
      return [".md", ".mdx", ".txt", ".csv", ".pdf", ".docx"].includes(
        extname(f).toLowerCase(),
      );
    });
    expect(
      docs,
      "files under public/ are served verbatim at the site root — a document here is published",
    ).toEqual([]);
  });

  it("production browser source maps stay off", () => {
    // Source maps would republish the full client source, comments included.
    for (const name of ["next.config.ts", "next.config.js", "next.config.mjs"]) {
      const p = join(WEB, name);
      if (!existsSync(p)) continue;
      const cfg = stripComments(readFileSync(p, "utf8"));
      expect(
        /productionBrowserSourceMaps\s*:\s*true/.test(cfg),
        `${name} enables production source maps`,
      ).toBe(false);
    }
  });

  it("no debug or documentation route exists under app/", () => {
    const routes = walk(join(WEB, "app"))
      .filter((f) => /(?:page|route)\.tsx?$/.test(f))
      .map((f) => relative(join(WEB, "app"), f));
    const suspicious = routes.filter((r) =>
      /(?:^|\/)(?:debug|__dev|_dev|internal-docs|storybook)(?:\/|$)/.test(r),
    );
    expect(
      suspicious,
      "debug/documentation routes expose internal material to anonymous visitors",
    ).toEqual([]);
  });
});
