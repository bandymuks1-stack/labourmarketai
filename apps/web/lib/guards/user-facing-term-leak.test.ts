import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * systemic-ux-terms-v1 — internal / technical jargon must never leak into the
 * normal user UI. The owner saw "Operacijų telemetrija (v1)", "ARENA",
 * "Draftas", "read-only", "task_name" etc. in places a non-admin reads.
 *
 * Those strings are legitimate INSIDE admin-only screens, so this guard is
 * namespace-aware: it scans every localized string OUTSIDE the admin-only
 * namespaces and fails on the forbidden technical tokens. Admin copy is left
 * untouched (it is only ever rendered under /dashboard/admin/*, which is now
 * gated by a fail-closed layout).
 */

const APP_ROOT = join(__dirname, "..", "..");
const LOCALES = ["lt", "en", "ru"] as const;

/** Top-level namespaces rendered ONLY under /dashboard/admin/* (admin-gated). */
const ADMIN_ONLY_NAMESPACES = new Set([
  "admin",
  "agentOs",
  "telemetry",
  "adminReadiness",
  "adminBilling",
  "adminPilots",
  "needStructuring",
]);

/** Forbidden technical tokens in USER-facing copy + a human label. */
const FORBIDDEN: { re: RegExp; label: string }[] = [
  { re: /\bARENA\b/, label: "ARENA (use 'Projekto eiga')" },
  { re: /\bDraftas\b/, label: "Draftas (use 'Ruošiama')" },
  { re: /\bread[- ]only\b/i, label: "read-only (use 'tik peržiūrai')" },
  { re: /\btelemetr/i, label: "telemetry/telemetrija (admin only)" },
  { re: /task_name/, label: "task_name (internal field)" },
  { re: /journal_entry_create/, label: "journal_entry_create (internal task)" },
  { re: /\(v1\)/, label: "(v1) (internal version tag)" },
  { re: /\bQA\b/, label: "QA (admin only)" },
];

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}

/** Walk a namespace subtree collecting every leaf string with its dotted path. */
function collectStrings(
  node: unknown,
  path: string,
  out: { path: string; value: string }[],
): void {
  if (typeof node === "string") {
    out.push({ path, value: node });
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

describe("no internal/technical term leaks in user-facing copy", () => {
  for (const locale of LOCALES) {
    it(`${locale}: user-facing strings contain no forbidden technical tokens`, () => {
      const m = loadMessages(locale);
      const offenders: string[] = [];
      for (const [namespace, subtree] of Object.entries(m)) {
        if (ADMIN_ONLY_NAMESPACES.has(namespace)) continue;
        const strings: { path: string; value: string }[] = [];
        collectStrings(subtree, namespace, strings);
        for (const { path, value } of strings) {
          for (const { re, label } of FORBIDDEN) {
            if (re.test(value)) {
              offenders.push(`${path}: "${value}" → ${label}`);
            }
          }
        }
      }
      expect(offenders, `term leaks found:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});

describe("admin subtree is structurally gated (fail-closed)", () => {
  it("dashboard/admin has a layout that calls requireSuperadmin", () => {
    const layout = readFileSync(
      join(APP_ROOT, "app/[locale]/dashboard/(full)/admin/layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(/requireSuperadmin/);
  });
});
