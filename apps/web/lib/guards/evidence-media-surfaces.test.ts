import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EMPTY_ORG_REGISTER_FILTERS, parseOrgRegisterFilters } from "@/lib/documents/document-file-model";

/**
 * HISTORICAL PHOTOS + LINKED DOCUMENTS SURFACES (2026-10-07).
 *
 * Pins the properties that must not drift:
 *   - the bucket migration is private, delegates reads to the table's RLS, admits
 *     writes only under a managed organization's prefix and never lets the client
 *     delete a registered photo;
 *   - nothing here uses the service role or a public URL;
 *   - the strip never conflates unavailable with empty and always carries the
 *     reported-not-verified label and the original date's basis;
 *   - the linked-documents block is read-only and adds no access path.
 */
const web = join(__dirname, "..", "..");
const repo = join(web, "..", "..");
const read = (rel: string, base = web) => readFileSync(join(base, rel), "utf8");

const migration = read("supabase/migrations/20261007180000_evidence_media_bucket_v1.sql", repo);
const rollback = read("supabase/rollbacks/20261007180000_evidence_media_bucket_v1.down.sql", repo);
const strip = read("components/app/evidence-media-strip.tsx");
const linked = read("components/app/linked-documents.tsx");
const serve = read("lib/organization-evidence/evidence-media-serve.ts");
const writer = read("lib/organization-evidence/evidence-media-write.ts");
const actions = read("lib/organization-evidence/evidence-media-actions.ts");
const projectPage = read("app/[locale]/dashboard/projects/[id]/page.tsx");
const personPage = read("app/[locale]/dashboard/company/people/[personId]/page.tsx");

const sqlOnly = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

describe("bucket migration", () => {
  const sql = sqlOnly(migration);

  it("creates ONE private bucket with the stated limits", () => {
    expect(sql).toMatch(/'evidence-media', 'evidence-media', false, 20971520/);
    expect(sql).toMatch(/'image\/jpeg','image\/png','image\/webp','image\/heic'/);
  });

  it("defines exactly select / insert / orphan-delete policies, scoped to the bucket", () => {
    const policies = [...sql.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1]);
    expect(policies).toEqual([
      "evidence-media entity read",
      "evidence-media scoped insert",
      "evidence-media orphan delete",
    ]);
    expect([...sql.matchAll(/bucket_id = 'evidence-media'/g)].length).toBe(3);
  });

  it("delegates reads to the table's RLS and never to the path alone", () => {
    expect(sql).toMatch(/from public\.organization_evidence_media m\s+where m\.storage_path = storage\.objects\.name/);
  });

  it("admits writes only under org/<id>/ for a manager of that organization", () => {
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = 'org'/);
    expect(sql).toMatch(/public\.manages_organization\(\(\(storage\.foldername\(name\)\)\[2\]\)::uuid\)/);
  });

  it("never deletes a registered photo from the client", () => {
    const del = sql.slice(sql.indexOf('create policy "evidence-media orphan delete"'));
    expect(del).toMatch(/not exists \(\s*select 1 from public\.organization_evidence_media m/);
  });

  it("loosens nothing: no anon, no public, no using (true), no update policy, no public bucket", () => {
    expect(sql).not.toMatch(/to anon|to public|grant |using \(\s*true\s*\)|with check \(\s*true\s*\)|for update|for all/i);
    expect(sql).not.toMatch(/false, 20971520[\s\S]*public\s*=\s*true/);
  });

  it("ships a guarded rollback", () => {
    expect(rollback).toMatch(/refusing to drop/);
    expect(rollback).toMatch(/drop policy if exists "evidence-media entity read"/);
  });
});

describe("no new access path", () => {
  it("serving, writing and the strip never use the service role or a public URL", () => {
    for (const src of [serve, writer, actions, strip, linked]) {
      expect(src).not.toMatch(/service[-_]?role|createServiceClient|createAdminClient|getPublicUrl/i);
    }
  });

  it("signed URLs are minted under the caller's own session and are short-lived", () => {
    expect(serve).toMatch(/caller\.supabase\.storage/);
    expect(serve).toMatch(/EVIDENCE_MEDIA_SIGNED_URL_TTL_SECONDS = 900/);
  });

  it("the writer takes the organization from the server, never the form", () => {
    expect(actions).toMatch(/resolveEvidenceOrganization\(caller, null\)/);
    expect(actions).not.toMatch(/get\("organizationId"\)/);
  });

  it("the writer never invents a date or a visibility wider than private", () => {
    expect(writer).not.toMatch(/new Date\(\)|Date\.now\(\)/);
    expect(writer).toMatch(/input\.visibility === "subject" \? "subject" : "private"/);
  });

  it("linked-document scope filters are not parseable from the URL", () => {
    expect(parseOrgRegisterFilters({ regStatus: "active" })).toEqual({
      ...EMPTY_ORG_REGISTER_FILTERS,
      status: "active",
    });
    const hostile = parseOrgRegisterFilters({
      projectId: "11111111-1111-4111-8111-111111111111",
      workerId: "22222222-2222-4222-8222-222222222222",
    } as never);
    expect(hostile.projectId).toBeNull();
    expect(hostile.workerId).toBeNull();
  });
});

describe("the strip tells the truth", () => {
  it("keeps unavailable (an error card) apart from empty (an honest line)", () => {
    expect(strip).toMatch(/data-status="unavailable"/);
    expect(strip).toMatch(/<Card variant="error"/);
    expect(strip).toMatch(/data-status="empty"/);
    expect(strip).toMatch(/read\.kind === "unprovisioned"\) return null/);
  });

  it("shows the reported-not-verified label, the source and the date basis on every photo", () => {
    expect(strip).toMatch(/t\("reported"\)/);
    expect(strip).toMatch(/t\("source"/);
    expect(strip).toMatch(/basis\.\$\{m\.takenAtBasis\}/);
    expect(strip).toMatch(/t\("takenUnknown"\)/);
  });

  it("a photo without a preview says so rather than rendering a broken image", () => {
    expect(strip).toMatch(/evidence-media-no-preview/);
  });

  it("is mounted on the project page and the company person card with stated anchors", () => {
    expect(projectPage).toMatch(/<EvidenceMediaStrip locale=\{locale\} anchor=\{\{ kind: "project", projectId: id \}\}/);
    expect(personPage).toMatch(/kind: "person", organizationPersonId: person\.id/);
  });
});

describe("linked documents are read-only and RLS-scoped", () => {
  it("reuses getOrgDocumentRegister with a surface filter and renders no write control", () => {
    expect(linked).toMatch(/getOrgDocumentRegister\(organizationId/);
    expect(linked).not.toMatch(/<form|Action\b|"use server"|<button/);
    expect(linked).toMatch(/\/api\/documents\/file\//);
  });

  it("a failed read is an error state, never 'none linked'", () => {
    expect(linked).toMatch(/result\.kind === "error"/);
    expect(linked).toMatch(/data-status="unavailable"/);
  });

  it("is mounted on the project page and the person card", () => {
    expect(projectPage).toMatch(/<ProjectLinkedDocuments projectId=\{id\}/);
    expect(personPage).toMatch(/<LinkedDocuments/);
    expect(personPage).toMatch(/linked-documents-not-linked/);
  });
});

describe("stale gate doc is corrected", () => {
  it("no longer claims the table is unapplied", () => {
    const doc = read("docs/human-gates/evidence-media-link-v1-gate.md", repo);
    expect(doc).not.toMatch(/\*\*not applied to any database\.\*\*/);
    expect(existsSync(join(repo, "supabase/migrations/20261007180000_evidence_media_bucket_v1.sql"))).toBe(true);
    expect(doc).toMatch(/20261007180000_evidence_media_bucket_v1/);
  });
});
