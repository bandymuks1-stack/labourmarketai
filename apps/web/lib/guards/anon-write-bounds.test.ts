import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ANON_SECDEF_ALLOWLIST } from "@/lib/security/anon-secdef-allowlist";

/**
 * ANON WRITE BOUNDS v1 — the migration text, pinned.
 *
 * OBJECTIVE: public intake must remain usable without allowing anonymous
 * clients to create unbounded owner cost.
 *
 * THE DEFECT (Phase-1 audit C-2). Three anonymous write paths — pilot_events
 * (anon INSERT), waitlist (anon INSERT) and submit_company_need_public_v1
 * (anon-executable SECURITY DEFINER write) — were bounded only by the app's
 * per-instance in-memory windows, which a direct PostgREST call with the
 * public key never touches. pilot_events.metadata had no size bound at all.
 *
 * WHAT THIS FILE GUARDS (static; scripts/db-proof/anon-write-bounds.sh proves
 * the live behaviour as the `anon` role against the local stack):
 *   1. pilot_events: metadata is an object ≤ 4096 bytes; a BEFORE INSERT
 *      ceiling (300 anonymous rows/min platform-wide, 120/min per profile),
 *      running as DEFINER because the table's SELECT policy is admin-only;
 *   2. waitlist: email/source/locale CHECKs mirroring the API route's zod
 *      schema; a 60/hour ceiling;
 *   3. submit_company_need_public_v1: duplicate suppression (24 h), 30/hour
 *      platform-wide, 3 per contact email per 24 h — placed AFTER validation
 *      and BEFORE the insert — plus table CHECKs mirroring every field cap;
 *   4. the surfaces stay open: no anon grant or policy is touched;
 *   5. the app maps the ceiling errcode to its existing honest state;
 *   6. the allowlist stops declaring the GAP and describes the control;
 *   7. the rollback exists, restores the 20260707120000 body, and warns.
 * Every "must not contain" has a NEGATIVE CONTROL.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const NAME = "20260829130000_anon_write_bounds_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${NAME}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`);
const ORIGINAL = join(REPO, "supabase", "migrations", "20260707120000_company_need_public_intake.sql");

const norm = (s: string): string => s.replace(/\r\n/g, "\n");
const stripComments = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const raw = norm(readFileSync(MIGRATION, "utf8"));
const sql = stripComments(raw);
const down = norm(readFileSync(ROLLBACK, "utf8"));
const original = stripComments(norm(readFileSync(ORIGINAL, "utf8")));

function functionBody(src: string, name: string): string {
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    "i",
  );
  const m = re.exec(src);
  if (!m) throw new Error(`function ${name} not found`);
  return m[1];
}

const CEILING = /raise\s+exception\s+'intake_rate_limited'\s+using\s+errcode\s*=\s*'P0004'/i;

describe("migration hygiene", () => {
  it("is human-gated, RED-classed, and names what the marker covers", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/);
    expect(raw).toMatch(/OWNER APPROVAL:/);
    expect(raw).toContain("CLASS: RED");
    for (const f of ["create-trigger", "security-definer-function", "grant-or-revoke", "rls-to-anon"]) {
      expect(raw, `header must name ${f}`).toContain(f);
    }
    expect(raw).toContain("PUBLIC INTAKE MUST REMAIN USABLE");
  });
});

describe("1. pilot_events — bounded payload, bounded burst", () => {
  it("metadata must be a JSON object of at most 4096 bytes", () => {
    expect(sql).toMatch(
      /alter\s+table\s+public\.pilot_events\s+add\s+constraint\s+pilot_events_metadata_bounded\s+check\s*\(\s*jsonb_typeof\(metadata\)\s*=\s*'object'\s+and\s+pg_column_size\(metadata\)\s*<=\s*4096\s*\)/i,
    );
  });

  it("a BEFORE INSERT ceiling counts anonymous rows per minute and per-profile rows per minute", () => {
    const fn = functionBody(sql, "pilot_events_ceiling");
    expect(fn).toMatch(/profile_id\s+is\s+null\s+and\s+created_at\s*>\s*now\(\)\s*-\s*interval\s+'1 minute'/i);
    expect(fn).toMatch(/if\s+v_n\s*>=\s*300\s+then/i);
    expect(fn).toMatch(/profile_id\s*=\s*new\.profile_id\s+and\s+created_at\s*>\s*now\(\)\s*-\s*interval\s+'1 minute'/i);
    expect(fn).toMatch(/if\s+v_n\s*>=\s*120\s+then/i);
    expect(fn).toMatch(/using\s+errcode\s*=\s*'P0004'/i);
    expect(sql).toMatch(
      /create\s+trigger\s+trg_pilot_events_ceiling\s+before\s+insert\s+on\s+public\.pilot_events\s+for\s+each\s+row\s+execute\s+function\s+public\.pilot_events_ceiling\(\)/i,
    );
  });

  it("the ceiling helper is SECURITY DEFINER (admin-only SELECT would count 0) and not client-callable", () => {
    const decl = /create\s+or\s+replace\s+function\s+public\.pilot_events_ceiling\(\)[\s\S]*?as\s+\$\$/i.exec(sql)?.[0] ?? "";
    expect(decl).toMatch(/security\s+definer/i);
    expect(decl).toMatch(/set\s+search_path\s*=\s*public/i);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.pilot_events_ceiling\\(\\)\\s+from\\s+${role}\\s*;`, "i"));
    }
  });
});

describe("2. waitlist — shape CHECKs and an hourly ceiling", () => {
  it("email, source and locale are bounded the way the API route bounds them", () => {
    expect(sql).toMatch(/add\s+constraint\s+waitlist_email_bounded\s+check\s*\(\s*char_length\(email\)\s*<=\s*254\s+and\s+email\s*~\s*'/i);
    expect(sql).toMatch(/add\s+constraint\s+waitlist_source_bounded\s+check\s*\(\s*char_length\(source\)\s*<=\s*60\s*\)/i);
    expect(sql).toMatch(/add\s+constraint\s+waitlist_locale_bounded\s+check\s*\(\s*locale\s+is\s+null\s+or\s+char_length\(locale\)\s*<=\s*16\s*\)/i);
  });

  it("a BEFORE INSERT ceiling of 60 signups per hour", () => {
    const fn = functionBody(sql, "waitlist_ceiling");
    expect(fn).toMatch(/created_at\s*>\s*now\(\)\s*-\s*interval\s+'1 hour'/i);
    expect(fn).toMatch(/if\s+v_n\s*>=\s*60\s+then/i);
    expect(sql).toMatch(/create\s+trigger\s+trg_waitlist_ceiling\s+before\s+insert\s+on\s+public\.waitlist/i);
  });
});

describe("3. submit_company_need_public_v1 — bounded inside the definer", () => {
  const body = functionBody(sql, "submit_company_need_public_v1");

  it("keeps every validation of the original body, byte for byte", () => {
    const originalBody = functionBody(original, "submit_company_need_public_v1");
    // From the first validation to the insert: the whole original validation
    // block (comments stripped) is contained verbatim in the new body. The
    // declare section differs only by the added `v_n int;`.
    const start = originalBody.indexOf("if v_company is null");
    const end = originalBody.indexOf("insert into public.company_need_public_intakes");
    const validation = originalBody.slice(start, end).trim();
    expect(validation.length).toBeGreaterThan(1500);
    expect(body).toContain(validation);
    expect(body).toMatch(/v_n\s+int;/);
  });

  it("places the bounds AFTER validation and BEFORE the insert", () => {
    const lastValidation = body.lastIndexOf("source_path_too_long");
    const dedupe = body.indexOf("md5(description) = md5(v_desc)");
    const insertAt = body.indexOf("insert into public.company_need_public_intakes");
    expect(dedupe).toBeGreaterThan(lastValidation);
    expect(insertAt).toBeGreaterThan(dedupe);
  });

  it("an exact resubmission within 24 h returns the earlier id and writes nothing", () => {
    expect(body).toMatch(/created_at\s*>\s*now\(\)\s*-\s*interval\s+'24 hours'[\s\S]*?lower\(company_name\)\s*=\s*lower\(v_company\)[\s\S]*?md5\(description\)\s*=\s*md5\(v_desc\)[\s\S]*?coalesce\(lower\(contact_email\),\s*''\)\s*=\s*coalesce\(lower\(v_email\),\s*''\)/i);
    expect(body).toMatch(/if\s+v_id\s+is\s+not\s+null\s+then\s+return\s+v_id;/i);
  });

  it("30 per hour platform-wide and 3 per contact email per 24 h, both errcode P0004", () => {
    expect(body).toMatch(/interval\s+'1 hour'[\s\S]{0,80}?if\s+v_n\s*>=\s*30\s+then/i);
    expect(body).toMatch(/lower\(contact_email\)\s*=\s*lower\(v_email\)[\s\S]*?interval\s+'24 hours'[\s\S]{0,80}?if\s+v_n\s*>=\s*3\s+then/i);
    expect(body.match(CEILING)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect((body.match(/errcode\s*=\s*'P0004'/gi) ?? []).length).toBe(2);
  });

  it("table CHECKs mirror every per-field ceiling of the function", () => {
    for (const [col, n] of [
      ["company_name", 200], ["description", 8000], ["contact_name", 160], ["contact_email", 254],
      ["contact_phone", 40], ["city_or_region", 160], ["sector", 200], ["start_window", 40],
      ["expected_duration", 120], ["languages", 200], ["source_path", 200],
    ] as const) {
      expect(sql, `${col} <= ${n}`).toMatch(new RegExp(`char_length\\(${col}\\)\\s*<=\\s*${n}\\b`, "i"));
    }
    expect(sql).toMatch(/headcount\s+between\s+1\s+and\s+100000/i);
    expect(sql).toMatch(/create\s+index\s+if\s+not\s+exists\s+cnpi_created_at_idx/i);
  });

  it("ACLs are re-stated exactly as 20260707120000: anon + authenticated execute, nothing on the table", () => {
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.submit_company_need_public_v1\([\s\S]*?\)\s+to\s+anon,\s*authenticated/i);
    expect(sql).not.toMatch(/grant\b[^;]*\bon\s+(table\s+)?public\.company_need_public_intakes\b/i);
  });
});

describe("4. the surfaces stay open — nothing narrowed", () => {
  it("touches no anon grant, no policy, no DROP, no auth object", () => {
    expect(sql).not.toMatch(/\b(grant|revoke)\b[^;]*\bon\s+(table\s+)?public\.\w+\s+(to|from)\b/i);
    expect(sql).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
    // `drop trigger if exists` for the two triggers THIS file creates is the
    // idempotent-recreate idiom; every other DROP is forbidden.
    expect(sql).not.toMatch(/\bdrop\s+(table|column|function|policy|constraint|index)\b/i);
    const drops = sql.match(/\bdrop\s+trigger\s+if\s+exists\s+(\w+)/gi) ?? [];
    expect(drops.map((d) => d.split(/\s+/).pop())).toEqual(["trg_pilot_events_ceiling", "trg_waitlist_ceiling"]);
    expect(sql).not.toMatch(/\bon\s+auth\./i);
    expect(sql).not.toMatch(/\bdisable\s+row\s+level\s+security\b/i);
  });

  it("NEGATIVE CONTROL — the same detectors fire on the shapes they forbid", () => {
    expect("revoke insert on public.pilot_events from anon;").toMatch(/\b(grant|revoke)\b[^;]*\bon\s+(table\s+)?public\.\w+\s+(to|from)\b/i);
    expect("drop policy waitlist_insert_anon on public.waitlist;").toMatch(/\b(create|alter|drop)\s+policy\b/i);
  });
});

describe("5. the app maps the DB ceiling to its existing honest state", () => {
  const helper = norm(readFileSync(join(WEB, "lib", "staffing", "company-need-public-intake.ts"), "utf8"));

  it("P0004 → rate_limited (prepared, not persisted), never a bare error", () => {
    expect(helper).toMatch(/const RPC_RATE_LIMITED = "P0004";/);
    expect(helper).toMatch(/error\.code === RPC_RATE_LIMITED[\s\S]{0,80}?code: "rate_limited"/);
    // the RPC validation mapping is untouched and still precedes the ceiling mapping
    expect(helper.indexOf("error.code === RPC_VALIDATION")).toBeLessThan(
      helper.indexOf("error.code === RPC_RATE_LIMITED"),
    );
  });

  it("NEGATIVE CONTROL — a helper without the mapping is detectable", () => {
    const without = helper.replace(/\s*if \(error\.code === RPC_RATE_LIMITED\) \{[\s\S]*?\}\n/, "\n");
    expect(without).not.toMatch(/error\.code === RPC_RATE_LIMITED[\s\S]{0,80}?code: "rate_limited"/);
  });
});

describe("6. the allowlist describes the control instead of the gap", () => {
  const entry = ANON_SECDEF_ALLOWLIST.find((f) => f.name === "submit_company_need_public_v1");

  it("names the three DB-side bounds and still declares what is NOT enforced", () => {
    expect(entry).toBeDefined();
    const text = entry!.abuseControls;
    expect(text).toMatch(/30 intakes per hour/);
    expect(text).toMatch(/3 per 24 h/);
    expect(text).toMatch(/exact-duplicate/);
    expect(text).toMatch(/P0004/);
    expect(text).toMatch(/NO per-IP throttle/);
    expect(text).not.toMatch(/^GAP —/);
  });
});

describe("7. rollback", () => {
  it("exists, drops everything the migration added, restores the 20260707120000 body, and warns", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    for (const obj of [
      /drop\s+trigger\s+if\s+exists\s+trg_pilot_events_ceiling/i,
      /drop\s+function\s+if\s+exists\s+public\.pilot_events_ceiling\(\)/i,
      /drop\s+constraint\s+if\s+exists\s+pilot_events_metadata_bounded/i,
      /drop\s+trigger\s+if\s+exists\s+trg_waitlist_ceiling/i,
      /drop\s+constraint\s+if\s+exists\s+waitlist_email_bounded/i,
      /drop\s+constraint\s+if\s+exists\s+cnpi_text_bounded/i,
      /drop\s+index\s+if\s+exists\s+public\.cnpi_created_at_idx/i,
    ]) {
      expect(down).toMatch(obj);
    }
    const restored = functionBody(stripComments(down), "submit_company_need_public_v1");
    const originalBody = functionBody(original, "submit_company_need_public_v1");
    expect(restored.trim()).toBe(originalBody.trim());
    expect(down).toMatch(/REOPENS the gap/);
  });
});

describe("8. the live proof exists, runs as anon, and is rolled back", () => {
  it("probes every surface as the anon role and ends with ROLLBACK", () => {
    const proof = norm(readFileSync(join(REPO, "scripts", "db-proof", "anon-write-bounds.sql"), "utf8"));
    expect(proof).toContain("set local role anon;");
    expect(proof).toContain("public.pilot_events");
    expect(proof).toContain("public.waitlist");
    expect(proof).toContain("submit_company_need_public_v1(");
    expect(proof.trim()).toMatch(/rollback;\s*\\echo[^\n]*ROLLED BACK[^\n]*$/i);
    const wrapper = norm(readFileSync(join(REPO, "scripts", "db-proof", "anon-write-bounds.sh"), "utf8"));
    expect(wrapper).toContain(`NAME="${NAME}"`);
    expect(wrapper).toContain("--single-transaction");
  });
});
