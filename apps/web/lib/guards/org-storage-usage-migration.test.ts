import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * org_storage_usage_v1 migration safety: additive, read-only, definer with a
 * pinned search_path, authenticated-only, with a paired rollback file.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const NAME = "20261006100000_org_storage_usage_v1";
const raw = readFileSync(join(REPO, `supabase/migrations/${NAME}.sql`), "utf8");
const code = raw
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

describe("org storage usage migration", () => {
  it("is read-only and additive (no DDL on tables, no DML, no policy change)", () => {
    expect(code).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|truncate)\b/);
    expect(code).not.toMatch(/\bdrop\s+(table|column|policy|constraint|trigger)\b/);
    expect(code).not.toMatch(/\balter\s+(table|policy)\b/);
    expect(code).not.toMatch(/\bcreate\s+(table|policy|trigger|index)\b/);
    expect(code).not.toMatch(/\bexecute\s+(format|'|\w+\s*;)/); // no dynamic SQL
  });
  it("both functions are stable, definer, search_path pinned", () => {
    for (const fn of ["org_storage_used_bytes_v1", "org_storage_journal_entry_org_v1"]) {
      const m = code.match(new RegExp(String.raw`create or replace function public\.${fn}[\s\S]*?\$fn\$[\s\S]*?\$fn\$`));
      expect(m, fn).not.toBeNull();
      expect(m![0]).toMatch(/\bstable\b/);
      expect(m![0]).toMatch(/security definer/);
      expect(m![0]).toMatch(/set search_path = public/);
    }
  });
  it("REVOKE precedes GRANT; authenticated only, never anon/public", () => {
    for (const fn of ["org_storage_used_bytes_v1(uuid)", "org_storage_journal_entry_org_v1(uuid)"]) {
      const f = `public.${fn}`;
      const rp = code.indexOf(`revoke all on function ${f} from public`);
      const ra = code.indexOf(`revoke all on function ${f} from anon`);
      const g = code.indexOf(`grant execute on function ${f} to authenticated`);
      expect(rp).toBeGreaterThan(-1);
      expect(ra).toBeGreaterThan(rp);
      expect(g).toBeGreaterThan(ra);
    }
    expect(code).not.toMatch(/grant[^;]*\bto\s+(anon|public)\b/);
  });
  it("usage function authorizes the caller before reading", () => {
    expect(code).toMatch(/auth\.uid\(\)/);
    expect(code).toMatch(/errcode = '42501'/);
  });
  it("attributes only provable ownership (org documents + org-context journal photos)", () => {
    expect(code).toMatch(/df\.scope = 'organization'/);
    expect(code).toMatch(/ec\.organization_id = p_organization_id/);
    expect(code).not.toMatch(/customer_request_attachments|conversation_message_attachments|worker_documents/);
  });
  it("has the human-gate marker, ROLLBACK heading and paired down file", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/m);
    expect(raw).toMatch(/^--\s*ROLLBACK/m);
    expect(existsSync(join(REPO, `supabase/rollbacks/${NAME}.down.sql`))).toBe(true);
  });
});
