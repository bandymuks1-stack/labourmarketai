import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION = "supabase/migrations/20261019070000_discoverability_paused_by_open_deletion_request_v1.sql";
const ROLLBACK = "supabase/rollbacks/20261019070000_discoverability_paused_by_open_deletion_request_v1.down.sql";
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

/**
 * A person who asked to delete their account is not offered to employers
 * while the request is open (GDPR Art. 17 / 18 interim measure). The ledger
 * rule stays exactly as it was; the platform never writes a consent row on
 * the person's behalf, and nothing is deleted.
 */
describe("an open account deletion request pauses discoverability", () => {
  const sql = code(read(MIGRATION));

  it("keeps the consent-ledger rule verbatim and adds only the open-request condition", () => {
    expect(sql).toMatch(/action = 'granted' and e\.consent_text_version = p\.current_version/);
    expect(sql).toMatch(/order by e\.created_at desc, e\.seq desc\s+limit 1/);
    expect(sql).toMatch(/\), false\)\s+and not exists \(/);
    expect(sql).toContain("r.payload->>'privacy_request_type' = 'account_deletion'");
    expect(sql).toContain("r.status in ('submitted', 'in_review', 'needs_followup', 'approved')");
  });

  it("changes nothing else: same signature, security definer, search_path; no writes, no grants", () => {
    expect(sql).toMatch(/create or replace function public\.worker_profile_discoverable\(p_profile uuid\)/);
    expect(sql).toMatch(/stable security definer/);
    expect(sql).toMatch(/set search_path to 'public'/);
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(sql).not.toMatch(/\b(grant|revoke)\b/i);
    expect(sql).not.toMatch(/privacy_consent_events\s+set|into\s+public\.privacy_consent_events/i);
  });

  it("ships a rollback that restores the ledger-only body", () => {
    const down = code(read(ROLLBACK));
    expect(down).toMatch(/create or replace function public\.worker_profile_discoverable\(p_profile uuid\)/);
    expect(down).toMatch(/limit 1\s+\), false\)\s+\$function\$/);
    expect(down).not.toContain("customer_requests");
  });
});
