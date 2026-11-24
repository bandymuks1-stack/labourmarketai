import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 learning — policy-scope guard.
 *
 * Manager authority is org-scoped and proven only via manages_organization():
 *   - writing/updating a policy or reviewing a queue item requires
 *     manages_organization (or is_admin) — never a worker, never anon;
 *   - a worker may SELECT their own rows (transparency) but may NOT review;
 *   - the auto-confirm RPC limits action to the policy's scope and refuses an
 *     empty scope.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
const sql = read(
  join(REPO, "supabase", "migrations", "20260627132759_human_in_loop_learning.sql"),
).toLowerCase();

describe("learning policy + review authority is org-manager scoped", () => {
  it("policy writes require manages_organization (manager/admin only, no worker)", () => {
    // insert + update policy carry a manages_organization with-check.
    expect(sql).toMatch(
      /create policy learning_policy_settings_insert[\s\S]*?with check \(public\.manages_organization\(organization_id\) or public\.is_admin\(\)\)/,
    );
    expect(sql).toMatch(
      /create policy learning_policy_settings_update[\s\S]*?with check \(public\.manages_organization\(organization_id\) or public\.is_admin\(\)\)/,
    );
    // The policy-settings SELECT predicate is manager/admin only — no owns_worker
    // (a worker has no access to org policy at all).
    expect(sql).toMatch(
      /create policy learning_policy_settings_select[\s\S]*?using \(public\.manages_organization\(organization_id\) or public\.is_admin\(\)\)/,
    );
  });

  it("review-queue writes require manages_organization; worker is read-only", () => {
    expect(sql).toMatch(
      /create policy learning_review_queue_insert[\s\S]*?with check \(public\.manages_organization\(organization_id\) or public\.is_admin\(\)\)/,
    );
    expect(sql).toMatch(
      /create policy learning_review_queue_update[\s\S]*?with check \(public\.manages_organization\(organization_id\) or public\.is_admin\(\)\)/,
    );
    // the worker can only SELECT their own queue rows (owns_worker appears in the
    // SELECT policy), and there is no owns_worker on the update/insert policies.
    expect(sql).toMatch(/create policy learning_review_queue_select[\s\S]*?owns_worker\(subject_worker_id\)/);
  });

  it("signal inserts require scope over the subject (owns_worker or manages_organization)", () => {
    expect(sql).toMatch(
      /create policy learning_signals_insert[\s\S]*?with check \([\s\S]*?owns_worker\(subject_worker_id\)[\s\S]*?manages_organization\(organization_id\)/,
    );
  });

  it("the RPC enforces scope and refuses an empty scope", () => {
    expect(sql).toMatch(/all_org_workers/);
    expect(sql).toMatch(/worker_ids/);
    expect(sql).toMatch(/return 'out_of_scope'/);
  });
});
