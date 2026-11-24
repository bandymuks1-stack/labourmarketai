/**
 * GUARD — owner P0 #3679 (duplication audit SEC-1/2/4): a first version of a
 * write door whose successor added a rule is not reachable directly by a
 * signed-in user. RED 20261123060000 revokes it; this pins the SQL, the
 * rollback, and that every successor exists and stays granted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const N = "20261123060000_revoke_bypassed_v1_doors_v1";
const up = readFileSync(resolve(ROOT, `supabase/migrations/${N}.sql`), "utf8");
const down = readFileSync(resolve(ROOT, `supabase/rollbacks/${N}.down.sql`), "utf8");

const DOORS = [
  "public.respond_team_demand_offer_v1(uuid, text)",
  "public.set_work_task_status_v1(text, text)",
  "public.propose_booking_request(uuid, uuid, text, text, text, text, text)",
];

describe("bypassed v1 doors", () => {
  it("each old door is revoked from authenticated, and the rollback restores exactly that grant", () => {
    for (const d of DOORS) {
      expect(up).toContain(`revoke execute on function ${d} from authenticated;`);
      expect(down).toContain(`grant execute on function ${d} to authenticated;`);
    }
  });

  it("the migration only revokes: no grant, no body, no data", () => {
    const code = up.replace(/--[^\n]*/g, "");
    expect(code).not.toMatch(/\b(grant|create|alter|insert|update|delete|drop)\b/i);
  });

  it("the app reaches an old door only as a fallback when its successor is missing", () => {
    const read = (p: string) => readFileSync(resolve(ROOT, "apps/web", p), "utf8");
    expect(read("lib/company/team-offer.ts")).toMatch(/rpc\("respond_team_demand_offer_v2"[\s\S]*?42883[\s\S]*?rpc\("respond_team_demand_offer_v1"/);
    expect(read("lib/tasks/set-task-status-core.ts")).toMatch(/rpc\("set_work_task_status_v2"[\s\S]*?isMigrationMissingCode[\s\S]*?rpc\("set_work_task_status_v1"/);
    expect(read("lib/booking/booking-actions.ts")).toMatch(/rpc\("propose_booking_request_v3", args\);\n\s+if \(error && isAbsentFunction\(error\)\)/);
  });
});
