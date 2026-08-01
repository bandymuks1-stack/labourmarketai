import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * W4 Slice 2 — the worker_documents WRITE path.
 *
 * The audited `upsert_worker_document` RPC shipped with ZERO callers; the
 * whole certificate/expiry/readiness/CV chain read a table no user could
 * fill. These pins keep the new write path honest:
 *  - the action writes ONLY through the RPC (owner-scoped + audited there),
 *    never directly into the table;
 *  - migration-absent degrades to needs_migration, never a fake success;
 *  - the form mounts on the documents page ONLY in the schema-present branch
 *    and the honest no-upload note stays.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("worker documents write path (W4 Slice 2)", () => {
  const action = read("lib/documents/document-actions.ts");
  const page = read("app/[locale]/dashboard/documents/page.tsx");
  const form = read("components/app/worker-document-form.tsx");

  it("writes ONLY through the audited RPC — never a direct table write", () => {
    expect(action).toMatch(/\.rpc\("upsert_worker_document"/);
    expect(action).not.toMatch(/from\("worker_documents"\)/);
    expect(form).not.toMatch(/supabase/i);
  });

  it("degrades honestly when the migration is unapplied", () => {
    for (const code of ["42883", "PGRST202", "42P01", "PGRST205"]) {
      expect(action).toContain(`"${code}"`);
    }
    expect(action).toMatch(/needs_migration/);
  });

  it("maps the RPC's own refusal codes instead of swallowing them", () => {
    expect(action).toMatch(/42501/); // not authenticated
    expect(action).toMatch(/P0002/); // no worker row
    expect(action).toMatch(/22023/); // invalid input
  });

  it("the form mounts in the schema-present branch and the no-upload note stays", () => {
    expect(page).toMatch(/<WorkerDocumentForm/);
    expect(page).toMatch(/doc-centre-upload-note/);
    // The mount sits inside the `inv.kind === "ok"` else-branch: the form
    // must appear AFTER the needs-migration render in source order.
    const needsMigrationAt = page.indexOf('inv.kind === "needs-migration"');
    const formAt = page.indexOf("<WorkerDocumentForm");
    expect(needsMigrationAt).toBeGreaterThan(-1);
    expect(formAt).toBeGreaterThan(needsMigrationAt);
  });

  it("speaks the product design language, not generic AI UI (owner directive)", () => {
    // The status control is a chip radio group in the SAME state tones as the
    // inventory badges it produces — never a generic <select> for 3 values.
    expect(form).toMatch(/type="radio"/);
    expect(form).toMatch(/state-success/);
    expect(form).toMatch(/state-warning/);
    expect(form).not.toMatch(/select name="status"/);
    // Repo vocabulary: card surface, mono-meta eyebrows, display heading,
    // 44px touch floor, brand focus ring.
    expect(form).toMatch(/card-border/);
    expect(form).toMatch(/font-mono text-meta uppercase tracking-label/);
    expect(form).toMatch(/font-display/);
    expect(form).toMatch(/min-h-11/);
    expect(form).toMatch(/focus-visible:ring-2/);
  });

  it("every editor label ships in all five locales", () => {
    for (const loc of ["lt", "en", "de", "nl", "ru"]) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const e = m.documents?.editor;
      expect(e, `${loc} documents.editor`).toBeTruthy();
      for (const k of [
        "title",
        "typeLabel",
        "countryLabel",
        "countryNone",
        "statusLabel",
        "validFromLabel",
        "noteLabel",
        "notePlaceholder",
        "save",
        "saving",
        "saved",
        "invalid",
        "errorMsg",
      ]) {
        expect(typeof e[k], `${loc} documents.editor.${k}`).toBe("string");
      }
    }
  });
});
