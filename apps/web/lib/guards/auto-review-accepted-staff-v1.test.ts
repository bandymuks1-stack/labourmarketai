import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner decision 1 (2026-10-12): work review may switch on by itself ONLY for
 * an employee who accepted a staff invitation after being told so. These
 * guards pin the parts a refactor could quietly widen.
 */
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("auto-review executor — the audited door only", () => {
  const src = read("lib/operations/auto-review.ts");

  it("switches review on through the audited RPC, never a direct write", () => {
    expect(src).toContain('rpc("set_engagement_journal_review"');
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(/);
  });

  it("runs in the manager's session — no service role, no admin client", () => {
    expect(src).not.toMatch(/service[_-]?role|createAdminClient|SUPABASE_SERVICE/i);
    expect(src).toContain("createClient");
  });

  it("only ever asks for review ON", () => {
    expect(src).toContain("p_enabled: true");
    expect(src).not.toContain("p_enabled: false");
  });

  it("is scoped to one organization on every read", () => {
    expect(src).toMatch(/\.eq\("organization_id", organizationId\)/);
  });
});

describe("auto-review eligibility — the sentence comes before the automation", () => {
  const model = read("lib/operations/auto-review-model.ts");
  const page = read("app/[locale]/invite/[token]/page.tsx");

  it("qualifies only acceptances made after the accept screen carried the notice", () => {
    expect(model).toContain("REVIEW_DISCLOSURE_FROM");
    expect(model).toMatch(/when >= from/);
  });

  it("the accept screen and the rule share ONE employee-relationship predicate", () => {
    expect(page).toContain("acceptanceCreatesEmployeeRelationship");
    expect(page).toContain('data-testid="invite-review-notice"');
    expect(model).toContain("acceptanceCreatesEmployeeRelationship({");
  });

  it("never reaches a relationship other than employee", () => {
    expect(model).toMatch(/c\.relationship_slug !== "employee"/);
  });

  it("the notice exists in every locale that carries the invite page", () => {
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const d = JSON.parse(read(`messages/${loc}.json`)) as { network: { invitePage: Record<string, string> } };
      expect(d.network.invitePage.reviewNotice, loc).toContain("{organization}");
    }
  });
});
