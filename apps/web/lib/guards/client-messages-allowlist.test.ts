import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import {
  AUTH_CLIENT_MESSAGE_ROOTS,
  BASE_CLIENT_MESSAGE_ROOTS,
  CLIENT_MESSAGE_ROOTS,
  MARKETING_CLIENT_MESSAGE_ROOTS,
  pickClientMessages,
  pickMessages,
} from "@/lib/i18n/client-messages";
import { DASHBOARD_MODULES } from "@/lib/dashboard/dashboard-module-registry";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Client message allowlist guard (Performance Reality Audit v1 + v2).
 *
 * v1: the root layout ships ONLY allowlisted message roots to the client.
 * This guard re-derives, from source, every namespace a client component
 * can reach and proves the union allowlist covers it — a new "use client"
 * namespace that is not allowlisted fails HERE instead of silently
 * rendering raw keys in production:
 *
 *  1. every LITERAL useTranslations("…") root inside a "use client" file is
 *     allowlisted;
 *  2. every DYNAMIC-key root is allowlisted: dashboard module registry
 *     label/description keys, skill-group labels, the demand draft-form
 *     namespaces;
 *  3. every allowlisted root actually exists in the runtime tree of every
 *     active locale (no dead allowlist entries, no typos);
 *  4. the layouts pass the picks — nobody quietly reverts to the full tree;
 *  5. pickMessages/pickClientMessages keep values untouched (pure subset).
 *
 * v2 (route-group provider subsetting): each route group ships its OWN
 * pick, so this guard additionally walks the import graph of every group
 * tree and proves the group's allowlist covers every client namespace
 * reachable from that tree:
 *
 *  6. (marketing) tree  ⊆ MARKETING_CLIENT_MESSAGE_ROOTS;
 *     focus-landing     ⊆ MARKETING_CLIENT_MESSAGE_ROOTS (own provider);
 *  7. auth + onboarding ⊆ AUTH_CLIENT_MESSAGE_ROOTS;
 *  8. everything under [locale] WITHOUT a group provider (cv, invite,
 *     [...rest], the root layout/error/not-found) ⊆ BASE_CLIENT_MESSAGE_ROOTS,
 *     and the canonical landing dispatcher ⊆ the union of its two arms;
 *  9. a client file with a NON-literal useTranslations() call (whole-tree
 *     or variable namespace) must NOT be reachable from a subset tree —
 *     only from trees that ship the FULL pick (dashboard, design);
 * 10. an import specifier that looks local (@/ or relative) but cannot be
 *     resolved fails the guard — no silent under-derivation.
 */

const ROOT = join(__dirname, "..", "..");
const LOCALE_DIR = join(ROOT, "app", "[locale]");

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo")
        continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

const isSource = (p: string): boolean =>
  (p.endsWith(".ts") || p.endsWith(".tsx")) && !p.endsWith(".test.ts");

const ALLOW: ReadonlySet<string> = new Set(CLIENT_MESSAGE_ROOTS);

/** Split-file namespaces merged by lib/i18n/request.ts on top of the base. */
const SPLIT_NAMESPACES = [
  "professions",
  "skillNames",
  "journal",
  "relationshipTypes",
  "productivityUnits",
  "labourMarket",
] as const;

/* ------------------------------------------------------------------ *
 * v2: import-graph walk per route-group tree.
 * ------------------------------------------------------------------ */

const IMPORT_RE =
  /(?:import\s+[^"']*?from\s*|export\s+[^"']*?from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

const ASSET_RE = /\.(css|json|svg|png|jpe?g|webp|ico|txt|md)$/;

function resolveLocalImport(
  fromFile: string,
  spec: string,
): string | null | "UNRESOLVED" {
  if (ASSET_RE.test(spec)) return null; // assets carry no messages
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // package import
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return "UNRESOLVED";
}

interface DerivedClientUsage {
  /** Top-level roots of literal useTranslations("…") calls in reachable
   *  "use client" files. */
  literalRoots: Set<string>;
  /** Reachable "use client" files containing a NON-literal
   *  useTranslations(…) call (whole tree / variable namespace). */
  dynamicCallFiles: string[];
  /** Local-looking import specifiers that could not be resolved. */
  unresolved: string[];
}

function deriveClientUsage(entryFiles: string[]): DerivedClientUsage {
  const seen = new Set<string>();
  const unresolved = new Set<string>();
  const stack = [...entryFiles];
  while (stack.length > 0) {
    const f = stack.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const r = resolveLocalImport(f, m[1]);
      if (r === null) continue;
      if (r === "UNRESOLVED") {
        unresolved.add(
          `${m[1]} (from ${relative(ROOT, f).replaceAll("\\", "/")})`,
        );
        continue;
      }
      if (!seen.has(r)) stack.push(r);
    }
  }
  const literalRoots = new Set<string>();
  const dynamicCallFiles = new Set<string>();
  for (const f of seen) {
    const src = readFileSync(f, "utf8");
    if (!src.slice(0, 300).includes('"use client"')) continue;
    for (const m of src.matchAll(/useTranslations\("([^"]+)"\)/g)) {
      literalRoots.add(m[1].split(".")[0]);
    }
    for (const m of src.matchAll(/useTranslations\((?!\s*")([^)]*)\)/g)) {
      dynamicCallFiles.add(
        `${relative(ROOT, f).replaceAll("\\", "/")} -> useTranslations(${m[1]})`,
      );
    }
  }
  return {
    literalRoots,
    dynamicCallFiles: [...dynamicCallFiles].sort(),
    unresolved: [...unresolved].sort(),
  };
}

function treeEntries(...dirs: string[]): string[] {
  return dirs.flatMap((d) => walk(d, isSource));
}

function assertGroupCovered(
  usage: DerivedClientUsage,
  groupList: readonly string[],
  label: string,
): void {
  expect(usage.unresolved, `${label}: unresolvable local imports`).toEqual([]);
  expect(
    usage.dynamicCallFiles,
    `${label}: a non-literal useTranslations() consumer became reachable — ` +
      `this tree ships a SUBSET pick and cannot serve whole-tree/dynamic ` +
      `namespaces. Move the group to the full pick or remove the import.`,
  ).toEqual([]);
  const allowSet = new Set(groupList);
  const missing = [...usage.literalRoots].filter((r) => !allowSet.has(r));
  expect(
    missing.sort(),
    `${label}: client-reachable namespace roots missing from the group allowlist`,
  ).toEqual([]);
}

describe("every client-reachable namespace root is allowlisted (v1 union)", () => {
  it("literal useTranslations roots in 'use client' files", () => {
    const missing = new Set<string>();
    const files = ["app", "components", "lib"].flatMap((d) =>
      walk(join(ROOT, d), isSource),
    );
    for (const p of files) {
      const src = readFileSync(p, "utf8");
      if (!src.slice(0, 300).includes('"use client"')) continue;
      for (const m of src.matchAll(/useTranslations\("([^"]+)"\)/g)) {
        const root = m[1].split(".")[0];
        if (!ALLOW.has(root)) {
          missing.add(`${root} (${relative(ROOT, p).replaceAll("\\", "/")})`);
        }
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("dynamic roots: module registry label/description keys", () => {
    const roots = new Set<string>();
    for (const m of DASHBOARD_MODULES) {
      roots.add(m.labelKey.split(".")[0]);
      roots.add(m.descriptionKey.split(".")[0]);
    }
    for (const root of roots) {
      expect(
        ALLOW.has(root),
        `registry root "${root}" must be allowlisted`,
      ).toBe(true);
    }
  });

  it("dynamic roots: skill groups + demand draft forms", () => {
    expect(ALLOW.has("skillGroups")).toBe(true); // skillGroupLabelKey()
    expect(ALLOW.has("roleDashboards")).toBe(true); // i18nNamespace="roleDashboards.…"
  });
});

describe("route-group provider subsetting (v2) — every group pick covers its tree", () => {
  it("group allowlists are subsets of the union allowlist", () => {
    for (const list of [
      BASE_CLIENT_MESSAGE_ROOTS,
      MARKETING_CLIENT_MESSAGE_ROOTS,
      AUTH_CLIENT_MESSAGE_ROOTS,
    ]) {
      for (const root of list) {
        expect(ALLOW.has(root), `group root "${root}" missing from union`).toBe(
          true,
        );
      }
    }
  });

  it("(marketing) tree ⊆ MARKETING_CLIENT_MESSAGE_ROOTS", () => {
    const usage = deriveClientUsage(
      treeEntries(join(LOCALE_DIR, "(marketing)")),
    );
    assertGroupCovered(usage, MARKETING_CLIENT_MESSAGE_ROOTS, "(marketing)");
  });

  it("the canonical landing dispatcher stays inside its arms' picks", () => {
    // `app/[locale]/page.tsx` mounts NO provider of its own: it resolves the
    // arm on the server and renders either LIVE (provider-less, BASE pick
    // from the root shell) or FOCUS (its own marketing pick). So everything
    // reachable through it must be covered by the union of those two picks —
    // a namespace that escapes BOTH would render raw keys in one arm.
    const usage = deriveClientUsage([join(LOCALE_DIR, "page.tsx")]);
    assertGroupCovered(
      usage,
      [...BASE_CLIENT_MESSAGE_ROOTS, ...MARKETING_CLIENT_MESSAGE_ROOTS],
      "canonical landing dispatcher",
    );
  });

  it("focus-landing tree ⊆ MARKETING_CLIENT_MESSAGE_ROOTS", () => {
    // FOCUS is the restored previous production landing. It rendered inside
    // the (marketing) route group, whose layout supplied the provider; at
    // `/{locale}` it mounts that SAME marketing pick itself, so it is a
    // subset tree in its own right rather than a provider-less one.
    const usage = deriveClientUsage(
      treeEntries(join(LOCALE_DIR, "focus-landing")),
    );
    assertGroupCovered(
      usage,
      MARKETING_CLIENT_MESSAGE_ROOTS,
      "focus-landing",
    );
  });

  it("auth tree ⊆ AUTH_CLIENT_MESSAGE_ROOTS", () => {
    const usage = deriveClientUsage(treeEntries(join(LOCALE_DIR, "auth")));
    assertGroupCovered(usage, AUTH_CLIENT_MESSAGE_ROOTS, "auth");
  });

  it("onboarding tree ⊆ AUTH_CLIENT_MESSAGE_ROOTS", () => {
    const usage = deriveClientUsage(
      treeEntries(join(LOCALE_DIR, "onboarding")),
    );
    assertGroupCovered(usage, AUTH_CLIENT_MESSAGE_ROOTS, "onboarding");
  });

  it("provider-less trees (review, cv, invite, [...rest], root shell) ⊆ BASE_CLIENT_MESSAGE_ROOTS", () => {
    // Every [locale] child WITHOUT its own provider must stay within the
    // root layout's minimal pick. Enumerated explicitly so a NEW top-level
    // route directory fails the inventory check below until it is either
    // added here (no client i18n) or given its own provider layout.
    const usage = deriveClientUsage([
      ...treeEntries(
        join(LOCALE_DIR, "business"),
        join(LOCALE_DIR, "cv"),
        join(LOCALE_DIR, "invite"),
        join(LOCALE_DIR, "[...rest]"),
        join(LOCALE_DIR, "live-market-review"),
      ),
      join(LOCALE_DIR, "layout.tsx"),
      join(LOCALE_DIR, "error.tsx"),
      join(LOCALE_DIR, "not-found.tsx"),
    ]);
    assertGroupCovered(usage, BASE_CLIENT_MESSAGE_ROOTS, "provider-less trees");
  });

  it("every [locale] child route tree is accounted for", () => {
    // Inventory pin: full-pick trees (dashboard, design) + subset trees
    // (marketing, focus-landing, auth, onboarding) + provider-less trees
    // (home, review, cv, invite, [...rest]). A new top-level directory must
    // be classified here.
    const children = readdirSync(LOCALE_DIR)
      .filter((e) => statSync(join(LOCALE_DIR, e)).isDirectory())
      .sort();
    expect(children).toEqual([
      "(marketing)",
      "[...rest]",
      "auth",
      "business",
      "cv",
      "dashboard",
      "focus-landing",
      "invite",
      "live-market-review",
      "onboarding",
    ]);
  });
});

describe("the allowlist itself is honest", () => {
  it("every allowlisted root exists in the runtime tree of every active locale", () => {
    for (const locale of activeLocales) {
      const base = JSON.parse(
        readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"),
      ) as Record<string, unknown>;
      const runtimeRoots = new Set([...Object.keys(base), ...SPLIT_NAMESPACES]);
      for (const root of CLIENT_MESSAGE_ROOTS) {
        expect(
          runtimeRoots.has(root),
          `${locale}: allowlisted root "${root}" missing from runtime tree`,
        ).toBe(true);
      }
    }
  });

  it("pickClientMessages is a pure subset — kept values are identical, others dropped", () => {
    const tree = {
      auth: { a: "1" },
      legal: { b: "2" },
      journal: { c: "3" },
    } as never;
    const picked = pickClientMessages(tree) as Record<string, unknown>;
    expect(picked.auth).toBe((tree as Record<string, unknown>).auth);
    expect(picked.journal).toBe((tree as Record<string, unknown>).journal);
    expect(picked).not.toHaveProperty("legal");
  });

  it("pickMessages is a pure subset for group lists too", () => {
    const tree = {
      auth: { a: "1" },
      errorBoundary: { b: "2" },
      common: { c: "3" },
    } as never;
    const picked = pickMessages(tree, AUTH_CLIENT_MESSAGE_ROOTS) as Record<
      string,
      unknown
    >;
    expect(picked.auth).toBe((tree as Record<string, unknown>).auth);
    // V8 W4-B: `common` rides with the locale switcher on auth/onboarding.
    expect(Object.keys(picked)).toEqual(["auth", "common"]);
  });
});

describe("each layout ships its pick, not the full tree", () => {
  const layoutSrc = (...segments: string[]): string =>
    readFileSync(join(LOCALE_DIR, ...segments), "utf8");

  it("root [locale] layout ships the BASE pick", () => {
    expect(layoutSrc("layout.tsx")).toMatch(
      /NextIntlClientProvider[\s\S]{0,200}?messages=\{pickMessages\(\s*await getMessages\(\),\s*BASE_CLIENT_MESSAGE_ROOTS,?\s*\)\}/,
    );
  });

  it("(marketing) layout ships the MARKETING pick", () => {
    expect(layoutSrc("(marketing)", "layout.tsx")).toMatch(
      /NextIntlClientProvider[\s\S]{0,200}?messages=\{pickMessages\(\s*await getMessages\(\),\s*MARKETING_CLIENT_MESSAGE_ROOTS,?\s*\)\}/,
    );
  });

  it("auth + onboarding layouts ship the AUTH pick", () => {
    for (const seg of ["auth", "onboarding"]) {
      expect(layoutSrc(seg, "layout.tsx")).toMatch(
        /NextIntlClientProvider[\s\S]{0,200}?messages=\{pickMessages\(\s*await getMessages\(\),\s*AUTH_CLIENT_MESSAGE_ROOTS,?\s*\)\}/,
      );
    }
  });

  it("the dashboard layout ships the FULL client pick", () => {
    // W1 deleted the /design gallery, so "dashboard" is the whole list now.
    for (const seg of ["dashboard"]) {
      expect(layoutSrc(seg, "layout.tsx")).toMatch(
        /NextIntlClientProvider[\s\S]{0,200}?messages=\{pickClientMessages\(\s*await getMessages\(\),?\s*\)\}/,
      );
    }
  });
});
