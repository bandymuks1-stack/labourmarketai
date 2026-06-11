import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Admin/Operator i18n Clarity v1.
 *
 * The admin/operator rooms are locale-scoped (/lt and /en both render them),
 * so their copy must not be hardcoded Lithuanian, English-only-by-accident,
 * or drift between LT and EN. This guard pins:
 *   1. Every admin-page i18n namespace has identical, non-empty key sets in
 *      LT and EN (no silent drift, no blank value).
 *   2. The admin tools hub has a label key for the project-truth link (it used
 *      to be hardcoded "Project truth · P0" on both locales) and the page
 *      renders it via t(), like its siblings.
 *   3. The i18n-driven admin pages carry NO hardcoded Lithuanian prose
 *      (zero LT diacritics in source — copy comes from JSON).
 *   4. The project-truth page is the ONE documented exception: an owner-only
 *      English technical diagnostic (table/migration/RLS names must stay in
 *      English to match real artifacts). Its boundary is pinned by its honest
 *      self-labelling, not by forcing translation of the ledger.
 *   5. Admin copy makes no overclaim (AI / verified / paid / matching /
 *      guarantee / production-status lie).
 *
 * Runs in CI via `pnpm -F web test`. Does not invent copy; does not weaken
 * any existing guard.
 */

const APP_ROOT = join(__dirname, "..", "..");
const ADMIN_DIR = "app/[locale]/dashboard/admin";

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadLocale(locale: string): Record<string, unknown> {
  return JSON.parse(read(`messages/${locale}.json`)) as Record<string, unknown>;
}
function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]),
      obj,
    );
}
function flatten(
  obj: unknown,
  prefix = "",
  acc: Record<string, unknown> = {},
): Record<string, unknown> {
  if (obj == null || typeof obj !== "object") return acc;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const np = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, np, acc);
    else acc[np] = v;
  }
  return acc;
}

// i18n namespaces that back the admin/operator pages.
const ADMIN_NAMESPACES = [
  "admin",
  "agentOs",
  "languageFeedback.admin",
  "telemetry",
  "communication.adminSupport",
] as const;

// Admin pages whose copy is i18n-driven and therefore must be diacritic-free
// in source (Lithuanian must come from the JSON, never hardcoded in JSX).
const I18N_DRIVEN_ADMIN_PAGES = [
  "page.tsx",
  "agent-os/page.tsx",
  "language-feedback/page.tsx",
  "telemetry/page.tsx",
  "support/page.tsx",
  "users/[id]/page.tsx",
] as const;

// Every Link in the admin tools hub must resolve a label key here.
const HUB_LABEL_KEYS = [
  "projectTruth",
  "agentOs",
  "telemetry",
  "languageFeedback",
  "communication",
  "support",
] as const;

const LT_DIACRITICS = /[ąčęėįšųūž]/i;

const FORBIDDEN: RegExp[] = [
  /\bAI[\s-]*(?:match|matching|verif|confirm)/i,
  /\bAI[\s-]+powered\b/i,
  /\bautomatically\s+verified\b/i,
  /\bautomatic\s+verification\b/i,
  /\binstant\s+hiring\b/i,
  /\bpaid\s+plan\s+active\b/i,
  /\bwe\s+guarantee\b/i,
  /\bguaranteed\b/i,
];

describe("Guard: admin i18n namespaces stay aligned (LT == EN)", () => {
  const en = loadLocale("en");
  const lt = loadLocale("lt");
  for (const ns of ADMIN_NAMESPACES) {
    it(`${ns}: identical non-empty key sets in LT and EN`, () => {
      const eFlat = flatten(getPath(en, ns));
      const lFlat = flatten(getPath(lt, ns));
      expect(Object.keys(eFlat).length, `${ns} missing/empty in EN`).toBeGreaterThan(0);
      expect(Object.keys(eFlat).sort()).toEqual(Object.keys(lFlat).sort());
      for (const [k, v] of Object.entries(eFlat)) {
        expect(typeof v === "string" && (v as string).trim().length > 0, `en ${ns}.${k} empty`).toBe(true);
      }
      for (const [k, v] of Object.entries(lFlat)) {
        expect(typeof v === "string" && (v as string).trim().length > 0, `lt ${ns}.${k} empty`).toBe(true);
      }
    });
  }
});

describe("Guard: admin tools hub is fully i18n-driven (no hardcoded link)", () => {
  const en = loadLocale("en");
  const lt = loadLocale("lt");
  for (const key of HUB_LABEL_KEYS) {
    it(`admin.hub.${key} resolves in LT + EN`, () => {
      expect(getPath(en, `admin.hub.${key}`), `en admin.hub.${key}`).toBeTruthy();
      expect(getPath(lt, `admin.hub.${key}`), `lt admin.hub.${key}`).toBeTruthy();
    });
  }
  it("admin page renders the project-truth link via t(), not hardcoded text", () => {
    const src = read(`${ADMIN_DIR}/page.tsx`);
    expect(src).toMatch(/t\("hub\.projectTruth"\)/);
    // The old hardcoded label must be gone from the hub link.
    expect(src).not.toMatch(/>\s*Project truth · P0\s*</);
  });
});

describe("Guard: i18n-driven admin pages carry no hardcoded Lithuanian", () => {
  for (const page of I18N_DRIVEN_ADMIN_PAGES) {
    it(`${page} has no LT diacritics in source`, () => {
      const src = read(`${ADMIN_DIR}/${page}`);
      const offending = src
        .split(/\r?\n/)
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => LT_DIACRITICS.test(line));
      expect(
        offending,
        `Hardcoded Lithuanian in ${page}: ${offending
          .map((o) => `L${o.n}: ${o.line}`)
          .join(" | ")}`,
      ).toEqual([]);
    });
  }
});

describe("Guard: project-truth is a documented English-only owner diagnostic", () => {
  const src = read(`${ADMIN_DIR}/project-truth/page.tsx`);
  // This page intentionally does NOT use the admin i18n namespace for its
  // ledger: table/migration/RLS/SQL names must stay in English to match real
  // artifacts. The exemption is legitimate only while it stays an honest,
  // read-only diagnostic — pin that self-labelling so it can't morph into a
  // user-facing surface or start claiming false production state.
  it("self-labels as a read-only admin diagnostic that never writes to prod", () => {
    expect(src).toMatch(/admin diagnostic/i);
    expect(src).toMatch(/Read-only diagnostic/i);
    expect(src).toMatch(/never writes to production/i);
    expect(src).toMatch(/no fake rows/i);
  });
});

describe("Guard: admin copy makes no overclaim", () => {
  for (const locale of ["lt", "en"] as const) {
    const blob = loadLocale(locale);
    for (const ns of ADMIN_NAMESPACES) {
      it(`${locale} ${ns} has no AI/verify/paid/guarantee overclaim`, () => {
        const flat = flatten(getPath(blob, ns));
        for (const [k, v] of Object.entries(flat)) {
          if (typeof v !== "string") continue;
          for (const rx of FORBIDDEN) {
            expect(rx.test(v), `${locale} ${ns}.${k} overclaim ${rx}: ${v}`).toBe(false);
          }
        }
      });
    }
  }
});
