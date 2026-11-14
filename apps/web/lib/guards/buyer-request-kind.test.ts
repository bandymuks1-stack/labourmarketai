import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The buyer form's RPC (0028) predates `kind` and `original_language`, so a
 * buyer request was stored with neither (Swedish employer audit CL-3, RED
 * follow-up). v2 writes kind 'buyer_request' (the kind the worker board's
 * allow-list reads; NOT 'customer_request', which is the help/privacy intake
 * the board excludes) and the UI language, on insert only. The app calls v2
 * and falls back to v1 until v2 is applied. The SQL itself is proven on PG16
 * by scripts/db-proof/save-customer-request-v2.sh.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(...p), "utf8").replace(/\r\n/g, "\n");
const NAME = "20261112120000_save_customer_request_v2";

describe("a buyer request records its kind and language", () => {
  it("the app calls v2 with the request's language and falls back to v1", () => {
    const src = read(WEB, "lib", "buyer", "customer-requests.ts");
    const v2 = src.indexOf('rpc("save_customer_request_v2"');
    const v1 = src.indexOf('rpc("save_customer_request", args)');
    expect(v2).toBeGreaterThan(-1);
    expect(v1).toBeGreaterThan(v2);
    expect(src.slice(v2, v1)).toContain("p_original_language: await demandWrittenLanguage()");
    expect(src.slice(v2, v1)).toMatch(/\[RPC_NOT_FOUND_CODE, "PGRST202"\]\.includes/);
  });

  it("v2 kinds a request once submitted, keeps drafts NULL (one draft per kind), language on insert only; v1 untouched", () => {
    const sql = read(REPO, "supabase", "migrations", `${NAME}.sql`).replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("create or replace function public.save_customer_request_v2(");
    expect(sql).not.toMatch(/function public\.save_customer_request\(/);
    expect(sql).toContain("case when cleaned_status = 'draft' then null else 'buyer_request' end,");
    expect(sql).not.toContain("'customer_request'\n");
    const update = sql.slice(sql.indexOf("update public.customer_requests set"));
    expect(update).toMatch(/when kind is null and cleaned_status <> 'draft' then 'buyer_request'\s+else kind/);
    expect(update).not.toMatch(/original_language/);
    expect(sql).toMatch(/revoke all on function public\.save_customer_request_v2\([^)]*\) from public, anon;/);
  });

  it("the rollback drops v2 only", () => {
    const down = read(REPO, "supabase", "rollbacks", `${NAME}.down.sql`);
    expect(down).toContain("drop function if exists public.save_customer_request_v2(");
    expect(down).not.toMatch(/drop function if exists public\.save_customer_request\(/);
  });
});
