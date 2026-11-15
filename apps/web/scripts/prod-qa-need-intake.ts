/**
 * AFTER THE NEED-INTAKE WALK (function register 4.8) — read the one synthetic
 * public need back and close it. Run by `.github/workflows/prod-qa-walk.yml`
 * right after `tests/e2e/prod-need-intake.spec.ts`, pass or fail.
 *
 * With the service key (the walk spec never holds it):
 *   1. reads the rows whose contact address is THIS run's synthetic address
 *      (`lib/testing/prod-qa-need-walk.ts`, on example.invalid);
 *   2. refuses to change a row that is not marked QA-SYNTHETIC;
 *   3. sets each such row to `rejected` — the only column the service role may
 *      update on that table — so it leaves the open queue, the open feed read
 *      and can no longer be claimed by an account;
 *   4. reads back and fails unless every row of the run is `rejected`.
 *
 * With NEED_WALK_OUTCOME=success (the walk's submit was answered "received")
 * it also fails unless exactly ONE row exists, was stored as `new` from
 * `/en/company-need`: that is the read-back proof of the stored row.
 *
 * It cannot delete: the service role holds SELECT and UPDATE (status) on
 * `company_need_public_intakes`, nothing else. The owner removes the row with
 * `docs/qa/need-intake-walk-cleanup.sql`. Prints counts, statuses and a short
 * id prefix only — never a key or an address.
 */
import { createClient } from "@supabase/supabase-js";

import { PRODUCTION_ORIGIN } from "../lib/testing/prod-qa-guard";
import { NEED_WALK_MARK, NEED_WALK_SOURCE_PATH, needWalkAddress } from "../lib/testing/prod-qa-need-walk";

const ACK = "--i-understand-production";
const TABLE = "company_need_public_intakes";
type Row = { id: string; status: string; company_name: string; description: string; source_path: string | null };

function fail(message: string): void {
  console.error(`[prod-qa-need-intake] ${message}`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  if (!process.argv.includes(ACK)) return fail(`refusing to touch production without ${ACK}.`);
  const serviceKey = process.env.PROD_QA_SERVICE_ROLE_KEY;
  if (!serviceKey) return fail("PROD_QA_SERVICE_ROLE_KEY is not set (approved secret path only).");
  let origin = "";
  try {
    origin = new URL(process.env.PROD_QA_SUPABASE_URL ?? "").origin;
  } catch {
    return fail("PROD_QA_SUPABASE_URL is not a URL.");
  }
  if (origin !== PRODUCTION_ORIGIN) return fail("the target is not the production project.");

  const address = needWalkAddress();
  if (!/^qa\.synthetic\.need\.[a-z0-9]+\.[a-z0-9]+@example\.invalid$/.test(address)) return fail("the run's address is not the synthetic shape.");
  const admin = createClient(origin, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const read = async (): Promise<Row[] | null> => {
    const { data, error } = await admin.from(TABLE).select("id,status,company_name,description,source_path").eq("contact_email", address);
    if (error) {
      fail(`read refused (${error.code ?? "error"})`);
      return null;
    }
    return (data ?? []) as Row[];
  };

  const before = await read();
  if (!before) return;
  console.info(`[prod-qa-need-intake] rows of this run: ${before.length} (${before.map((r) => r.status).join(", ") || "none"})`);
  const unmarked = before.filter((r) => !r.company_name.startsWith(NEED_WALK_MARK) || !r.description.startsWith(NEED_WALK_MARK));
  if (unmarked.length > 0) return fail(`${unmarked.length} row(s) with the run's address are not marked ${NEED_WALK_MARK}; nothing was changed.`);

  if (process.env.NEED_WALK_OUTCOME === "success") {
    if (before.length !== 1) fail(`the walk passed but ${before.length} row(s) are stored (expected exactly 1).`);
    else if (before[0].status !== "new") fail(`the stored row was '${before[0].status}', not 'new'.`);
    else if (before[0].source_path !== NEED_WALK_SOURCE_PATH) fail("the stored row does not name the public form as its source.");
    else console.info(`[prod-qa-need-intake] READ BACK: one row, status new, source ${NEED_WALK_SOURCE_PATH} (id=${before[0].id.slice(0, 8)}…)`);
  }

  for (const row of before.filter((r) => r.status !== "rejected")) {
    const { error } = await admin.from(TABLE).update({ status: "rejected" }).eq("id", row.id).eq("contact_email", address);
    if (error) fail(`row ${row.id.slice(0, 8)}… not rejected (${error.code ?? "error"})`);
  }

  const after = await read();
  if (!after) return;
  const open = after.filter((r) => r.status !== "rejected");
  if (open.length > 0) return fail(`${open.length} synthetic row(s) are still not rejected.`);
  console.info(
    `[prod-qa-need-intake] CLOSED: ${after.length} synthetic row(s), all rejected. ` +
      "The row(s) remain in the table; the owner deletes them with docs/qa/need-intake-walk-cleanup.sql.",
  );
}

void main();
