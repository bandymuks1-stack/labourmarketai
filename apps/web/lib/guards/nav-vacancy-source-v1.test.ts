import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  getSourceProfile,
  isExternalSourceActive,
} from "../intelligence/source-governance";

/**
 * Official Vacancy Source — NAV Norway v1 GUARDS. Pin the shipped-dark
 * contract: registry OFF, draft migration unapplied, single ingestion path,
 * no scraping, no contact-data persistence, honest dark display, i18n
 * completeness. A silent flip of any of these must fail CI loudly.
 */

const WEB = resolve(__dirname, "..", "..");
const REPO = resolve(WEB, "..", "..");
const read = (rel: string) => readFileSync(resolve(WEB, rel), "utf8");
const readRepo = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

const MIGRATION = "supabase/migrations/20260717170000_external_vacancies_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260717170000_external_vacancies_v1.down.sql";

// ── 1. Source registry ships OFF / unconfirmed / proposed-only ────────────
describe("nav_arbeidsplassen registry profile ships fail-closed", () => {
  it("is registered but off, unconfirmed, proposed-only, policy-less", () => {
    const p = getSourceProfile("nav_arbeidsplassen");
    expect(p).not.toBeNull();
    expect(p!.activation).toBe("off");
    expect(p!.legalStatus).toBe("unconfirmed");
    expect(p!.proposedOnly).toBe(true);
    expect(p!.attributionRequired).toBe(true);
    expect(p!.homepage).toBe("arbeidsplassen.nav.no");
    expect(p!.sourceKind).toBe("public_official");
    expect(p!.importPolicy).toBeNull();
    expect(isExternalSourceActive("nav_arbeidsplassen")).toBe(false);
  });
});

// ── 2. Migration is a paired DRAFT, never silently applied ────────────────
describe("external_vacancies migration is a human-gated DRAFT with rollback", () => {
  it("migration + paired rollback exist with the mandatory headers", () => {
    const sql = readRepo(MIGRATION);
    expect(sql).toContain("DRAFT — needs-human-gate — DO NOT APPLY");
    expect(sql).toContain("@human-gate-approved");
    expect(sql).toContain("ROLLBACK: paired supabase/rollbacks/");
    expect(existsSync(resolve(REPO, ROLLBACK))).toBe(true);
    const down = readRepo(ROLLBACK);
    expect(down).toContain("drop table if exists public.external_vacancies");
  });

  it("RLS: authenticated SELECT of ACTIVE rows only; no client write policy", () => {
    const sql = readRepo(MIGRATION).toLowerCase();
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/for select\s+to authenticated\s+using \(status = 'active'\)/);
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete)/);
    expect(sql).toContain(
      "revoke insert, update, delete on public.external_vacancies from authenticated",
    );
    expect(sql).not.toMatch(/\bto anon\b/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
  });

  it("idempotency + honesty columns are pinned", () => {
    const sql = readRepo(MIGRATION).toLowerCase();
    expect(sql).toContain("unique (source_key, source_vacancy_id)");
    expect(sql).toContain("unique (source_key, content_hash)");
    expect(sql).toMatch(/status\s+text not null default 'active' check \(status in \('active','inactive'\)\)/);
    // No contact columns of any kind — check EXECUTABLE SQL only (the
    // header prose deliberately explains WHY contacts are not stored).
    const executable = readRepo(MIGRATION)
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
      .toLowerCase();
    expect(executable).not.toMatch(/contact/);
  });
});

// ── 3. Single vacancy module — ONE ingestion path, read-only app access ───
describe("single ingestion path for external_vacancies", () => {
  const scanRoots = ["lib", "app", "components"];
  const offenders: string[] = [];
  const readers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        const src = readFileSync(full, "utf8");
        if (/\.from\(\s*["']external_vacancies["']\s*\)/.test(src)) {
          readers.push(full.replace(/\\/g, "/"));
          if (
            /\.(insert|upsert|update|delete)\s*\(/.test(src)
          ) {
            offenders.push(full.replace(/\\/g, "/"));
          }
        }
      }
    }
  };
  for (const root of scanRoots) walk(resolve(WEB, root));

  it("only lib/vacancy-sources/read.ts queries the table, and only reads", () => {
    expect(readers).toHaveLength(1);
    expect(readers[0]).toMatch(/lib\/vacancy-sources\/read\.ts$/);
    expect(offenders).toHaveLength(0);
  });

  it("the read helper is double-gated: registry activation + 42P01 probe", () => {
    const src = read("lib/vacancy-sources/read.ts");
    expect(src).toContain("isExternalSourceActive");
    expect(src).toContain("42P01");
    expect(src).toContain('"server-only"');
  });
});

// ── 4. Pure layer stays pure; no scraping anywhere in the slice ───────────
describe("no HTTP in the pure layer, no scraping stack anywhere", () => {
  const pureFiles = [
    "lib/vacancy-sources/nav-feed-contract.ts",
    "lib/vacancy-sources/normalize.ts",
    "lib/vacancy-sources/nav-fixtures.ts",
  ];
  const sliceFiles = [
    ...pureFiles,
    "lib/vacancy-sources/read.ts",
    "scripts/nav-vacancy-dry-run.ts",
    "scripts/nav-vacancy-import.ts",
    "components/app/external-vacancies-section.tsx",
  ];

  it("pure modules perform no fetch/network IO", () => {
    for (const f of pureFiles) {
      const src = read(f);
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/node:https?|axios|undici/);
    }
  });

  it("no scraping/browser-automation libraries or job-board scraping targets", () => {
    for (const f of sliceFiles) {
      const src = read(f).toLowerCase();
      expect(src, f).not.toMatch(/cheerio|puppeteer|playwright|jsdom/);
      expect(src, f).not.toMatch(/linkedin|indeed\.|finn\.no/);
    }
  });

  it("HTTP lives only in the operator scripts and is host-pinned + bounded", () => {
    for (const f of ["scripts/nav-vacancy-dry-run.ts", "scripts/nav-vacancy-import.ts"]) {
      const src = read(f);
      expect(src, f).toContain("host_not_pinned");
      expect(src, f).toContain("shouldContinuePaging");
      expect(src, f).toContain("NAV_IMPORT_BOUNDS.requestTimeoutMs");
      expect(src, f).toContain("NAV_IMPORT_BOUNDS.maxResponseBytes");
      expect(src, f).toContain('redirect: "error"');
      // Scripts never touch the DB or its secrets.
      expect(src, f).not.toMatch(/@supabase|SUPABASE_|service_role/i);
    }
  });
});

// ── 5. Import script is triple-gated fail-closed ──────────────────────────
describe("nav-vacancy-import.ts refuses without env + token + activation", () => {
  it("carries all three gates and exits non-zero on each", () => {
    const src = read("scripts/nav-vacancy-import.ts");
    expect(src).toContain("NAV_SOURCE_ENABLED");
    expect(src).toContain("NAV_KILL_SWITCH");
    expect(src).toContain("NAV_FEED_TOKEN");
    expect(src).toContain("validateExternalImport");
    const exits = src.match(/process\.exit\(1\)/g) ?? [];
    expect(exits.length).toBeGreaterThanOrEqual(3);
    // Never writes: emit-only.
    expect(src).toContain("writeFileSync");
  });

  it("the dry-run never persists and says so", () => {
    const src = read("scripts/nav-vacancy-dry-run.ts");
    expect(src).toContain("persisted: false");
    expect(src).not.toMatch(/@supabase|SUPABASE_/);
  });
});

// ── 6. Display ships dark, separated, source-badged, deep-linked ──────────
describe("external vacancies display integration", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");
  const component = read("components/app/external-vacancies-section.tsx");

  it("page renders the section ONLY when available AND non-empty, AFTER the internal list", () => {
    expect(page).toContain(
      "externalVacancies.available && externalVacancies.rows.length > 0",
    );
    const internalIdx = page.indexOf('data-testid="opportunities-list"');
    const externalIdx = page.indexOf("<ExternalVacanciesSection");
    expect(internalIdx).toBeGreaterThan(-1);
    expect(externalIdx).toBeGreaterThan(internalIdx);
  });

  it("the CTA is an external deep link with safe rel, badge present, no coming-soon", () => {
    expect(component).toContain('target="_blank"');
    expect(component).toContain('rel="noopener noreferrer"');
    expect(component).toContain("applicationUrl ?? row.canonicalSourceUrl");
    expect(component).toContain("external-vacancies-source-badge");
    expect(component.toLowerCase()).not.toContain("coming soon");
    expect(component.toLowerCase()).not.toContain("netrukus");
  });

  it("no internal-demand mixing: the component never touches matching or interest", () => {
    expect(component).not.toMatch(/match-v1|matchWorkerToNeed|WorkerInterestButton|customer_requests/);
    // And no contact data is ever rendered.
    expect(component.toLowerCase()).not.toContain("contact");
  });
});

// ── 7. i18n completeness across the 5 ACTIVE locales ──────────────────────
describe("nav i18n keys exist in lt/en/ru/nl/de", () => {
  const locales = ["lt", "en", "ru", "nl", "de"] as const;
  for (const locale of locales) {
    it(`${locale}.json carries the source + section keys, non-empty`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        intelligence: {
          sources: {
            navArbeidsplassen?: string;
            key: Record<string, string>;
            terms: Record<string, string>;
          };
        };
        opportunities: { externalVacancies?: Record<string, string> };
      };
      const sources = messages.intelligence.sources;
      expect(sources.navArbeidsplassen ?? "").not.toBe("");
      expect(sources.key.nav_arbeidsplassen ?? "").not.toBe("");
      expect(sources.terms.navArbeidsplassen ?? "").not.toBe("");
      const ext = messages.opportunities.externalVacancies;
      expect(ext).toBeDefined();
      for (const key of [
        "title",
        "sourceBadge",
        "intro",
        "published",
        "expires",
        "cta",
        "externalNote",
      ]) {
        expect(ext![key] ?? "", `${locale}:${key}`).not.toBe("");
      }
      expect(ext!.sourceBadge).toContain("arbeidsplassen.no (NAV)");
    });
  }
});

// ── 8. Env + doc are in place ─────────────────────────────────────────────
describe("env convention + governance doc", () => {
  it("env.ts documents NAV_FEED_TOKEN + NAV_SOURCE_ENABLED (+ kill switch)", () => {
    const src = read("lib/env.ts");
    expect(src).toContain("NAV_FEED_TOKEN");
    expect(src).toContain("NAV_SOURCE_ENABLED");
    expect(src).toContain("NAV_KILL_SWITCH");
  });

  it("the source-governance doc records the official gate evidence", () => {
    const doc = readRepo("docs/intelligence/official-vacancy-source-nav-norway-v1.md");
    expect(doc).toContain("arbeidsplassen.nav.no/vilkar-api");
    expect(doc).toContain("REQUIRES_OWNER_ACTION");
    expect(doc).toContain("nav.team.arbeidsplassen@nav.no");
    expect(doc).toContain("2026-07-17");
    expect(doc).toContain("Activation runbook");
    expect(doc).toContain("Deferred source register");
  });
});
