/**
 * Guard — LABOUR MARKET INTELLIGENCE boundary (Intelligence Layer v1).
 *
 * Pins the intelligence layer's hard boundaries:
 *   (a) no file under lib/intelligence contains network code — no `fetch(`,
 *       no http(s) URL literal, no AI provider host, and no import from
 *       lib/ai/runtime/providers (business logic never calls a vendor);
 *   (b) no file under lib/intelligence imports an LLM SDK
 *       (@anthropic-ai/sdk / openai) — providers/anthropic.ts stays the
 *       single SDK importer (mirrors ai-task-routing guard (c));
 *   (c) source governance keeps EVERY external source profile inactive:
 *       activation "off", proposed-only, isExternalSourceActive false —
 *       flipping one on is an OWNER decision, not a code drive-by;
 *   (d) intelligence-read.ts is the only server module and declares
 *       `import "server-only"`; every other module stays pure (no
 *       server-only, no process.env, no supabase import);
 *   (e) no numeric salary benchmark is hardcoded in source: the pattern
 *       `valueEur:` followed by a digit literal must not appear outside
 *       tests (§18 no invented numbers — benchmarks come from data).
 *
 * Pure source assertions. Runs in CI via `pnpm -F web test`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTELLIGENCE_SOURCE_PROFILES,
  allExternalSourcesOff,
  isExternalSourceActive,
} from "../intelligence/source-governance";
import {
  evaluateMetricPermission,
  isKnownMetricKey,
} from "../intelligence/metric-keys";

const APP_ROOT = join(__dirname, "..", "..");
const INTEL_DIR = join(APP_ROOT, "lib", "intelligence");
const read = (p: string) => readFileSync(p, "utf8");
/** Strip block + line comments so scans check real CODE only. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.(ts|tsx)$/.test(abs)) acc.push(abs);
  }
  return acc;
}

const rel = (abs: string) => abs.slice(APP_ROOT.length + 1).replace(/\\/g, "/");

const intelSources = () =>
  walk(INTEL_DIR).filter((f) => !/\.test\.tsx?$/.test(f));

// ── (a) no network code, no vendor hosts, no provider imports ───────────────

const PROVIDER_HOSTS =
  /api\.openai\.com|api\.anthropic\.com|api\.deepl\.com|api-free\.deepl\.com|generativelanguage\.googleapis\.com|api\.x\.ai/;
const URL_LITERAL = /https?:\/\//;
const PROVIDER_IMPORT = /["']@\/lib\/ai\/runtime\/providers(?:\/[^"']*)?["']/;

describe("(a) lib/intelligence contains no network code and never touches AI providers", () => {
  it("no fetch(, no http(s):// literal, no provider host, no runtime/providers import", () => {
    const files = intelSources();
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const src = code(read(file));
      if (
        /\bfetch\s*\(|XMLHttpRequest|node:https?\b/.test(src) ||
        URL_LITERAL.test(src) ||
        PROVIDER_HOSTS.test(src) ||
        PROVIDER_IMPORT.test(src)
      ) {
        offenders.push(rel(file));
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the detectors are real", () => {
    expect(/\bfetch\s*\(/.test('await fetch("x")')).toBe(true);
    expect(URL_LITERAL.test('const u = "https://example.com";')).toBe(true);
    expect(PROVIDER_HOSTS.test("https://api.openai.com/v1")).toBe(true);
    expect(
      PROVIDER_IMPORT.test('import { x } from "@/lib/ai/runtime/providers/anthropic";'),
    ).toBe(true);
  });
});

// ── (b) no LLM SDK import ────────────────────────────────────────────────────

const LLM_SDK_IMPORT =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai)(?:\/[^"']*)?["']/;

describe("(b) lib/intelligence never imports an LLM SDK", () => {
  it("no @anthropic-ai/sdk or openai import", () => {
    const offenders = intelSources()
      .filter((f) => LLM_SDK_IMPORT.test(read(f)))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── (c) every external source stays OFF ─────────────────────────────────────

describe("(c) source governance keeps every external source outside the owner-activated set inactive", () => {
  // Owner-ACTIVATED externals: eurostat (metrics, 2026-07-15) and
  // arbetsformedlingen (vacancies, 2026-08-09 —
  // docs/human-gates/arbetsformedlingen-activation-gate.md).
  //
  // This guard pins INACTIVITY, not ignorance. It used to also assert that
  // every other external source was `unconfirmed` + `proposedOnly` — but
  // those were proxies for "not active", and they stopped being true the
  // moment a provider actually answered us. Recording an answered provider
  // as `unconfirmed` would be a lie in the registry, and lying to satisfy a
  // guard is the worst of both worlds.
  //
  // The property that carries the safety is unchanged and asserted directly:
  // NO external source outside the recorded owner-activated set is active,
  // whatever its legal status says — activation is a separate decision.
  it("no external profile outside {eurostat, arbetsformedlingen} is ACTIVE", () => {
    const ACTIVATED = new Set(["eurostat", "arbetsformedlingen"]);
    const external = INTELLIGENCE_SOURCE_PROFILES.filter(
      (p) => p.sourceKind !== "internal_aggregated" && !ACTIVATED.has(p.key),
    );
    expect(external.length).toBeGreaterThan(0);
    for (const p of external) {
      expect(p.activation, `${p.key} activation`).not.toBe("on");
      expect(isExternalSourceActive(p.key), `${p.key} active`).toBe(false);
    }
  });

  it("a source may only be confirmed-but-inactive, never active-but-unconfirmed", () => {
    // The dangerous combination is importing from a source whose terms were
    // never established. The safe one — permission granted, activation still
    // pending — is legitimate and must stay expressible.
    for (const p of INTELLIGENCE_SOURCE_PROFILES) {
      if (p.sourceKind === "internal_aggregated") continue;
      if (p.activation === "on") {
        expect(p.legalStatus, `${p.key} active but not confirmed`).toBe(
          "confirmed",
        );
      }
      // A source whose provider has answered is no longer a proposal.
      if (p.legalStatus === "confirmed") {
        expect(p.proposedOnly, `${p.key} confirmed yet proposedOnly`).toBe(
          false,
        );
      }
    }
  });

  it("arbetsformedlingen is provider-confirmed AND owner-activated — both facts recorded", () => {
    const p = INTELLIGENCE_SOURCE_PROFILES.find(
      (x) => x.key === "arbetsformedlingen",
    )!;
    // Provider permission: recorded (CC0, keyless, no prior notification).
    expect(p.legalStatus).toBe("confirmed");
    expect(p.proposedOnly).toBe(false);
    expect(p.attributionRequired).toBe(true);
    // Owner activation: approved 2026-08-09
    // (docs/human-gates/arbetsformedlingen-activation-gate.md). The runtime
    // env switch remains the second, independent gate.
    expect(p.activation).toBe("on");
    expect(isExternalSourceActive("arbetsformedlingen")).toBe(true);
  });

  it("the active external set is EXACTLY {eurostat, arbetsformedlingen} — nothing rides along", () => {
    const p = INTELLIGENCE_SOURCE_PROFILES.find((x) => x.key === "eurostat")!;
    expect(p.activation).toBe("on");
    expect(p.legalStatus).toBe("confirmed");
    expect(p.proposedOnly).toBe(false);
    expect(isExternalSourceActive("eurostat")).toBe(true);
    // Exactly the two owner-approved externals — a third key appearing here
    // means a source was activated without a recorded owner decision.
    const activeExternals = INTELLIGENCE_SOURCE_PROFILES.filter(
      (x) => x.sourceKind !== "internal_aggregated" && isExternalSourceActive(x.key),
    );
    expect(activeExternals.map((x) => x.key).sort()).toEqual([
      "arbetsformedlingen",
      "eurostat",
    ]);
    // allExternalSourcesOff reflects the activation
    expect(allExternalSourcesOff()).toBe(false);
  });

  it("metric import policy stays fail-closed: non-eurostat externals unrecorded, no wildcard anywhere, no allow-all escape", () => {
    for (const p of INTELLIGENCE_SOURCE_PROFILES) {
      if (p.key === "eurostat") {
        // The owner recorded eurostat's policy at activation — the four
        // Eurostat labour metrics, all canonical, no wildcard.
        expect(p.importPolicy, "eurostat importPolicy").not.toBeNull();
        expect(p.importPolicy!.metricKeys.length).toBeGreaterThan(0);
        for (const key of p.importPolicy!.metricKeys) {
          expect(isKnownMetricKey(key), `eurostat:${key}`).toBe(true);
          expect(key).not.toContain("*");
        }
      } else if (p.sourceKind !== "internal_aggregated") {
        // Every OTHER external source has NO recorded policy — even
        // activation would import nothing. This pin fails if code pre-fills it.
        expect(p.importPolicy, `${p.key} importPolicy`).toBeNull();
      } else {
        // Internal policies are explicit, non-empty canonical subsets —
        // never a wildcard, never "allow all".
        expect(p.importPolicy, `${p.key} importPolicy`).not.toBeNull();
        expect(p.importPolicy!.metricKeys.length).toBeGreaterThan(0);
        for (const key of p.importPolicy!.metricKeys) {
          expect(isKnownMetricKey(key), `${p.key}:${key}`).toBe(true);
          expect(key).not.toContain("*");
        }
      }
    }
    // The evaluator itself refuses wildcard permission grammar.
    expect(
      evaluateMetricPermission({ metricKeys: ["*"] } as never, "salary.month.gross"),
    ).toBe("import_policy_malformed");
  });
});

// ── (d) server/pure split ────────────────────────────────────────────────────

const SERVER_MODULES = ["lib/intelligence/intelligence-read.ts"];

describe("(d) intelligence-read.ts is the only server module; the rest stay pure", () => {
  it('intelligence-read.ts declares import "server-only"', () => {
    const abs = join(APP_ROOT, SERVER_MODULES[0]);
    expect(existsSync(abs), `${SERVER_MODULES[0]} missing`).toBe(true);
    expect(read(abs)).toMatch(/import\s+["']server-only["']/);
  });

  it("every other module has no server-only / process.env / supabase import", () => {
    const offenders: string[] = [];
    for (const file of intelSources()) {
      const r = rel(file);
      if (SERVER_MODULES.includes(r)) continue;
      const src = code(read(file));
      if (
        /["']server-only["']/.test(src) ||
        /process\.env/.test(src) ||
        /["']@\/lib\/supabase\//.test(src) ||
        /["']@supabase\//.test(src)
      ) {
        offenders.push(r);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── (e) no hardcoded benchmark number ────────────────────────────────────────

const HARDCODED_BENCHMARK = /valueEur:\s*[0-9]/;

describe("(e) no numeric salary benchmark literal in lib/intelligence source", () => {
  it("`valueEur:` followed by a digit appears in tests only", () => {
    const offenders = intelSources()
      .filter((f) => HARDCODED_BENCHMARK.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the detector is real", () => {
    expect(HARDCODED_BENCHMARK.test("valueEur: 2100,")).toBe(true);
    expect(HARDCODED_BENCHMARK.test("valueEur: medianValue,")).toBe(false);
  });
});
