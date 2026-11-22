import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #3604: 18 worker-lookup policies read auth.uid() once (RED, needs-human-gate).
 *
 * The migration may only wrap `auth.uid()` as `(select auth.uid())`. The proof is
 * supabase/tests/20261122130000_rls_worker_lookup_initplan_equivalence.sh, run by
 * the isolated workflow on every change of these files. This guard keeps that
 * proof wired and the two SQL files in step with each other.
 */
const REPO = join(process.cwd(), "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");
const N = "20261122130000_rls_worker_lookup_initplan";
const up = read(`supabase/migrations/${N}_v1.sql`);
const down = read(`supabase/rollbacks/${N}_v1.down.sql`);
const statements = (sql: string) =>
  [...sql.matchAll(/alter policy (\S+) on public\.(\S+?)\n[\s\S]*?;\n/g)].map((m) => m[0]);

describe("#3604 worker-lookup policies", () => {
  it("changes 18 policies and nothing but the auth.uid() wrapping", () => {
    const u = statements(up);
    const d = statements(down);
    expect(u).toHaveLength(18);
    expect(d).toHaveLength(18);
    expect(u.map((s) => s.replaceAll("(select auth.uid())", "auth.uid()"))).toEqual(d);
    expect(up).not.toMatch(/\b(drop|create|grant|revoke|security definer)\b/i);
  });

  it("the isolated workflow runs the equivalence check on any change of these files", () => {
    const wf = read(".github/workflows/signup-isolated.yml");
    expect(wf).toContain(`bash supabase/tests/${N}_equivalence.sh`);
    expect(wf).toContain(`"supabase/migrations/${N}_v1.sql"`);
    expect(wf).toContain(`"supabase/rollbacks/${N}_v1.down.sql"`);
    expect(wf).toContain(`"supabase/tests/${N}_*"`);
  });

  it("the check rolls everything back and compares every phase", () => {
    const sh = read(`supabase/tests/${N}_equivalence.sh`);
    expect(sh).toContain('echo "rollback;"');
    expect(sh).toMatch(/P0\.txt" "\$out\/P2\.txt"/);
    expect(sh).toMatch(/A0\.txt" "\$out\/A\$i\.txt"/);
  });
});
