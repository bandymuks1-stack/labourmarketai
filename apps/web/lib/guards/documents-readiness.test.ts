import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * S3 documents & readiness guard.
 *
 * Pins:
 *  - the migration stays a DRAFT-headed, additive, reversible, RPC-only-write
 *    file with default-closed RLS and an append-only events table;
 *  - "expiring" is never STORED (derived from valid_until — doctrine §6);
 *  - country requirements ship as STRUCTURE with needs_legal_source default —
 *    no invented legal facts;
 *  - the feature flag ships OFF and the page is an honest RUOŠIAMA note;
 *  - the legal disclaimer exists and no copy guarantees compliance;
 *  - document types are a slug registry (no name_* columns).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const read = (rel: string): string => readFileSync(resolve(APP, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(resolve(REPO, rel), "utf8");
const stripSql = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const MIGRATION =
  "supabase/migrations/20260610170000_worker_documents_readiness.sql";
const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];

describe("S3 migration draft — gated, additive, hardened", () => {
  const raw = readRepo(MIGRATION);
  const code = stripSql(raw).toLowerCase();

  it("is explicitly a needs-human-gate DRAFT applied only via MCP", () => {
    expect(raw).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
    expect(raw).toMatch(/apply_migration/);
    expect(raw).toMatch(/-- ROLLBACK/);
  });

  it("is additive only — no executable drops beyond policy re-creates", () => {
    expect(code).not.toMatch(/\bdrop\s+(table|column|function)\b/);
  });

  it("write path is the hardened RPC only (definer + search_path + revokes)", () => {
    expect(code).toMatch(/create or replace function public\.upsert_worker_document/);
    expect(code).toMatch(/security definer/);
    expect(code).toMatch(/set search_path = public/);
    expect(code).toMatch(/revoke all on function public\.upsert_worker_document[\s\S]*?from public/);
    expect(code).toMatch(/revoke insert, update, delete on public\.worker_documents from authenticated/);
    expect(code).toMatch(/revoke insert, update, delete on public\.worker_document_events from authenticated/);
  });

  it("never loosens RLS (no using(true), no anon/public grants)", () => {
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
    expect(code).not.toMatch(/\bgrant\b[\s\S]{0,120}?\bto\s+(anon|public)\b/);
  });

  it("events table is append-only (no update/delete policy on it)", () => {
    const eventsSection = code.slice(code.indexOf("worker_document_events"));
    expect(eventsSection).not.toMatch(
      /create policy [\w]*events[\w]* on public\.worker_document_events\s+for (update|delete)/,
    );
  });

  it("status never stores 'expiring' — derived per doctrine §6", () => {
    expect(code).toMatch(/check \(status in \('missing','ready','blocked'\)\)/);
    expect(code).not.toMatch(/status in \([^)]*'expiring'/);
  });

  it("country requirements are structure-only with needs_legal_source default", () => {
    expect(code).toMatch(/source_status\s+text\s+not null\s+default 'needs_legal_source'/);
    // No requirement rows are seeded — only document_types get a seed.
    expect(code).not.toMatch(/insert into public\.country_document_requirements/);
  });

  it("document_types is a slug registry with no label columns (§10/§2)", () => {
    const dt = code.slice(
      code.indexOf("create table if not exists public.document_types"),
      code.indexOf("create table if not exists public.worker_documents"),
    );
    expect(dt).toMatch(/slug\s+text\s+not null\s+unique/);
    expect(dt).not.toMatch(/name_lt|name_en|label/);
  });
});

describe("S3 app layer — flag on post-gate, honest derivation, honest copy", () => {
  // Flag-flip (2026-06-10): worker_documents_readiness is APPLIED to prod
  // via MCP (ledger 20260610172333), so the flag is ON. The flag-off
  // RUOŠIAMA mechanics stay pinned below as the honest pull-back path.
  it("DOCUMENTS_READINESS_ENABLED is ON (post-gate flag-flip)", () => {
    expect(read("lib/config/documents.ts")).toMatch(
      /export const DOCUMENTS_READINESS_ENABLED = true/,
    );
  });

  it("lib derives expiring/expired instead of trusting a stored value", () => {
    const lib = read("lib/documents/readiness.ts");
    expect(lib).toMatch(/deriveDocumentStatus/);
    expect(lib).toMatch(/return "expiring"/);
    // Expired coverage degrades to missing — never silently 'ready'.
    expect(lib).toMatch(/if \(until\.getTime\(\) < now\.getTime\(\)\) return "missing";/);
  });

  it("uncurated country is reported honestly (requirementsKnown=false)", () => {
    expect(read("lib/documents/readiness.ts")).toMatch(/requirementsKnown: false/);
    expect(read("app/[locale]/dashboard/documents/page.tsx")).toMatch(
      /documents-country-unknown/,
    );
  });

  it("page keeps the flag-off RUOŠIAMA branch + the TASK 07 final-skin marker", () => {
    const page = read("app/[locale]/dashboard/documents/page.tsx");
    expect(page).toMatch(/documents-preparing/);
    // TASK 07 polish delivered the final skin — the preview marker is gone
    // and must NOT come back.
    expect(page).toMatch(/TASK 07 final skin/);
    expect(page).not.toMatch(/bus pakeista TASK 07/);
  });

  for (const locale of LOCALES) {
    it(`${locale}.json carries documents namespace + disclaimer`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        documents?: { disclaimer?: string; preparing?: string };
      };
      expect(json.documents?.disclaimer).toBeTruthy();
      expect(json.documents?.preparing).toBeTruthy();
    });
  }

  it("LT+EN disclaimer defers to authorities/lawyer; no compliance guarantee", () => {
    const lt = JSON.parse(read("messages/lt.json")).documents as Record<string, unknown>;
    const en = JSON.parse(read("messages/en.json")).documents as Record<string, unknown>;
    expect(String(lt.disclaimer)).toMatch(/institucijos arba teisininkas/);
    expect(String(en.disclaimer)).toMatch(/authorities or a lawyer/);
    for (const blob of [JSON.stringify(lt), JSON.stringify(en)]) {
      expect(blob.toLowerCase()).not.toMatch(/compliance (is )?(verified|guaranteed)/);
      expect(blob.toLowerCase()).not.toMatch(/garantuojam/);
    }
  });
});
