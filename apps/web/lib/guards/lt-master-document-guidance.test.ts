import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUIDANCE_STATUSES,
  LT_MASTER_GUIDANCE,
  PRE_APPROVAL_STATUSES,
  guidanceStatusCounts,
} from "@/lib/documents/lt-master-guidance";
import { activeLocales } from "@/lib/i18n/config";

/**
 * WAGON 9 guard (CR train area 17, owner correction 2026-07-05) — the
 * Lithuanian-master jurisdiction/document guidance registry.
 *
 * Pins the owner rules:
 *   - LT master text is the ONLY content language: no guidance bodies may
 *     exist in EN/RU catalogs, and the surface renders bodies only for the
 *     lt locale (other locales get the short pending notice);
 *   - conservative wording only ("gali reikėti" / "pasitikrinti" /
 *     "informacinio pobūdžio") — never a guarantee, never "privaloma visais
 *     atvejais", no legal-advice claim;
 *   - EVERY pre-approval item carries needsLegalReview: true (no row is
 *     owner/lawyer-approved yet);
 *   - the 5 pipeline statuses exist exactly as specified;
 *   - information-only: no help-request CTA (WAGON 10), no payment strings,
 *     no external provider, and the empty country_document_requirements DB
 *     registry is untouched (no migration in this wagon).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const registrySource = read("lib/documents/lt-master-guidance.ts");
const surface = read("components/app/lt-document-guidance.tsx");
const page = read("app/[locale]/dashboard/documents/page.tsx");

describe("registry shape and review flags", () => {
  it("the 5 owner-specified pipeline statuses exist exactly", () => {
    expect([...GUIDANCE_STATUSES]).toEqual([
      "LT_DRAFT_READY",
      "OWNER_EDITING",
      "OWNER_APPROVED_LT",
      "TRANSLATION_READY",
      "TRANSLATED",
    ]);
  });
  it("every pre-approval item has needsLegalReview: true", () => {
    for (const item of LT_MASTER_GUIDANCE) {
      if (PRE_APPROVAL_STATUSES.includes(item.status)) {
        expect(item.needsLegalReview, `${item.id} must need legal review`).toBe(
          true,
        );
      }
    }
  });
  it("no item claims owner/lawyer approval yet (all drafts as of 2026-07-05)", () => {
    const counts = guidanceStatusCounts();
    expect(counts.OWNER_APPROVED_LT).toBe(0);
    expect(counts.TRANSLATION_READY).toBe(0);
    expect(counts.TRANSLATED).toBe(0);
  });
  it("ids are unique and every item carries LT body + provider + dimensions", () => {
    const ids = new Set<string>();
    for (const item of LT_MASTER_GUIDANCE) {
      expect(ids.has(item.id), `duplicate id ${item.id}`).toBe(false);
      ids.add(item.id);
      expect(item.titleLt.length).toBeGreaterThan(3);
      expect(item.bodyLt.length).toBeGreaterThan(40);
      expect(item.whoUsuallyProvidesLt.length).toBeGreaterThan(5);
      expect(item.dependsOn.length).toBeGreaterThan(0);
    }
  });
});

describe("conservative wording (owner rule)", () => {
  const CONSERVATIVE = /gali reikėti|gali būti|pasitikrin|informacinio pobūdžio|dažnai prašoma/i;
  const OVERCLAIM =
    /garantuoj|garantij|užtikriname atitikt|privaloma visais atvejais|oficialiai patvirtin|teisinė konsultacija suteikiama/i;
  for (const item of LT_MASTER_GUIDANCE) {
    it(`${item.id}: conservative, no guarantees`, () => {
      expect(CONSERVATIVE.test(item.bodyLt), "conservative marker").toBe(true);
      expect(OVERCLAIM.test(item.titleLt + item.bodyLt), "overclaim").toBe(
        false,
      );
    });
  }
});

describe("LT-only master — no translated guidance anywhere", () => {
  it("surface renders bodies only for the lt locale, pending notice otherwise", () => {
    expect(surface).toMatch(/locale !== "lt"/);
    expect(surface).toMatch(/data-testid="documents-guidance-pending"/);
    expect(surface).toMatch(/data-testid="documents-guidance-disclaimer"/);
  });
  it("no LT guidance body text leaked into EN/RU catalogs", () => {
    // Sample distinctive fragments of the LT master; none may appear in any
    // non-LT catalog (base or namespace files are all under messages/).
    const fragments = [
      "A1 pažymėjimo",
      "RUT (užsienio paslaugų teikėjų) registre",
      "HMS (saugos) kortelės",
      "ID06 kortelės",
    ];
    for (const loc of ["en", "ru"] as const) {
      const base = read(`messages/${loc}.json`);
      for (const f of fragments) {
        expect(base.includes(f), `${loc}.json leaked "${f}"`).toBe(false);
      }
    }
  });
  it("EN/RU pending notice says the guidance is in Lithuanian", () => {
    const en = JSON.parse(read("messages/en.json")).documents.guidance;
    const ru = JSON.parse(read("messages/ru.json")).documents.guidance;
    expect(en.pendingNotice).toMatch(/Lithuanian/i);
    expect(ru.pendingNotice).toMatch(/литовск/i);
  });
});

describe("no drafting meta-text on the page (owner P0 2026-10-23)", () => {
  // The guidance is presented as information. Review pipeline, owner/lawyer
  // review and "draft" labels are registry data only — never rendered.
  const META_TEXT: ReadonlyArray<RegExp> = [
    /\bdraft\b/i,
    /\bowner\b/i,
    /lawyer|legal review/i,
    /juodrašt|savinink|teisinink|peržiūr/i,
    /черновик|владел|юрист/i,
    /\bconcept\b|eigenaar|jurist|beoordeling/i,
    /entwurf|eigentümer|inhaber|rechtsabteilung|prüfung durch/i,
    /szkic|właściciel|przegląd/i,
  ];
  it("the surface renders no review status or legal-review badge", () => {
    // Only executable code is scanned — the header comment names the
    // registry fields it deliberately does not render.
    const code = surface
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/item\.status|needsLegalReview|statusSummary|isSuperadmin/);
    expect(code).not.toMatch(/t\(`status\./);
  });
  it("guidance chrome in every active locale carries no drafting meta-text", () => {
    for (const loc of activeLocales) {
      const g = JSON.parse(read(`messages/${loc}.json`)).documents.guidance;
      const strings = JSON.stringify(g);
      for (const rx of META_TEXT) {
        expect(rx.test(strings), `${loc} documents.guidance matches ${rx}`).toBe(false);
      }
    }
  });
});

describe("information-only, no duplicate system, no payments", () => {
  it("renders on the documents page (preparing + live + PR H org branches)", () => {
    // Control room PR H added the role-branched org view — the informational
    // guidance stays visible there too (3 render sites, one per branch).
    const matches = page.match(/<LtDocumentGuidance locale=\{locale\} \/>/g);
    expect(matches?.length).toBe(3);
  });
  it("no help-request CTA, form or send action (WAGON 10 scope)", () => {
    expect(surface).toMatch(/data-testid="documents-guidance-help-info"/);
    expect(surface).not.toMatch(/<form|<button|action=|onClick/i);
  });
  it("registry is pure data — no DB, network or payment code", () => {
    // Strip comments first — the doctrine header legitimately NAMES the
    // banned things ("no payment work"); only executable code is scanned.
    const code = registrySource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/supabase|fetch\(|process\.env|stripe|payment/i);
  });
  it("does not touch the empty country_document_requirements DB registry", () => {
    expect(registrySource).not.toMatch(/country_document_requirements\s*[^ ]*(insert|seed|upsert)/i);
    expect(surface).not.toMatch(/country_document_requirements/);
  });
  it("i18n chrome keys present with parity (lt/en/ru)", () => {
    for (const loc of activeLocales) {
      const g = JSON.parse(read(`messages/${loc}.json`)).documents.guidance;
      for (const k of [
        "title",
        "intro",
        "pendingNotice",
        "officialSources",
        "whoProvides",
        "groupAll",
        "helpInfoNote",
      ]) {
        expect(typeof g?.[k] === "string" && g[k].length > 0, `${loc} ${k}`).toBe(true);
      }
      for (const d of [
        "worker_country",
        "company_country",
        "work_country",
        "role_service_type",
        "engagement_context",
      ]) {
        expect(typeof g.dimensions?.[d] === "string", `${loc} dim ${d}`).toBe(true);
      }
    }
  });
});
