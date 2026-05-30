/**
 * Primary route smoke / dead-UI QA guard (PR: primary-route-smoke-dead-ui-guard).
 *
 * Purpose (see docs/quality/primary-route-smoke-dead-ui-guard-v1.md):
 * lock in the product-honesty wins from PR #121 (placeholder cleanup / dead
 * CTA removal) and PR #125 (always-on Sample affordance) so the following
 * regressions can never silently return to a primary route:
 *
 *   - dead CTA / dead link (`href="#"`, empty `href=""`)
 *   - user-visible placeholder leaks (lorem ipsum, untranslated `[XX]` tags)
 *   - a renamed/deleted primary route page (primary-flow render regression)
 *
 * Design principle — STABLE, NOT BRITTLE:
 * the HARD-FAIL set is restricted to tokens that are NEVER honest and that are
 * verifiably absent at the baseline this guard was added on. Ambiguous-but-
 * honest states the doctrine explicitly allows (a clearly-marked `Sample` /
 * `Preview` / `Ruošiama` label, an honest "coming soon" status, an empty-state
 * "Čia bus …" sentence) are INVENTORIED for the owner report, never failed.
 * That is why this guard does not re-flag copy that already passed review.
 *
 * This module is pure (node:fs + node:path only). It is consumed by:
 *   - lib/guards/primary-route-smoke.test.ts  (vitest regression gate)
 *   - scripts/check-primary-route-smoke.ts     (owner-facing QA report + CI gate)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** A route the guard treats as part of the primary public / role flow. */
export interface PrimaryRoute {
  /** Stable id used in the inventory + report. */
  readonly id: string;
  /** Human URL pattern (locale prefix omitted for readability). */
  readonly urlPattern: string;
  /** Source file relative to apps/web — asserted to exist on disk. */
  readonly sourceFile: string;
  /** Whether the route sits behind auth (static/source-level smoke only). */
  readonly requiresAuth: boolean;
  /** Coarse grouping for the report. */
  readonly kind: "public" | "auth" | "role-flow";
}

/**
 * Primary route inventory. Resolved from the real repo route tree; the doc's
 * initial scope mapped onto files that actually exist under
 * apps/web/app/[locale]. The test asserts every `sourceFile` exists, so a
 * rename/delete of a primary page is caught as a primary-flow regression.
 */
export const PRIMARY_ROUTES: readonly PrimaryRoute[] = [
  // Public / marketing
  { id: "landing", urlPattern: "/", sourceFile: "app/[locale]/(marketing)/page.tsx", requiresAuth: false, kind: "public" },
  { id: "for-workers", urlPattern: "/for-workers", sourceFile: "app/[locale]/(marketing)/for-workers/page.tsx", requiresAuth: false, kind: "public" },
  { id: "for-companies", urlPattern: "/for-companies", sourceFile: "app/[locale]/(marketing)/for-companies/page.tsx", requiresAuth: false, kind: "public" },
  { id: "for-agencies", urlPattern: "/for-agencies", sourceFile: "app/[locale]/(marketing)/for-agencies/page.tsx", requiresAuth: false, kind: "public" },
  { id: "pricing", urlPattern: "/pricing", sourceFile: "app/[locale]/(marketing)/pricing/page.tsx", requiresAuth: false, kind: "public" },
  { id: "vision", urlPattern: "/vision", sourceFile: "app/[locale]/(marketing)/vision/page.tsx", requiresAuth: false, kind: "public" },

  // Welcome / role choice
  { id: "onboarding", urlPattern: "/onboarding", sourceFile: "app/[locale]/onboarding/page.tsx", requiresAuth: false, kind: "public" },

  // Auth
  { id: "auth-login", urlPattern: "/auth/login", sourceFile: "app/[locale]/auth/login/page.tsx", requiresAuth: false, kind: "auth" },
  { id: "auth-signup", urlPattern: "/auth/signup", sourceFile: "app/[locale]/auth/signup/page.tsx", requiresAuth: false, kind: "auth" },
  { id: "auth-forgot-password", urlPattern: "/auth/forgot-password", sourceFile: "app/[locale]/auth/forgot-password/page.tsx", requiresAuth: false, kind: "auth" },
  { id: "auth-reset-password", urlPattern: "/auth/reset-password", sourceFile: "app/[locale]/auth/reset-password/page.tsx", requiresAuth: false, kind: "auth" },

  // Role flow (auth-gated; scanned at source level, no fake login)
  { id: "dashboard-hub", urlPattern: "/dashboard", sourceFile: "app/[locale]/dashboard/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "worker-start", urlPattern: "/dashboard/start", sourceFile: "app/[locale]/dashboard/start/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "company-start", urlPattern: "/dashboard/start/company", sourceFile: "app/[locale]/dashboard/start/company/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "agency-start", urlPattern: "/dashboard/start/agency", sourceFile: "app/[locale]/dashboard/start/agency/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "buyer-start", urlPattern: "/dashboard/start/buyer", sourceFile: "app/[locale]/dashboard/start/buyer/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "company-dashboard", urlPattern: "/dashboard/company", sourceFile: "app/[locale]/dashboard/company/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "agency-dashboard", urlPattern: "/dashboard/agency", sourceFile: "app/[locale]/dashboard/agency/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "buyer-dashboard", urlPattern: "/dashboard/buyer", sourceFile: "app/[locale]/dashboard/buyer/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "profile", urlPattern: "/dashboard/profile", sourceFile: "app/[locale]/dashboard/profile/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "journal", urlPattern: "/dashboard/journal", sourceFile: "app/[locale]/dashboard/journal/page.tsx", requiresAuth: true, kind: "role-flow" },
  { id: "inbox", urlPattern: "/dashboard/inbox", sourceFile: "app/[locale]/dashboard/inbox/page.tsx", requiresAuth: true, kind: "role-flow" },
];

/** A single guard finding. `severity: "block"` fails the test + CI gate. */
export interface Finding {
  readonly category: "dead-link" | "copy-leak" | "missing-route";
  readonly severity: "block";
  readonly file: string;
  readonly line: number;
  readonly evidence: string;
  readonly why: string;
}

/** Report-only inventory rows (never fail the build; surfaced for owner review). */
export interface InventoryRow {
  readonly token: string;
  readonly file: string;
  readonly line: number;
  readonly excerpt: string;
}

export interface SmokeReport {
  readonly routes: readonly PrimaryRoute[];
  readonly findings: readonly Finding[];
  /** Honest, explicitly-allowed states (Sample / Preview / Ruošiama / coming soon). */
  readonly honestStates: readonly InventoryRow[];
  /** Strong-claim words in copy that need real evidence — owner review surface. */
  readonly claimSurface: readonly InventoryRow[];
}

/* -------------------------------------------------------------------------- */
/* Detection rules                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Bare/empty href = dead link. A real fragment anchor (`href="#main-content"`)
 * or any real path is NOT matched — only an empty value or a lone `#`.
 * Covers string and `{...}` JSX expression forms, plus the `to=` prop.
 */
const DEAD_LINK_RE =
  /\b(?:href|to)\s*=\s*(?:"#"|'#'|""|''|\{\s*["'](?:#)?["']\s*\})/g;

/** Tokens that are NEVER honest user-visible copy. Verified absent at baseline. */
const COPY_LEAK_RULES: readonly { re: RegExp; why: string }[] = [
  { re: /\blorem\b|lipsum|dolor sit amet/i, why: "Lorem-ipsum filler text leaked into user-visible copy" },
  { re: /\[(?:EN|DE|DA|LT|LV|ET|NL|NO|PL|SV)\]/, why: "Untranslated locale-tag leak shown to the user" },
];

/**
 * Honest, doctrine-allowed states. These are inventoried, NOT failed — a clearly
 * marked sample/preview/coming-soon is permitted (doc §"GUARD TURI TIKRINTI").
 */
const HONEST_STATE_RE =
  /\bSample\b|\bPreview\b|\bRuošiama\b|\bRuosiama\b|\bDemo\b|coming soon|\bPavyzdys\b|\bČia bus\b/i;

/**
 * Strong product claims that require real evidence. Report-only review surface:
 * the doctrine asks that each be backed by a real function or marked sample,
 * but blanket-failing them would be brittle, so the owner reviews the list.
 */
const CLAIM_RE =
  /\bverified\b|\bguaranteed\b|\binstant hiring\b|real-?time market intelligence|\bAI matching\b|trusted score/i;

/* -------------------------------------------------------------------------- */
/* File walking                                                               */
/* -------------------------------------------------------------------------- */

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);

function walkSource(dir: string, acc: string[]): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walkSource(full, acc);
    } else if (/\.(tsx|ts)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function lineOf(body: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < body.length; i++) {
    if (body[i] === "\n") line++;
  }
  return line;
}

/* -------------------------------------------------------------------------- */
/* Scanners                                                                   */
/* -------------------------------------------------------------------------- */

/** Recursively walk a parsed JSON value, invoking `cb` on every leaf string. */
function eachStringValue(
  node: unknown,
  path: string,
  cb: (value: string, keyPath: string) => void,
): void {
  if (typeof node === "string") {
    cb(node, path);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => eachStringValue(v, `${path}[${i}]`, cb));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      eachStringValue(v, path ? `${path}.${k}` : k, cb);
    }
  }
}

/** UI source roots scanned for dead links + honest/claim inventory. */
const UI_DIRS = ["app", "components"];
/** Primary-locale message catalogs scanned for copy leaks (user-visible values). */
const MESSAGE_FILES = ["messages/en.json", "messages/lt.json"];

/**
 * Run the full primary-route smoke scan.
 * @param webRoot absolute path to apps/web
 */
export function scanPrimaryRouteSmoke(webRoot: string): SmokeReport {
  const findings: Finding[] = [];
  const honestStates: InventoryRow[] = [];
  const claimSurface: InventoryRow[] = [];

  // 1. Route inventory integrity — a missing primary page is a flow regression.
  for (const route of PRIMARY_ROUTES) {
    if (!existsSync(resolve(webRoot, route.sourceFile))) {
      findings.push({
        category: "missing-route",
        severity: "block",
        file: route.sourceFile,
        line: 0,
        evidence: route.id,
        why: `Primary route "${route.id}" (${route.urlPattern}) source file is missing or renamed`,
      });
    }
  }

  // 2. Scan the UI source tree for dead links + honest/claim inventory.
  const files: string[] = [];
  for (const d of UI_DIRS) walkSource(resolve(webRoot, d), files);

  for (const full of files) {
    const rel = relative(webRoot, full).split(sep).join("/");
    const body = readFileSync(full, "utf-8");

    DEAD_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DEAD_LINK_RE.exec(body)) !== null) {
      findings.push({
        category: "dead-link",
        severity: "block",
        file: rel,
        line: lineOf(body, m.index),
        evidence: m[0],
        why: "Dead link / dead CTA: bare `#` or empty href has no real target",
      });
    }

    body.split("\n").forEach((text, i) => {
      if (HONEST_STATE_RE.test(text)) {
        const hit = text.match(HONEST_STATE_RE);
        honestStates.push({ token: hit ? hit[0] : "", file: rel, line: i + 1, excerpt: text.trim().slice(0, 160) });
      }
      if (CLAIM_RE.test(text)) {
        const hit = text.match(CLAIM_RE);
        claimSurface.push({ token: hit ? hit[0] : "", file: rel, line: i + 1, excerpt: text.trim().slice(0, 160) });
      }
    });
  }

  // 3. Scan primary-locale message catalogs for copy leaks (values only, not keys).
  for (const mf of MESSAGE_FILES) {
    const abs = resolve(webRoot, mf);
    if (!existsSync(abs)) continue;
    const json = JSON.parse(readFileSync(abs, "utf-8")) as unknown;
    eachStringValue(json, "", (value, keyPath) => {
      for (const rule of COPY_LEAK_RULES) {
        if (rule.re.test(value)) {
          findings.push({
            category: "copy-leak",
            severity: "block",
            file: `${mf}#${keyPath}`,
            line: 0,
            evidence: value.slice(0, 120),
            why: rule.why,
          });
        }
      }
    });
  }

  return { routes: PRIMARY_ROUTES, findings, honestStates, claimSurface };
}

/** Convenience: only the build-blocking findings. */
export function blockingFindings(report: SmokeReport): readonly Finding[] {
  return report.findings.filter((f) => f.severity === "block");
}
