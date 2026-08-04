/**
 * Guard — PUBLIC VACANCY SOURCE boundary.
 *
 * The vacancy pipeline is the second external-ingest path in the codebase.
 * The first one (Eurostat) is protected by intelligence-boundary.test.ts; this
 * guard gives the second one the SAME protections, so the two cannot drift
 * into two different safety standards.
 *
 * Pins:
 *   (a) lib/vacancy-sources/** is PURE — no fetch, no http(s) URL literal, no
 *       process.env, no supabase import, no server-only. Every network
 *       capability lives in lib/vacancy-import/**;
 *   (b) no LLM SDK anywhere in either layer — categorization is the
 *       platform's deterministic recognizer, and doctrine §7 depends on that
 *       staying true;
 *   (c) every provider is OWNER-GATED in source governance: unconfirmed, off,
 *       proposed-only, no import policy, and inactive. Flipping one on is an
 *       owner decision, not a code drive-by;
 *   (d) the adapter is the ONLY module that calls fetch, and it is
 *       server-only;
 *   (e) the pipeline never grows a second matching engine — the MatchNeed
 *       bridge is the one way an imported vacancy reaches matching;
 *   (f) provider keys are confined to the registry and the provider folder,
 *       so a shared stage can never become country-aware;
 *   (g) the kill switch is fail-closed: no default that makes a provider
 *       operational without an explicit env flip.
 *
 * Pure source assertions. Runs in CI via `pnpm -F web test`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  INTELLIGENCE_SOURCE_PROFILES,
  isExternalSourceActive,
} from "../intelligence/source-governance";
import { VACANCY_PROVIDERS } from "../vacancy-sources/vacancy-provider-registry";
import { evaluateVacancySwitch } from "../vacancy-import/vacancy-kill-switch";

const APP_ROOT = join(__dirname, "..", "..");
const PURE_DIR = join(APP_ROOT, "lib", "vacancy-sources");
const SERVER_DIR = join(APP_ROOT, "lib", "vacancy-import");

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
const sourcesIn = (dir: string) =>
  walk(dir).filter((f) => !/\.test\.tsx?$/.test(f));

// ── (a) the pure layer is pure ───────────────────────────────────────────────

const URL_LITERAL = /https?:\/\//;

describe("(a) lib/vacancy-sources is pure — no network, no env, no DB", () => {
  it("the layer exists and has modules", () => {
    expect(sourcesIn(PURE_DIR).length).toBeGreaterThan(0);
  });

  it("no fetch(, no http(s):// literal, no process.env, no supabase, no server-only", () => {
    const offenders: string[] = [];
    for (const file of sourcesIn(PURE_DIR)) {
      const src = code(read(file));
      if (
        /\bfetch\s*\(|XMLHttpRequest|node:https?\b/.test(src) ||
        URL_LITERAL.test(src) ||
        /process\.env/.test(src) ||
        /["']server-only["']/.test(src) ||
        /["']@\/lib\/supabase\//.test(src) ||
        /["']@supabase\//.test(src)
      ) {
        offenders.push(rel(file));
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the detectors are real", () => {
    expect(/\bfetch\s*\(/.test('await fetch("x")')).toBe(true);
    expect(URL_LITERAL.test('const u = "https://example.se";')).toBe(true);
    expect(/process\.env/.test("process.env.FOO")).toBe(true);
  });
});

// ── (b) no LLM SDK in either layer ───────────────────────────────────────────

const LLM_SDK_IMPORT =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai)(?:\/[^"']*)?["']/;

describe("(b) categorization is deterministic — no LLM SDK in the pipeline", () => {
  it("neither layer imports an LLM SDK", () => {
    const offenders = [...sourcesIn(PURE_DIR), ...sourcesIn(SERVER_DIR)]
      .filter((f) => LLM_SDK_IMPORT.test(read(f)))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("neither layer imports an AI runtime provider", () => {
    const PROVIDER_IMPORT = /["']@\/lib\/ai\/runtime\/providers(?:\/[^"']*)?["']/;
    const offenders = [...sourcesIn(PURE_DIR), ...sourcesIn(SERVER_DIR)]
      .filter((f) => PROVIDER_IMPORT.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── (c) every provider stays owner-gated ─────────────────────────────────────

describe("(c) every vacancy provider is OWNER-GATED in source governance", () => {
  it("each provider has a governance row that is NOT active", () => {
    // Provider permission and OUR activation are separate decisions. A
    // provider may have confirmed its terms (Arbetsförmedlingen has: CC0,
    // keyless, no prior notification) and still import nothing, because
    // activation needs a persistence schema and an operator flip.
    expect(VACANCY_PROVIDERS.length).toBeGreaterThan(0);
    for (const provider of VACANCY_PROVIDERS) {
      const profile = INTELLIGENCE_SOURCE_PROFILES.find(
        (p) => p.key === provider.governanceSourceKey,
      );
      expect(profile, `${provider.key} governance row`).toBeTruthy();
      expect(profile!.activation, `${provider.key} activation`).not.toBe("on");
      expect(profile!.importPolicy, `${provider.key} importPolicy`).toBeNull();
      expect(
        isExternalSourceActive(provider.key),
        `${provider.key} active`,
      ).toBe(false);
    }
  });

  it("arbetsformedlingen records the provider's actual answer, not a placeholder", () => {
    const profile = INTELLIGENCE_SOURCE_PROFILES.find(
      (p) => p.key === "arbetsformedlingen",
    )!;
    expect(profile.legalStatus).toBe("confirmed");
    expect(profile.proposedOnly).toBe(false);
    expect(profile.activation).toBe("owner_review");
  });

  it("no vacancy provider endpoint requires an API key", () => {
    // JobTech is keyless. A descriptor that started demanding one would be a
    // silent request for a secret we were told we do not need.
    for (const provider of VACANCY_PROVIDERS) {
      for (const endpoint of provider.endpoints) {
        expect(
          endpoint.requiresApiKey,
          `${provider.key}/${endpoint.channel}`,
        ).toBe(false);
      }
    }
  });

  it("a provider that requires attribution names it with an i18n code", () => {
    for (const provider of VACANCY_PROVIDERS) {
      const profile = INTELLIGENCE_SOURCE_PROFILES.find(
        (p) => p.key === provider.governanceSourceKey,
      )!;
      if (profile.attributionRequired) {
        expect(provider.attributionCode, provider.key).toMatch(
          /^[a-zA-Z]+(\.[a-zA-Z]+)+$/,
        );
        // An i18n CODE, never a rendered display string.
        expect(provider.attributionCode).not.toMatch(/\s/);
      }
    }
  });
});

// ── (d) exactly one module may fetch ─────────────────────────────────────────

describe("(d) the adapter is the only module that touches the network", () => {
  it("exactly one file in lib/vacancy-import calls fetch(", () => {
    const fetchers = sourcesIn(SERVER_DIR)
      .filter((f) => /\bfetch\s*\(/.test(code(read(f))))
      .map(rel);
    expect(fetchers).toEqual(["lib/vacancy-import/vacancy-adapter.ts"]);
  });

  it("every module in lib/vacancy-import declares server-only", () => {
    const offenders = sourcesIn(SERVER_DIR)
      .filter((f) => !/import\s+["']server-only["']/.test(read(f)))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the adapter builds https origins only, and refuses redirects", () => {
    const src = read(join(SERVER_DIR, "vacancy-adapter.ts"));
    expect(src).toContain('redirect: "error"');
    expect(src).toContain('method: "GET"');
    expect(code(src)).not.toMatch(/http:\/\//);
  });
});

// ── (e) no second matching engine ────────────────────────────────────────────

describe("(e) the pipeline reuses the ONE matching engine", () => {
  it("only the MatchNeed bridge imports the matching contract", () => {
    const importers = sourcesIn(PURE_DIR)
      .filter((f) => /["']@\/lib\/market\/match-v1["']/.test(code(read(f))))
      .map(rel);
    expect(importers).toEqual(["lib/vacancy-sources/vacancy-need.ts"]);
  });

  it("the pipeline defines no scoring of its own", () => {
    // A percentage/score computed here would be a second, unattributable
    // opinion about fit — §19 allows exactly one.
    const offenders = sourcesIn(PURE_DIR)
      .filter((f) => !/vacancy-need\.ts$/.test(f))
      .filter((f) => /\b(computeFit|matchScore|fitPct|scorePercent)\b/.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("categorization delegates to the shared recognizer", () => {
    const src = read(join(PURE_DIR, "vacancy-categorization.ts"));
    expect(src).toMatch(/from\s+["']@\/lib\/market\/need-skills["']/);
  });
});

// ── (f) provider keys stay confined ──────────────────────────────────────────

describe("(f) shared stages never become country-aware", () => {
  it("no provider key appears in a shared pipeline module", () => {
    const allowed = new Set([
      "lib/vacancy-sources/vacancy-contract.ts",
      "lib/vacancy-sources/vacancy-provider-registry.ts",
    ]);
    const keys = VACANCY_PROVIDERS.map((p) => p.key);
    const offenders: string[] = [];
    for (const file of sourcesIn(PURE_DIR)) {
      const r = rel(file);
      // The provider's own folder is where country knowledge belongs.
      if (allowed.has(r) || r.includes("/providers/")) continue;
      const src = code(read(file));
      if (keys.some((k) => src.includes(k))) offenders.push(r);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the importer is provider-agnostic — it reaches providers through the dispatch", () => {
    const src = code(read(join(SERVER_DIR, "vacancy-importer.ts")));
    for (const provider of VACANCY_PROVIDERS) {
      expect(src, `importer mentions ${provider.key}`).not.toContain(
        provider.key,
      );
    }
    expect(src).toContain("getVacancyParser");
  });

  it("the adapter is provider-agnostic too", () => {
    const src = code(read(join(SERVER_DIR, "vacancy-adapter.ts")));
    for (const provider of VACANCY_PROVIDERS) {
      expect(src, `adapter mentions ${provider.key}`).not.toContain(
        provider.key,
      );
    }
  });
});

// ── (h) no second vacancy product ────────────────────────────────────────────

describe("(h) imported vacancies never become a second product", () => {
  it("the pipeline ships NO component — there is no second card to diverge", () => {
    const components = [...walk(PURE_DIR), ...walk(SERVER_DIR)].filter((f) =>
      f.endsWith(".tsx"),
    );
    expect(components.map(rel), components.join("\n")).toEqual([]);
  });

  it("exactly one module defines the presentation contract", () => {
    const definers = sourcesIn(PURE_DIR)
      .filter((f) => /toCanonicalOpportunityView/.test(code(read(f))))
      .map(rel);
    expect(definers).toEqual(["lib/vacancy-sources/vacancy-presentation.ts"]);
  });

  it("the pipeline never claims a client, partner or managed relationship", () => {
    // These are claims about a relationship an external public ad cannot
    // create. They must not appear as copy, codes, or field names.
    const FORBIDDEN =
      /officialPartner|recruitmentPartner|isClient|ourClient|managedByUs|verifiedEmployerClient/;
    const offenders = [...sourcesIn(PURE_DIR), ...sourcesIn(SERVER_DIR)]
      .filter((f) => FORBIDDEN.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── (i) no contact enrichment, no outreach transport, no persistence ─────────

describe("(i) the pipeline collects no contacts and sends nothing", () => {
  it("no contact-enrichment or scraping path exists", () => {
    const ENRICHMENT =
      /guessEmail|emailPattern|findContact|enrichContact|scrape|crawler|linkedin\.com|hunter\.io|clearbit/i;
    const offenders = [...sourcesIn(PURE_DIR), ...sourcesIn(SERVER_DIR)]
      .filter((f) => ENRICHMENT.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the outreach policy imports nothing that could send a message", () => {
    const src = code(
      read(join(PURE_DIR, "employer-outreach-policy.ts")),
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/nodemailer|resend|sendgrid|postmark|smtp/i);
    expect(src).not.toMatch(/["']@\/lib\/email/);
    expect(src).not.toMatch(/telegram/i);
    // It is pure: no imports at all.
    expect(src).not.toMatch(/^\s*import\s/m);
  });

  it("no module introduces a table, a migration or a DDL statement", () => {
    const DDL = /create\s+table|alter\s+table|insert\s+into|supabase\.from/i;
    const offenders = [...sourcesIn(PURE_DIR), ...sourcesIn(SERVER_DIR)]
      .filter((f) => DDL.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the server layer holds no supabase client either", () => {
    const offenders = sourcesIn(SERVER_DIR)
      .filter((f) => /["']@?\/?(lib\/supabase|@supabase)\//.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── (j) internal state names never reach a user ──────────────────────────────

describe("(j) technical state names stay internal", () => {
  it("no outreach or provenance enum value appears in a locale catalogue", () => {
    const INTERNAL = [
      "ineligible_too_new",
      "eligible_for_human_review",
      "approved_for_single_contact",
      "opted_out",
      "company_claimed",
      "unclaimed_external",
      "external_public_source",
      "source_original",
      "platform_internal",
    ];
    const messagesDir = join(APP_ROOT, "messages");
    const offenders: string[] = [];
    for (const file of walk(messagesDir).filter((f) => f.endsWith(".json"))) {
      const src = read(file);
      for (const name of INTERNAL) {
        if (src.includes(name)) offenders.push(`${rel(file)}: ${name}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the user-facing notes are i18n codes that exist in every locale", () => {
    const CODES = [
      "vacancySources.attribution.arbetsformedlingen",
      "vacancySources.provenance.externalPublicSource",
      "vacancySources.provenance.employerHasNotClaimed",
      "vacancySources.provenance.employerManagesHere",
    ];
    const messagesDir = join(APP_ROOT, "messages");
    const catalogues = readdirSync(messagesDir).filter((f) =>
      f.endsWith(".json"),
    );
    expect(catalogues.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const file of catalogues) {
      const json = JSON.parse(read(join(messagesDir, file))) as Record<
        string,
        unknown
      >;
      for (const codePath of CODES) {
        const value = codePath
          .split(".")
          .reduce<unknown>(
            (acc, key) =>
              acc && typeof acc === "object"
                ? (acc as Record<string, unknown>)[key]
                : undefined,
            json,
          );
        if (typeof value !== "string" || value.trim().length === 0) {
          missing.push(`${file}: ${codePath}`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});

// ── (g) the kill switch is fail-closed ───────────────────────────────────────

describe("(g) the kill switch fails closed", () => {
  it("no provider is operational in an empty environment", () => {
    for (const provider of VACANCY_PROVIDERS) {
      const state = evaluateVacancySwitch(provider.key, {});
      expect(state.operational, provider.key).toBe(false);
      expect(state.blockedReason, provider.key).toBe("provider_disabled");
    }
  });

  it("the env flag alone cannot import anything — governance is the second gate", () => {
    // Both gates are required. This asserts the pair explicitly so removing
    // either one fails here rather than silently in production.
    for (const provider of VACANCY_PROVIDERS) {
      const envOn = evaluateVacancySwitch(provider.key, {
        [`VACANCY_SOURCE_${provider.key.toUpperCase()}_ENABLED`]: "on",
      });
      expect(envOn.operational, provider.key).toBe(true);
      expect(isExternalSourceActive(provider.key), provider.key).toBe(false);
    }
  });
});
