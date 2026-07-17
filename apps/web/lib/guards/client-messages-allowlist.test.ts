import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { CLIENT_MESSAGE_ROOTS, pickClientMessages } from "@/lib/i18n/client-messages";
import { DASHBOARD_MODULES } from "@/lib/dashboard/dashboard-module-registry";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Client message allowlist guard (Performance Reality Audit v1).
 *
 * The root layout ships ONLY the allowlisted message roots to the client
 * (pickClientMessages). This guard re-derives, from source, every namespace
 * a client component can reach and proves the allowlist covers it — a new
 * "use client" namespace that is not allowlisted fails HERE instead of
 * silently rendering raw keys in production:
 *
 *  1. every LITERAL useTranslations("…") root inside a "use client" file is
 *     allowlisted;
 *  2. every DYNAMIC-key root is allowlisted: dashboard module registry
 *     label/description keys, skill-group labels, the demand draft-form
 *     namespaces;
 *  3. every allowlisted root actually exists in the runtime tree of every
 *     active locale (no dead allowlist entries, no typos);
 *  4. the layout passes the pick — nobody quietly reverts to the full tree;
 *  5. pickClientMessages keeps values untouched (pure subset).
 */

const ROOT = join(__dirname, "..", "..");

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

describe("every client-reachable namespace root is allowlisted", () => {
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
      expect(ALLOW.has(root), `registry root "${root}" must be allowlisted`).toBe(true);
    }
  });

  it("dynamic roots: skill groups + demand draft forms", () => {
    expect(ALLOW.has("skillGroups")).toBe(true); // skillGroupLabelKey()
    expect(ALLOW.has("roleDashboards")).toBe(true); // i18nNamespace="roleDashboards.…"
  });
});

describe("the allowlist itself is honest", () => {
  it("every allowlisted root exists in the runtime tree of every active locale", () => {
    for (const locale of activeLocales) {
      const base = JSON.parse(
        readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"),
      ) as Record<string, unknown>;
      const runtimeRoots = new Set([
        ...Object.keys(base),
        ...SPLIT_NAMESPACES,
      ]);
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
});

describe("the layout ships the pick, not the full tree", () => {
  it("NextIntlClientProvider receives pickClientMessages(await getMessages())", () => {
    const layout = readFileSync(
      join(ROOT, "app", "[locale]", "layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(
      /NextIntlClientProvider messages=\{pickClientMessages\(await getMessages\(\)\)\}/,
    );
  });
});
