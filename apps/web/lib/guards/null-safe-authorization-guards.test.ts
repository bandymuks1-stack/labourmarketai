import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD — FAIL-CLOSED (NULL-safe) AUTHORIZATION in SECURITY DEFINER functions.
 *
 * THE PATTERN THIS PREVENTS
 *   if not (a.created_by = uid or a.assignee_profile_id = uid or is_admin()) then <deny> end if;
 * plpgsql does not execute `IF <NULL>`. When `assignee_profile_id` is NULL and
 * no other term is TRUE the whole condition is `not (NULL)` = NULL, the deny
 * branch is SKIPPED and the caller is let in. (Production exposure:
 * update_work_task_v2, set_work_task_status_v2, link_journal_entry_to_task_v1,
 * add_work_task_dependency_v1, unlink_journal_entry_from_task_v1,
 * start_workflow_instance_v1, create_invitation_v1/v2 — fixed by
 * 20261002141500_work_task_authz_null_safe_v1.)
 *
 * THE RULE. Authorization is granted only when the expression is proven TRUE.
 * A negated guard that compares a column / variable to the caller (`= uid`,
 * `= auth.uid()`) must therefore be written one of three ways:
 *   if not coalesce((<expr>), false) then deny     -- preferred, uniform
 *   <col> is not distinct from uid                  -- null-safe comparison
 *   (<col> is not null and <col> = uid)             -- explicit
 *
 * HOW THE GUARD WORKS. For the LATEST definition of every SECURITY DEFINER
 * function under supabase/migrations it finds each `not ( ... )` segment that
 * contains `<operand> = uid|auth.uid()|v_uid` and fails when the operand has no
 * `<operand> is not null` in the same segment. A function is exempt ONLY by
 * being listed in AUDITED_NOT_EXPLOITABLE below, with the reason (the compared
 * column is NOT NULL, or every other term of the guard cannot be NULL and the
 * compared operand cannot be NULL). Entries must stay true: a stale entry (the
 * function no longer matches) also fails, so the list cannot rot.
 *
 * Static, secret-free, no database. The behavioural proof lives in
 * scripts/db-proof/work-task-authz-null-safe.sh (real PostgreSQL 16).
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const ROLLBACKS = join(REPO, "supabase", "rollbacks");
const FIX = "20261002141500_work_task_authz_null_safe_v1";

const lf = (s: string) => s.replace(/\r\n/g, "\n");

type Def = { name: string; key: string; file: string; secdef: boolean; body: string };

function extractDefs(sql: string, file: string): Def[] {
  const out: Def[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    let i = re.lastIndex;
    let depth = 1;
    while (depth > 0 && i < sql.length) {
      const c = sql[i++];
      if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    const args = sql.slice(re.lastIndex, i - 1);
    // top-level argument count (types never contain commas except numeric(p,s) — not used by these functions)
    const nargs = args.trim() === "" ? 0 : args.split(",").length;
    const after = sql.slice(i, i + 3000);
    const dm = /\bas\s+(\$[a-z_]*\$)/i.exec(after);
    if (!dm) continue;
    const header = after.slice(0, dm.index);
    const bodyStart = i + dm.index + dm[0].length;
    const bodyEnd = sql.indexOf(dm[1], bodyStart);
    if (bodyEnd < 0) continue;
    out.push({
      name: m[1],
      key: `${m[1]}/${nargs}`,
      file,
      secdef: /security\s+definer/i.test(header),
      body: sql.slice(bodyStart, bodyEnd),
    });
  }
  return out;
}

function latestDefs(before?: string): Map<string, Def> {
  const latest = new Map<string, Def>();
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    if (before && f >= before) break;
    for (const d of extractDefs(lf(readFileSync(join(MIGRATIONS, f), "utf8")), f)) {
      latest.set(d.key, d);
    }
  }
  return latest;
}

const stripComments = (body: string) =>
  body
    .split("\n")
    .map((l) => l.replace(/\s--\s.*$|^\s*--.*$/, ""))
    .join("\n");

const TERM = /(?:\b[a-z_]\w*\.)?([a-z_]\w*)\s*=\s*(?:auth\.uid\(\)|uid|v_uid)\b/gi;

/** Removes balanced `exists ( ... )` groups: an EXISTS predicate is never NULL. */
function removeExists(seg: string): string {
  let out = "";
  const re = /\bexists\s*\(/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    if (m.index < last) continue;
    let i = re.lastIndex;
    let depth = 1;
    while (depth > 0 && i < seg.length) {
      const ch = seg[i++];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    out += seg.slice(last, m.index) + "true";
    last = i;
    re.lastIndex = i;
  }
  return out + seg.slice(last);
}

/** Every negated segment `not ( ... )` holding an `<operand> = uid` with no `is not null` on that operand. */
function unsafeGuards(body: string): string[] {
  const text = stripComments(body);
  const found: string[] = [];
  const re = /\bnot\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let i = re.lastIndex;
    let depth = 1;
    while (depth > 0 && i < text.length) {
      const c = text[i++];
      if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    // `exists ( select ... where col = uid )` can never be NULL: drop those sub-queries before looking.
    const seg = removeExists(text.slice(re.lastIndex, i - 1));
    const ops: string[] = [];
    TERM.lastIndex = 0;
    let t: RegExpExecArray | null;
    while ((t = TERM.exec(seg))) ops.push(t[1]);
    const risky = ops.filter(
      (o) => !new RegExp(`\\b${o}\\s+is\\s+not\\s+null\\b`, "i").test(seg),
    );
    if (risky.length) found.push(`${[...new Set(risky)].join(",")} :: ${seg.replace(/\s+/g, " ").trim().slice(0, 120)}`);
  }
  return found;
}

/**
 * Functions whose remaining negated `= uid` guard was AUDITED and cannot be
 * NULL in practice. Key = `name/argcount`. Every entry states why. Adding an
 * entry is a security decision: the column must be NOT NULL in the schema or
 * every operand of the guard must be provably non-NULL.
 */
const AUDITED_NOT_EXPLOITABLE: Record<string, string> = {
  "add_work_task_dependency_v1/2":
    "BLOCKED-task guard: `(t.project_id is null and t.created_by = uid)` — created_by is NOT NULL and the other terms are boolean; the BLOCKER guard IS wrapped by 20261002141500.",
  "remove_work_task_dependency_v1/2":
    "`(t.project_id is null and t.created_by = uid)` — work_tasks.created_by is NOT NULL; other terms are boolean (exists()/is null).",
  "sync_employee_request_status_v1/1": "employee_requests.requester_profile_id is NOT NULL (20260817180000); other terms are boolean helpers.",
  "submit_finance_record_approval_v1/1": "finance_records.created_by is NOT NULL (20260711230000); finance_company_authority_v1 / is_admin are non-NULL booleans.",
  "sync_finance_record_approval_v1/1": "finance_records.created_by is NOT NULL (20260711230000); other terms non-NULL booleans.",
  "set_finance_record_trip_v1/2": "finance_records.created_by is NOT NULL (20260711230000); other terms non-NULL booleans.",
  "update_procurement_inquiry_v1/4": "procurement_inquiries.requester_profile_id is NOT NULL (20260817221000); other terms boolean.",
  "submit_procurement_inquiry_v1/1": "procurement_inquiries.requester_profile_id is NOT NULL (20260817221000); other terms boolean.",
  "add_procurement_offer_v1/5": "procurement_inquiries.requester_profile_id is NOT NULL (20260817221000); other terms boolean.",
  "set_procurement_status_v1/3": "requester_profile_id is NOT NULL and v_manage is a boolean assigned from non-NULL helpers (20260817221000).",
  "submit_procurement_approval_v1/1": "procurement_inquiries.requester_profile_id is NOT NULL (20260817221000); other terms boolean.",
  "sync_procurement_approval_v1/1": "procurement_inquiries.requester_profile_id is NOT NULL (20260817221000); other terms boolean.",
  "sync_business_trip_decision_v1/1": "business_trips.profile_id is NOT NULL (20260817222000); other terms boolean.",
  "complete_business_trip_v1/1": "business_trips.profile_id is NOT NULL (20260817222000); other terms boolean.",
  "cancel_business_trip_v1/1": "business_trips.profile_id is NOT NULL (20260817222000); other terms boolean.",
  "create_invitation_v2/14":
    "demand branch: `v_req_owner = uid` — customer_requests.profile_id is NOT NULL (verified live 2026-10-03); the ORG branch IS wrapped by 20261002141500.",
};

describe("null-safe authorization — the fix migration", () => {
  const UP = lf(readFileSync(join(MIGRATIONS, `${FIX}.sql`), "utf8"));
  const DOWN = lf(readFileSync(join(ROLLBACKS, `${FIX}.down.sql`), "utf8"));
  const FIXED = [
    "update_work_task_v2",
    "set_work_task_status_v2",
    "link_journal_entry_to_task_v1",
    "add_work_task_dependency_v1",
    "unlink_journal_entry_from_task_v1",
    "start_workflow_instance_v1",
    "create_invitation_v1",
    "create_invitation_v2",
  ];

  it("re-issues exactly the eight functions, each SECURITY DEFINER with a pinned search_path", () => {
    const defs = extractDefs(UP, `${FIX}.sql`);
    expect(defs.map((d) => d.name).sort()).toEqual([...FIXED].sort());
    for (const d of defs) expect(d.secdef).toBe(true);
    expect((UP.match(/set\s+search_path\s*=\s*public/gi) ?? []).length).toBe(8);
  });

  it("every fixed guard is the fail-closed shape and no bare `= uid` guard is left in the eight functions' fixed spots", () => {
    // 8 guards wrapped; none of them remains in the unsafe shape.
    const code = stripComments(UP);
    expect((code.match(/not coalesce\(\(/g) ?? []).length).toBe(8);
    expect((code.match(/\), false\) then/g) ?? []).length).toBe(8);
    for (const d of extractDefs(UP, `${FIX}.sql`)) {
      const bad = unsafeGuards(d.body).filter(
        (g) => !/created_by,?\s*::|v_req_owner/.test(g) || /assignee_profile_id|linked_by|v_org_owner/.test(g),
      );
      expect(bad, `${d.name} still has an unsafe guard`).toEqual([]);
    }
  });

  it("changes ONLY the guards: un-wrapping them reproduces the rollback bodies exactly", () => {
    const unwrap = (s: string) =>
      s.replace(/not coalesce\(\(/g, "not (").replace(/\), false\) then/g, ") then");
    const bodies = (sql: string) =>
      Object.fromEntries(extractDefs(sql, "x").map((d) => [d.key, d.body]));
    const up = bodies(UP);
    const down = bodies(DOWN);
    expect(Object.keys(up).sort()).toEqual(Object.keys(down).sort());
    for (const k of Object.keys(up)) {
      expect(unwrap(up[k]), k).toBe(down[k]);
    }
  });

  it("the rollback restores the PREVIOUS bodies verbatim (comment-insensitive vs the latest earlier migration)", () => {
    const prior = latestDefs(`${FIX}.sql`);
    const norm = (b: string) =>
      stripComments(b)
        .split("\n")
        .filter((l) => l.trim() !== "")
        .join("\n");
    for (const d of extractDefs(DOWN, "down")) {
      const p = prior.get(d.key);
      expect(p, `no prior definition of ${d.key}`).toBeDefined();
      expect(norm(d.body), d.key).toBe(norm(p!.body));
    }
  });

  it("grants are re-asserted identical for all eight: revoke public + anon, grant authenticated only", () => {
    const SIGS: Record<string, string> = {
      update_work_task_v2: "text, text, text, text, text, text",
      set_work_task_status_v2: "text, text",
      link_journal_entry_to_task_v1: "text, text",
      add_work_task_dependency_v1: "text, text",
      unlink_journal_entry_from_task_v1: "text, text",
      start_workflow_instance_v1: "text, text, jsonb, text",
      create_invitation_v1: "text, text, text, text, uuid, uuid, text, text, text, text",
      create_invitation_v2:
        "text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer",
    };
    for (const [n, sig] of Object.entries(SIGS)) {
      for (const sql of [UP, DOWN]) {
        expect(sql).toContain(`revoke all on function public.${n}(${sig}) from public;`);
        expect(sql).toContain(`revoke all on function public.${n}(${sig}) from anon;`);
        expect(sql).toContain(`grant execute on function public.${n}(${sig}) to authenticated;`);
        expect(sql).not.toMatch(new RegExp(`grant[^;]*${n}[^;]*\\bto\\s+(anon|public)\\b`, "i"));
      }
    }
  });

  it("touches no table, column, policy or data", () => {
    // top-level statements only: drop every dollar-quoted function body first
    const code = stripComments(UP).replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "");
    expect(code).not.toMatch(/\b(create|alter|drop)\s+(table|policy|index|trigger|type)\b/i);
    expect(code).not.toMatch(/\b(insert\s+into|delete\s+from|update\s+public\.|truncate)\b/i);
    expect(code).not.toMatch(/create\s+policy|alter\s+policy|enable\s+row\s+level/i);
  });

  it("is flagged for the human gate (auth-core): marker present, draft packet header present", () => {
    expect(UP).toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    expect(UP).toContain("needs-human-gate");
    expect(UP).toContain("DO NOT APPLY");
    expect(DOWN).not.toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });
});

describe("null-safe authorization — no SECURITY DEFINER function may regress to the NULL-unsafe guard", () => {
  const latest = latestDefs();
  const flagged = new Map<string, string[]>();
  for (const d of latest.values()) {
    if (!d.secdef) continue;
    const g = unsafeGuards(d.body);
    if (g.length) flagged.set(d.key, g);
  }

  it("scans a meaningful number of definitions (the scanner is not silently empty)", () => {
    expect([...latest.values()].filter((d) => d.secdef).length).toBeGreaterThan(300);
  });

  it("every flagged negated `= uid` guard is audited and allow-listed with a reason", () => {
    const unaudited = [...flagged.entries()]
      .filter(([k]) => !(k in AUDITED_NOT_EXPLOITABLE))
      .map(([k, g]) => `${k}  [defined in ${latest.get(k)!.file}]\n      ${g.join("\n      ")}`);
    expect(
      unaudited,
      "A SECURITY DEFINER function uses a negated guard that compares a possibly-NULL operand to the caller. " +
        "`if not (x = uid or ...)` lets the caller through when x is NULL. Wrap it: " +
        "`if not coalesce((<expr>), false) then deny` (or use IS NOT DISTINCT FROM). See the header of this test.",
    ).toEqual([]);
  });

  it("the allow-list holds no stale entry (each audited function is still flagged)", () => {
    for (const k of Object.keys(AUDITED_NOT_EXPLOITABLE)) {
      expect(flagged.has(k), `${k} is allow-listed but no longer matches — remove the entry`).toBe(true);
    }
  });

  it.skipIf(!process.env.AUTHZ_AUDIT)("prints the audit rows (AUTHZ_AUDIT=1)", () => {
    for (const [k, g] of [...flagged.entries()].sort()) {
      console.log(`${k} | ${latest.get(k)!.file} | ${g.join(" ## ")}`);
    }
  });
});
