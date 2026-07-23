import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Agency Direction A guard (owner decision, 2026-07-05).
 *
 * An agency/recruiter is a TYPED staffing-agency VIEW inside the canonical
 * COMPANY workspace — a company whose `companies.company_type` is
 * 'staffing_agency' (roles.ts pins this; migration 20260612090000 provides
 * the enum value). There is NO separate agency persona, NO separate agency
 * dashboard, NO duplicate agency candidate/demand system.
 *
 * This guard pins:
 *   1. the staffing-agency mode renders ONLY behind the
 *      company_type === 'staffing_agency' condition on the company room;
 *   2. the three legacy routes are bookmark-preserving redirect stubs
 *      (marketplace / player-card precedent);
 *   3. the canonical company path never imports lib/agency/* (the legacy
 *      `agencies`-table world stays out of the canonical view);
 *   4. the route-truth-map drift cap was LOWERED (7 → 4) and the trio is
 *      classified REDIRECT_STUB;
 *   5. agency-mode copy exists in en/lt/ru and stays honest — no invented
 *      agency features, no old separate-world terminology.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const companyPage = read("app/[locale]/dashboard/company/page.tsx");
const truthMap = read("lib/guards/route-truth-map.test.ts");

const STUBS = [
  {
    rel: "app/[locale]/dashboard/agency/page.tsx",
    target: /redirect\(`\/\$\{locale\}\/dashboard\/company`\)/,
  },
  {
    rel: "app/[locale]/dashboard/agency/pool/page.tsx",
    target: /redirect\(`\/\$\{locale\}\/dashboard\/company#company-team`\)/,
  },
  {
    rel: "app/[locale]/dashboard/start/agency/page.tsx",
    target: /redirect\(`\/\$\{locale\}\/dashboard\/start\/company`\)/,
  },
] as const;

describe("staffing-agency mode is a typed view on the company room", () => {
  it("renders only behind companyType === 'staffing_agency'", () => {
    // The section testid appears exactly once, inside the typed conditional.
    expect(companyPage).toMatch(
      /companyRow && companyRow\.companyType === "staffing_agency" \? \(/,
    );
    expect(
      companyPage.match(/data-testid="company-agency-mode"/g) ?? [],
    ).toHaveLength(1);
    const condIdx = companyPage.indexOf(
      'companyRow.companyType === "staffing_agency" ? (',
    );
    const modeIdx = companyPage.indexOf('data-testid="company-agency-mode"');
    expect(condIdx).toBeGreaterThan(-1);
    expect(modeIdx).toBeGreaterThan(condIdx);
  });

  it("surfaces ONLY real, source-backed agency actions (roster / offer / scouting)", () => {
    for (const key of ["roster", "offer", "scouting"] as const) {
      expect(companyPage).toMatch(
        new RegExp(`company-agency-mode-action-\\$\\{a\\.key\\}|company-agency-mode-action-${key}`),
      );
    }
    // Each action targets an existing canonical surface — no new panels.
    // "offer" now opens the real candidate-OFFER form (#agency-offer): the
    // agency offers its OWN roster worker for a client's need. It is NO LONGER
    // the demand-intake wizard (which meant "we are LOOKING FOR workers" and
    // conflated the two intents — the P1 this bridge closes).
    expect(companyPage).toMatch(/\/dashboard\/company#company-team/);
    expect(companyPage).toMatch(/\/dashboard\/company#agency-offer/);
    expect(companyPage).toMatch(/\/dashboard\/company\/scouting/);
  });

  it("the canonical company path imports nothing from the LEGACY lib/agency world", () => {
    // P5 (canonical journey) added lib/agency/clients* — the client-management
    // module that reuses the canonical customer_requests demand model (see
    // lib/guards/agency-client-management.test.ts). The legacy `agencies`-table
    // modules (pool / pool-actions / actions / agency-workers) stay banned.
    expect(companyPage).not.toMatch(
      /@\/lib\/agency\/(pool|pool-actions|actions|agency-workers)/,
    );
    const agencyImports =
      companyPage.match(/@\/lib\/agency\/[a-z-]+/g) ?? [];
    for (const imp of agencyImports) {
      expect([
        "@/lib/agency/clients",
        "@/lib/agency/clients-model",
        "@/lib/agency/clients-actions",
        // agency→client candidate-offer bridge (read service; the write
        // actions + model are imported by the offer component, not this page).
        "@/lib/agency/candidate-offers",
      ]).toContain(imp);
    }
    // The components the company room mounts stay clean too.
    for (const comp of [
      "components/app/company-workers-section.tsx",
      "components/app/company-next-actions.tsx",
      "components/app/company-scouting-bridge.tsx",
    ]) {
      expect(read(comp), `${comp} must not import lib/agency`).not.toMatch(
        /@\/lib\/agency\//,
      );
    }
    expect(companyPage).not.toMatch(/AgencyWorkersSection|getOwnAgency/);
  });
});

describe("the three legacy agency routes are redirect stubs", () => {
  for (const s of STUBS) {
    it(`${s.rel} redirects to its canonical target and renders nothing`, () => {
      const src = read(s.rel);
      expect(src).toMatch(s.target);
      expect(src).toMatch(/from "next\/navigation"/);
      // A stub gates nothing, fetches nothing, renders nothing.
      expect(src).not.toMatch(/requireRoleOrRedirect|getTranslations|<section|<form/);
      expect(src).not.toMatch(/@\/lib\/agency\//);
      expect(src).not.toMatch(/from\(["']agencies["']\)/);
    });
  }
});

describe("route-truth-map ratchet honoured", () => {
  it("classifies the trio REDIRECT_STUB and lowered the drift cap to 4", () => {
    for (const route of [
      "dashboard/agency",
      "dashboard/agency/pool",
      "dashboard/start/agency",
    ]) {
      expect(truthMap).toMatch(
        new RegExp(`"${route.replace(/\//g, "\\/")}":\\s*"REDIRECT_STUB"`),
      );
    }
    expect(truthMap).toMatch(/toBeLessThanOrEqual\(4\)/);
    expect(truthMap).not.toMatch(/toBeLessThanOrEqual\(7\)/);
  });
});

describe("agency-mode copy: present (en/lt/ru), honest, no old terminology", () => {
  for (const locale of ["en", "lt", "ru"] as const) {
    const json = JSON.parse(read(`messages/${locale}.json`)) as {
      roleDashboards?: { company?: { agencyMode?: Record<string, unknown> } };
    };
    const mode = json.roleDashboards?.company?.agencyMode;

    it(`${locale}: agencyMode keys present`, () => {
      expect(mode, `${locale} agencyMode missing`).toBeTruthy();
      const m = mode as {
        title?: string;
        intro?: string;
        legacyNote?: string;
        actions?: Record<string, { label?: string; note?: string }>;
      };
      expect(m.title).toBeTruthy();
      expect(m.intro).toBeTruthy();
      expect(m.legacyNote).toBeTruthy();
      for (const k of ["roster", "offer", "scouting"] as const) {
        expect(m.actions?.[k]?.label, `${locale} actions.${k}.label`).toBeTruthy();
        expect(m.actions?.[k]?.note, `${locale} actions.${k}.note`).toBeTruthy();
      }
    });

    it(`${locale}: copy is honest — no invented features, no separate-world framing`, () => {
      const flat = JSON.stringify(mode ?? {}).toLowerCase();
      // No fake capability claims.
      expect(flat).not.toMatch(/\bverified\b|\bguaranteed\b|\bpatvirtinta\b|подтвержд/);
      expect(flat).not.toMatch(/ai match|instant/);
      // No old separate-world terminology or legacy route pointers.
      expect(flat).not.toMatch(/dashboard\/agency|start\/agency/);
      expect(flat).not.toMatch(/separate agency dashboard|agentūros dashboard/);
    });
  }
});
