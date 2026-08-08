import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * W12 — the UTC time-presentation ratchet.
 *
 * ## What this pins
 *
 * The product model is `storage = UTC, display = UTC, localized by locale`
 * (`docs/audits/W12_TEMPORAL_INTELLIGENCE_CURRENT_TRUTH.md` §3.5). The whole
 * class of defects this guard exists to prevent comes from ONE mistake:
 * formatting a date without saying which timezone to format it in.
 *
 * `toLocaleDateString(locale)` and `new Intl.DateTimeFormat(locale, {…})`
 * silently use the AMBIENT zone when `timeZone` is omitted — the viewer's
 * browser in a client component, the server process in a server component. The
 * bug is INVISIBLE when everything runs in UTC (Vercel does), which is exactly
 * why it survived until an audit went looking for it, and exactly why a guard
 * rather than a code review has to hold the line.
 *
 * ## Why the rule is "use the named module", not "write timeZone everywhere"
 *
 * A rule of the form "remember to add `timeZone: 'UTC'`" fails the same way the
 * original code failed. `lib/time/display.ts` cannot be used incorrectly: it
 * forces the option after spreading the caller's, so there is no call shape
 * that formats in another zone. The exception below for an explicit
 * `timeZone: "UTC"` covers the five pre-existing server formatters that already
 * did the right thing by hand; new code should use the module.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const CANONICAL = join("lib", "time", "display.ts");
const SCAN_DIRS = ["app", "components", "lib"] as const;

/** Every non-test TS/TSX source file under the scanned trees. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    // `withFileTypes` answers "directory?" from the SAME directory read, so
    // there is no stat-then-read gap on the path (CodeQL js/file-system-race)
    // and one syscall per entry instead of two.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      if (name === "node_modules" || name === ".next") continue;
      const full = join(dir, name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.tsx?$/.test(name)) continue;
      if (/\.test\.tsx?$/.test(name)) continue;
      out.push(full);
    }
  };
  for (const d of SCAN_DIRS) walk(join(WEB_ROOT, d));
  return out;
}

/**
 * Blank out comment CONTENT while preserving every newline, so a scan reports
 * the same line numbers as the editor. Without this, a comment that merely
 * NAMES a banned call — which the canonical module's own doc does, on purpose —
 * would fail the guard it is documenting.
 */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length));
}

const FILES = sourceFiles().map((f) => {
  const src = readFileSync(f, "utf8");
  return {
    rel: relative(WEB_ROOT, f).split(sep).join("/"),
    src,
    /** `src` with comments blanked — what every ban below is asserted against. */
    code: blankComments(src),
  };
});

const isCanonical = (rel: string) => rel === CANONICAL.split(sep).join("/");

/** Offending lines for a pattern, as "path:line  <trimmed source>". */
function hits(pattern: RegExp, skipCanonical = true): string[] {
  const found: string[] = [];
  for (const { rel, code } of FILES) {
    if (skipCanonical && isCanonical(rel)) continue;
    code.split("\n").forEach((line, i) => {
      if (pattern.test(line)) found.push(`${rel}:${i + 1}  ${line.trim()}`);
    });
  }
  return found;
}

describe("the scan itself is wired to real files", () => {
  it("walks a non-trivial tree (a silently-empty scan would pass everything)", () => {
    expect(FILES.length).toBeGreaterThan(500);
  });

  it("the canonical module exists and is the file the exemptions name", () => {
    expect(FILES.some((f) => isCanonical(f.rel))).toBe(true);
  });
});

describe("no date is formatted in the ambient timezone", () => {
  it("toLocaleDateString is used nowhere outside the canonical module", () => {
    // Unambiguously a date. There is no non-date use of this method.
    expect(hits(/\.toLocaleDateString\s*\(/)).toEqual([]);
  });

  it("toLocaleTimeString is used nowhere outside the canonical module", () => {
    expect(hits(/\.toLocaleTimeString\s*\(/)).toEqual([]);
  });

  it("toLocaleString is never called ON a Date", () => {
    // `n.toLocaleString()` on a NUMBER is legitimate and stays allowed — it is
    // digit grouping, not a timezone decision. Only the Date form is banned.
    expect(hits(/new Date\([^)]*\)\s*\.toLocaleString\s*\(/)).toEqual([]);
  });

  it("toLocaleString is never passed a locale (the date-shaped call)", () => {
    // Every legitimate number call in this repo is the bare `.toLocaleString()`.
    // Passing a locale means a human date was intended; route it through the
    // module so the zone comes with it.
    expect(hits(/\.toLocaleString\s*\(\s*[^)\s]/)).toEqual([]);
  });

  it("toDateString is not used for day comparison (it is ambient-zone)", () => {
    expect(hits(/\.toDateString\s*\(/)).toEqual([]);
  });
});

describe("every Intl.DateTimeFormat pins its timezone", () => {
  it("no construction omits timeZone", () => {
    const bad: string[] = [];
    for (const { rel, code } of FILES) {
      if (isCanonical(rel)) continue;
      const lines = code.split("\n");
      lines.forEach((line, i) => {
        if (!/new Intl\.DateTimeFormat\s*\(/.test(line)) return;
        // The options object may span lines; read the construction's window.
        const window = lines.slice(i, i + 10).join("\n");
        const end = window.indexOf(");");
        const call = end === -1 ? window : window.slice(0, end);
        if (!/timeZone\s*:\s*["']UTC["']/.test(call)) {
          bad.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});

describe("the canonical module cannot be pointed at another zone", () => {
  const src = FILES.find((f) => isCanonical(f.rel))!.src;

  it("the display zone is UTC", () => {
    expect(src).toMatch(/export const DISPLAY_TIME_ZONE = "UTC"/);
  });

  it("timeZone is forced AFTER the caller's options, so it cannot be overridden", () => {
    expect(src).toMatch(/\{\s*\.\.\.options,\s*timeZone:\s*DISPLAY_TIME_ZONE\s*\}/);
  });

  it("the module never reads an ambient-zone value itself", () => {
    // Its own doc names the banned calls in prose, so this assertion has to
    // look at CODE. Strip comments first.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.toLocaleDateString\s*\(/);
    expect(code).not.toMatch(/getFullYear\s*\(\)|getMonth\s*\(\)|getDate\s*\(\)/);
  });
});

describe("day KEYS are derived in the same zone as the day LABELS", () => {
  // A surface that groups by day has two date computations — the group key and
  // the header label. If they disagree on the zone, the header can name a
  // different day than the rows beneath it. These are the surfaces that group.
  const read = (rel: string) => FILES.find((f) => f.rel === rel)!.code;

  it("the journal diary groups by the canonical UTC day", () => {
    const src = read("app/[locale]/dashboard/journal/page.tsx");
    expect(src).toMatch(/utcDayKey\(/);
    // The ambient-zone getters that used to build the key must not return.
    expect(src).not.toMatch(/getFullYear\s*\(\)/);
    expect(src).not.toMatch(/getMonth\s*\(\)/);
  });

  it("the quick-confirm batch's 'today' is the canonical UTC day", () => {
    const src = read("app/[locale]/dashboard/inbox/quick/page.tsx");
    expect(src).toMatch(/utcTodayKey\(/);
    expect(src).toMatch(/utcDayKey\(/);
  });

  it("the profile hub's freshness comparison uses the canonical key", () => {
    expect(read("components/app/profile-hub-overview.tsx")).toMatch(/utcDayKey\(/);
  });
});

describe("the migrated surfaces still route through the canonical module", () => {
  // Named so that deleting the import (and reintroducing a raw call) fails
  // HERE with the surface's name, not only in the generic scan above.
  const MIGRATED = [
    "app/[locale]/cv/page.tsx",
    "app/[locale]/invite/[token]/page.tsx",
    "app/[locale]/dashboard/assist/page.tsx",
    "app/[locale]/dashboard/communication/page.tsx",
    "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
    "app/[locale]/dashboard/company/planning/page.tsx",
    "app/[locale]/dashboard/finance/page.tsx",
    "app/[locale]/dashboard/inbox/quick/page.tsx",
    "app/[locale]/dashboard/inbox/report/page.tsx",
    "app/[locale]/dashboard/journal/page.tsx",
    "app/[locale]/dashboard/opportunities/page.tsx",
    "app/[locale]/dashboard/planning/page.tsx",
    "app/[locale]/dashboard/tasks/page.tsx",
    "app/[locale]/dashboard/admin/language-feedback/page.tsx",
    "app/[locale]/dashboard/admin/pilots/[id]/page.tsx",
    "app/[locale]/dashboard/admin/support/page.tsx",
    "app/[locale]/dashboard/admin/telemetry/page.tsx",
    "components/app/capability-profile-section.tsx",
    "components/app/cv-engagement-cards.tsx",
    "components/app/handover-passport-panel.tsx",
    "components/app/invitation-list.tsx",
    "components/app/journal-inbox-entry.tsx",
    "components/app/manager-evidence-card.tsx",
    "components/app/profile-hub-overview.tsx",
    "components/app/quick-confirm-batch.tsx",
    "components/app/quick-confirm-card.tsx",
    "components/app/worker-instruction-card.tsx",
    "components/app/worker-readiness-summary.tsx",
    "components/intelligence/explainability-drawer.tsx",
    "components/intelligence/intelligence-card.tsx",
    "components/intelligence/intelligence-timeline.tsx",
    "lib/conversation/profile-summary.ts",
  ] as const;

  for (const rel of MIGRATED) {
    it(`${rel} imports the canonical formatter`, () => {
      const f = FILES.find((x) => x.rel === rel);
      expect(f, `${rel} must exist (rename → update this list)`).toBeDefined();
      expect(f!.src).toMatch(/from "@\/lib\/time\/display"/);
    });
  }
});

describe("the locale is always passed explicitly", () => {
  it("no call site formats without a locale argument", () => {
    // `formatUtcDate(x)` / `formatUtcDateTime(x)` with one argument would fall
    // back to the runtime's default locale — the handover-passport defect.
    const bad: string[] = [];
    for (const { rel, code: src } of FILES) {
      if (isCanonical(rel)) continue;
      const re = /\bformatUtcDate(?:Time)?\(\s*([^,()]|\([^()]*\))*\)/g;
      for (const m of src.matchAll(re)) {
        // A well-formed call has a comma at depth 0 (value, locale).
        if (!m[0].includes(",")) bad.push(`${rel}  ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
