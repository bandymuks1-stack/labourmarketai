import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PROFILE EMAIL IDENTITY BINDING v1 — the migration text, pinned.
 *
 * THE INVARIANT
 *   A USER-EDITABLE PROFILE FIELD MUST NOT BE AN AUTHORITATIVE
 *   ACCOUNT-IDENTITY BINDING FOR ORGANIZATION MEMBERSHIP.
 *
 * THE DEFECT (production, 2026-08-29). `profiles.email` was writable by its
 * owner through PostgREST (0004 table-level UPDATE grant, own-row policy, no
 * unique, no trigger), while membership_invite_v1 resolved the invitee by
 * `profiles.email … limit 1`, the two legacy accept RPCs read the CALLER's
 * identity from `profiles.email`, and the two invitee-side SELECT policies
 * keyed on it. One PATCH and a stranger's pending invitation was yours.
 *
 * WHAT THIS FILE GUARDS (static; the live behaviour is proven by
 * scripts/db-proof/profile-email-identity-binding.sql against the local stack):
 *   1. the trigger exists, fires BEFORE INSERT OR UPDATE OF email, refuses
 *      with 42501, exempts only JWT-less callers and admins, runs with
 *      invoker rights, and cannot be called directly;
 *   2. neither accept RPC reads profiles.email any more — both read the
 *      session's verified email (auth.jwt()), the model the canonical
 *      `invitations` family already uses;
 *   3. neither invitee-side policy subselects profiles.email any more;
 *   4. the migration touches no grant on any table, no auth-schema object,
 *      adds no UNIQUE to profiles, and asserts pre-apply integrity;
 *   5. the rollback exists and restores the 0036/0027/0025 bodies verbatim —
 *      and says out loud that it reopens the hole;
 *   6. no application code writes profiles.email (the API was the only path).
 * Every "must not contain" has a NEGATIVE CONTROL: the historical text it is
 * meant to reject is shown to be rejected.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const NAME = "20260829120000_profile_email_identity_binding_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${NAME}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`);
const PROOF = join(REPO, "scripts", "db-proof", "profile-email-identity-binding.sql");

const norm = (s: string): string => s.replace(/\r\n/g, "\n");
const stripComments = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const raw = norm(readFileSync(MIGRATION, "utf8"));
const sql = stripComments(raw);
const down = norm(readFileSync(ROLLBACK, "utf8"));

/** The body of one `create or replace function public.<name>(` block. */
function functionBody(src: string, name: string): string {
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    "i",
  );
  const m = re.exec(src);
  if (!m) throw new Error(`function ${name} not found`);
  return m[1];
}

/** The `create policy <name> … using (…)` text. */
function policy(src: string, name: string): string {
  const re = new RegExp(`create\\s+policy\\s+${name}\\b[\\s\\S]*?using\\s*\\(([\\s\\S]*?)\\)\\s*;`, "i");
  const m = re.exec(src);
  if (!m) throw new Error(`policy ${name} not found`);
  return m[1];
}

// The historical shapes this migration replaces — used as NEGATIVE CONTROLS.
const OLD_ACCEPT_READ = /from\s+public\.profiles\s+p[\s\S]{0,120}where\s+p\.id\s*=\s*uid/i;
const OLD_POLICY_READ = /select\s+email\s+from\s+public\.profiles\s+where\s+id\s*=\s*auth\.uid\(\)/i;
const JWT_EMAIL = /auth\.jwt\(\)\s*->>\s*'email'/;

describe("migration hygiene", () => {
  it("is human-gated, RED-classed, and names what the marker covers", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/);
    expect(raw).toMatch(/OWNER APPROVAL:/);
    expect(raw).toContain("CLASS: RED");
    for (const finding of [
      "create-trigger",
      "security-definer-function",
      "grant-or-revoke",
      "alter-drop-policy",
      "data-dml",
    ]) {
      expect(raw, `header must name ${finding}`).toContain(finding);
    }
  });

  it("carries the invariant in its own words", () => {
    expect(raw).toContain(
      "A USER-EDITABLE PROFILE FIELD MUST NOT BE AN AUTHORITATIVE",
    );
  });

  it("asserts pre-apply integrity, fail-closed, before changing anything", () => {
    const assertion = /do\s+\$\$[\s\S]*?is distinct from lower\(coalesce\(u\.email, ''\)\)[\s\S]*?raise\s+exception[\s\S]*?\$\$/i.exec(sql);
    expect(assertion, "the integrity DO block").not.toBeNull();
    const firstChange = sql.search(/create\s+or\s+replace\s+function/i);
    expect(assertion!.index).toBeLessThan(firstChange);
  });
});

describe("1. profiles.email stops being user-editable", () => {
  const fn = functionBody(sql, "enforce_profile_email_binding");

  it("installs a BEFORE INSERT OR UPDATE OF email trigger on public.profiles", () => {
    expect(sql).toMatch(
      /create\s+trigger\s+trg_profiles_email_binding\s+before\s+insert\s+or\s+update\s+of\s+email\s+on\s+public\.profiles\s+for\s+each\s+row\s+execute\s+function\s+public\.enforce_profile_email_binding\(\)/i,
    );
  });

  it("refuses with 42501 unless the new value is the session's verified email", () => {
    expect(fn).toMatch(JWT_EMAIL);
    expect(fn).toMatch(/raise\s+exception[\s\S]*?using\s+errcode\s*=\s*'42501'/i);
    expect(fn).toMatch(/lower\(coalesce\(new\.email, ''\)\)\s*<>\s*v_jwt_email/);
  });

  it("exempts exactly two callers: no JWT subject, and an existing admin", () => {
    expect(fn).toMatch(/if\s+auth\.uid\(\)\s+is\s+null\s+then\s+return\s+new/i);
    expect(fn).toMatch(/if\s+public\.is_admin\(\)\s+then\s+return\s+new/i);
    // and nothing else returns early except the unchanged-address no-op
    const earlyReturns = fn.match(/return\s+new/gi) ?? [];
    expect(earlyReturns).toHaveLength(4);
  });

  it("runs with invoker rights and is not callable by any client role", () => {
    const decl = /create\s+or\s+replace\s+function\s+public\.enforce_profile_email_binding\(\)[\s\S]*?as\s+\$\$/i.exec(sql)?.[0] ?? "";
    expect(decl).not.toMatch(/security\s+definer/i);
    expect(decl).toMatch(/set\s+search_path\s*=\s*public/i);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toMatch(
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.enforce_profile_email_binding\\(\\)\\s+from\\s+${role}\\s*;`, "i"),
      );
    }
  });

  it("NEGATIVE CONTROL — the trigger regex rejects a trigger that ignores INSERT or the email column", () => {
    const wrong = [
      "create trigger trg_profiles_email_binding before update on public.profiles for each row execute function public.enforce_profile_email_binding()",
      "create trigger trg_profiles_email_binding after insert or update of email on public.profiles for each row execute function public.enforce_profile_email_binding()",
    ];
    for (const w of wrong) {
      expect(w).not.toMatch(
        /create\s+trigger\s+trg_profiles_email_binding\s+before\s+insert\s+or\s+update\s+of\s+email\s+on\s+public\.profiles/i,
      );
    }
  });
});

describe("2. the accept RPCs take the caller's identity from the session", () => {
  for (const name of ["accept_company_worker_invitation", "accept_agency_worker_invitation"]) {
    const body = functionBody(sql, name);

    it(`${name} reads auth.jwt() email and never profiles.email`, () => {
      expect(body).toMatch(JWT_EMAIL);
      expect(body).not.toMatch(OLD_ACCEPT_READ);
      expect(body).not.toMatch(/profiles/i);
      // an email-less session matches nothing, it does not fall through
      expect(body).toMatch(/if\s+v_email\s+is\s+null\s+then\s+return\s+'no_invitation'/i);
    });

    it(`${name} keeps the 0036 contract: same outcomes, same link + audit writes`, () => {
      for (const outcome of ["'no_worker_profile'", "'no_invitation'", "'already_linked'", "'linked'"]) {
        expect(body).toContain(outcome);
      }
      expect(body).toMatch(/insert\s+into\s+public\.audit_logs/i);
      expect(sql).toMatch(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\(uuid\\)\\s+to\\s+authenticated`, "i"),
      );
    });
  }

  it("NEGATIVE CONTROL — the profiles-read detector fires on the 0036 body", () => {
    const old0036 = norm(
      readFileSync(join(REPO, "supabase", "migrations", "0036_accept_worker_invitation_rpc.sql"), "utf8"),
    );
    const oldBody = functionBody(stripComments(old0036), "accept_company_worker_invitation");
    expect(oldBody).toMatch(OLD_ACCEPT_READ);
    expect(oldBody).not.toMatch(JWT_EMAIL);
  });
});

describe("3. the invitee-side SELECT policies key on the session email", () => {
  for (const [name, ownerFn] of [
    ["company_worker_invitations_select", "owns_company"],
    ["agency_worker_invitations_select", "owns_agency"],
  ] as const) {
    it(`${name} keeps owner/admin arms and swaps the invitee arm to auth.jwt()`, () => {
      const using = policy(sql, name);
      expect(using).toContain(`public.${ownerFn}(`);
      expect(using).toContain("public.is_admin()");
      expect(using).toMatch(/lower\(invited_email\)\s*=\s*lower\(nullif\(auth\.jwt\(\)\s*->>\s*'email',\s*''\)\)/);
      expect(using).not.toMatch(OLD_POLICY_READ);
    });
  }

  it("NEGATIVE CONTROL — the subselect detector fires on the 0027 policy text", () => {
    const old0027 = stripComments(
      norm(readFileSync(join(REPO, "supabase", "migrations", "0027_company_workers.sql"), "utf8")),
    );
    expect(policy(old0027, "company_worker_invitations_select")).toMatch(OLD_POLICY_READ);
  });
});

describe("4. scope discipline — nothing loosened, nothing else touched", () => {
  it("changes no grant on any table and no auth-schema object", () => {
    expect(sql).not.toMatch(/\b(grant|revoke)\b[^;]*\bon\s+(table\s+)?public\.\w+\s+(to|from)\b/i);
    expect(sql).not.toMatch(/\bon\s+auth\./i);
    expect(sql).not.toMatch(/\balter\s+table\s+public\.profiles\b/i);
    expect(sql).not.toMatch(/\bunique\b/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
  });

  it("does not rewrite the invite-side lookups (they become safe because 1. holds)", () => {
    for (const name of ["membership_invite_v1", "invite_company_worker", "invite_agency_worker"]) {
      expect(sql).not.toMatch(new RegExp(`function\\s+public\\.${name}\\b`, "i"));
    }
  });

  it("NEGATIVE CONTROL — the table-grant detector fires on a real grant line", () => {
    expect("grant select, insert on public.pilot_events to authenticated;").toMatch(
      /\b(grant|revoke)\b[^;]*\bon\s+(table\s+)?public\.\w+\s+(to|from)\b/i,
    );
    expect("revoke all on function public.f() from public;").not.toMatch(
      /\b(grant|revoke)\b[^;]*\bon\s+(table\s+)?public\.\w+\s+(to|from)\b/i,
    );
  });
});

describe("5. rollback", () => {
  it("exists, drops the guard, restores the four historical bodies, and warns", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    expect(down).toMatch(/drop\s+trigger\s+if\s+exists\s+trg_profiles_email_binding\s+on\s+public\.profiles/i);
    expect(down).toMatch(/drop\s+function\s+if\s+exists\s+public\.enforce_profile_email_binding\(\)/i);
    const d = stripComments(down);
    for (const name of ["accept_company_worker_invitation", "accept_agency_worker_invitation"]) {
      expect(functionBody(d, name)).toMatch(OLD_ACCEPT_READ);
    }
    for (const name of ["company_worker_invitations_select", "agency_worker_invitations_select"]) {
      expect(policy(d, name)).toMatch(OLD_POLICY_READ);
    }
    expect(down).toMatch(/REOPENS the defect/);
  });
});

describe("6. no application path writes profiles.email", () => {
  it("no .update() on profiles carries an email field", () => {
    const roots = ["app", "components", "lib"].map((d) => join(WEB, d));
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) {
          if (e !== "node_modules") walk(p);
        } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) {
          const src = readFileSync(p, "utf8");
          const re = /from\(\s*["']profiles["']\s*\)[\s\S]{0,300}?\.update\(\s*\{[\s\S]{0,200}?\bemail\s*:/g;
          if (re.test(src)) offenders.push(p);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });

  it("NEGATIVE CONTROL — the detector fires on a hypothetical email write", () => {
    const bad = 'await supabase.from("profiles").update({ email: next }).eq("id", user.id)';
    expect(bad).toMatch(/from\(\s*["']profiles["']\s*\)[\s\S]{0,300}?\.update\(\s*\{[\s\S]{0,200}?\bemail\s*:/);
  });
});

describe("7. the live proof exists and is rolled back", () => {
  it("the db-proof script applies the migration verbatim and ends with ROLLBACK", () => {
    const proof = norm(readFileSync(PROOF, "utf8"));
    // the wrapper feeds the migration in as a begin/commit-stripped copy
    expect(proof).toContain("\\i :migration_copy");
    const wrapper = norm(readFileSync(join(REPO, "scripts", "db-proof", "profile-email-identity-binding.sh"), "utf8"));
    expect(wrapper).toContain("supabase/migrations/$NAME.sql");
    expect(wrapper).toContain(`NAME="${NAME}"`);
    expect(wrapper).toContain("--single-transaction");
    expect(proof.trim()).toMatch(/rollback;\s*\\echo[^\n]*ROLLED BACK[^\n]*$/i);
    // both the attack and the legitimate flows are probed under `authenticated`
    expect(proof.match(/set local role authenticated/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(proof).toMatch(/refusing to run/);
  });
});
